// The editor's shared state and actions. Module-level refs make this a
// singleton "store": every component that imports it sees the same state.
// (Pinia is the official store library, worth adopting once this grows.)
import { useDebounceFn, useEventListener } from '@vueuse/core'
import { computed, ref, shallowRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import { restore, sameSnapshot, type Snapshot, snapshot } from '@/lib/history'
import { t } from '@/lib/i18n'
import type { Calendar, Line, Model, Station, TestCase, Trip } from '@/lib/model'
import * as M from '@/lib/model'
import * as storage from '@/lib/storage'
import { confirmDialog } from './useConfirm'

// ---- state ----------------------------------------------------------------------

// the open test case and where it is saved; useProject.ts opens the real one on start
export const tc = ref<TestCase>(M.defaultTestCase())
export const activeProject = ref('')
export const activeId = ref('') // file id within the project
export const otherNames = ref<string[]>([]) // names of the project's other files (kept by useProject)
export const tab = ref<'arrange' | 'expected'>('arrange') // which model the map + Model panel edit
// the selected stations' ids (in the model being edited); replaced, never changed in place
export const selection = shallowRef<ReadonlySet<number>>(new Set())
export const pickLineId = ref<number | null>(null) // line that map clicks append stops to
export const loadCount = ref(0) // bumped on every load, so the map can re-fit

export const editableModel = computed<Model>(() =>
  tab.value === 'expected' ? tc.value.expected.model : tc.value.arrange)
export const canEdit = computed(() => !(tab.value === 'expected' && tc.value.expected.type === 'exception'))
export const problems = computed(() => {
  const list = M.validate(tc.value)
  if (otherNames.value.some(n => n.toLowerCase() === tc.value.name.toLowerCase()))
    list.unshift({ level: 'warning', text: t('v.dupFileName', { name: tc.value.name }) })
  return list
})
export const errorCount = computed(() => problems.value.filter(p => p.level === 'error').length)
export const pickLine = computed(() => editableModel.value.lines.find(l => l.id === pickLineId.value) ?? null)

// only these ids; or add them, or toggle each (Shift / Ctrl / Cmd + click)
export function select(ids: Iterable<number>, how: 'only' | 'add' | 'toggle' = 'only') {
  const next = new Set(how === 'only' ? [] : selection.value)
  for (const id of ids) {
    if (how === 'toggle' && next.has(id)) next.delete(id)
    else next.add(id)
  }
  selection.value = next
}
export function clearSelection() {
  if (selection.value.size) selection.value = new Set()
}

// ---- undo history + autosave ---------------------------------------------------------
// Steps share unchanged pieces (lib/history.ts). Edits are committed 300 ms after
// they stop, so a burst of typing becomes a single undo step.

const CAPACITY = 100
const past = shallowRef<Snapshot[]>([]) // its last step is the state committed last
const future = shallowRef<Snapshot[]>([])
const changed = ref(false) // edited since the last step
const last = () => past.value[past.value.length - 1]

// Any edit sets `changed`. A test case put in place by undo, redo or opening a
// file (`quiet`) doesn't count; edits to it afterwards do (same object then).
let quiet: TestCase | null = null
const commitSoon = useDebounceFn(() => commit(), 300)
watch(tc, (now, before) => {
  if (now !== before && now === quiet) return
  changed.value = true
  commitSoon()
}, { deep: true })

function setQuietly(next: TestCase) {
  quiet = next
  tc.value = next
}

// a step for the current state, unless it's the last one again
function record() {
  changed.value = false
  const step = snapshot(tc.value, last())
  if (last() && sameSnapshot(step, last())) return false
  past.value = [...past.value, step].slice(-CAPACITY - 1)
  future.value = []
  return true
}

let saveFailed = false
function saved(ok: boolean) {
  // deferred: the first save runs before the toaster is mounted
  if (!ok && !saveFailed) setTimeout(() => toast.error(t('toast.saveFailed'), { duration: Infinity, closeButton: true }))
  saveFailed = !ok
}
// a background write failing (this file's or any other) counts as a failed save
storage.onWriteFailed(() => saved(false))

function persist() {
  if (activeId.value) saved(storage.writeFile(activeProject.value, activeId.value, M.toJSON(tc.value, 0)))
}

function commit() {
  if (changed.value && record()) persist()
}
// the last edit before a reload or closing the tab is still within the debounce
useEventListener('pagehide', commit)

// Discrete interactions (clicks, select/checkbox changes, the click ending a
// station drag) are their own undo step right away, so quick successive
// actions don't merge. setTimeout runs after the handlers, including ones that
// awaited a confirm dialog.
if (typeof document !== 'undefined')
  for (const type of ['click', 'change'])
    document.addEventListener(type, () => setTimeout(commit), true)

// a pending (not yet committed) edit is undoable too
export const canUndo = computed(() => past.value.length > 1 || changed.value)
export const canRedo = computed(() => future.value.length > 0 && !changed.value)

export function undo() {
  commit()
  if (past.value.length < 2) return
  future.value = [last(), ...future.value]
  past.value = past.value.slice(0, -1)
  setQuietly(restore(last()))
  clearSelection()
  persist()
}

export function redo() {
  if (!canRedo.value) return
  const [next, ...rest] = future.value
  past.value = [...past.value, next]
  future.value = rest
  setQuietly(restore(next))
  clearSelection()
  persist()
}

// ---- actions --------------------------------------------------------------------------

export function setTab(next: 'arrange' | 'expected') {
  if (tab.value === next) return
  tab.value = next
  clearSelection()
  pickLineId.value = null
}

// Opens a project file; each file has its own undo history, starting here.
// Refuses (false) while the open file can't be saved, which would lose it: after a
// failed save it's tried once more first (space may have been freed since).
// Blank activeId first to leave a file without saving it (it is being deleted).
export function openTestCase(project: string, id: string, next: TestCase): boolean {
  commit() // saves the file being left
  if (saveFailed && activeId.value) saved(storage.writeFile(activeProject.value, activeId.value, M.toJSON(tc.value, 0)))
  if (saveFailed && activeId.value) {
    toast.error(t('toast.saveFailed'))
    return false
  }
  activeProject.value = project
  activeId.value = id
  storage.setActiveProjectId(project)
  storage.setActiveFileId(project, id)
  setQuietly(next)
  tab.value = 'arrange'
  clearSelection()
  pickLineId.value = null
  loadCount.value++
  past.value = [snapshot(next)]
  future.value = []
  changed.value = false
  persist()
  return true
}

// a newer version saved elsewhere (another browser tab): undoable, like an edit
export function reloadTestCase(next: TestCase) {
  if (changed.value) record() // without saving: storage already has their version
  setQuietly(next)
  clearSelection()
  pickLineId.value = null
  changed.value = true
  record()
}

// false (with a toast) when a list already holds as many as the editor handles
export function hasRoom(n: number, what: M.CountLimit | 'stopsPerLine'): boolean {
  if (n < M.LIMITS[what]) return true
  toast.error(t('toast.limitReached', { max: M.LIMITS[what], what: t('count.' + what) }))
  return false
}

export const hasRoomForStop = (model: Model, line: Line) =>
  hasRoom(line.stops.length, 'stopsPerLine') && hasRoom(M.stopCount(model), 'stops')

export function addStation(x: number, y: number) {
  const model = editableModel.value
  if (!hasRoom(model.stations.length, 'stations')) return
  const id = M.nextId(model.stations)
  model.stations.push(M.makeStation(id, M.nextStationName(model.stations), x, y))
  select([id])
}

// a map click: either appends a stop (pick mode) or selects the station
export function clickStation(id: number) {
  if (!pickLine.value) select([id])
  else if (hasRoomForStop(editableModel.value, pickLine.value)) M.appendStop(pickLine.value, id)
}

// moves the selected stations by dx, dy meters (rounded to 0.01 m, the finest grid)
export function moveSelection(dx: number, dy: number) {
  const round = (v: number) => Math.round(v * 100) / 100
  for (const s of editableModel.value.stations)
    if (selection.value.has(s.id)) try { M.setStationXY(s, round(s.x + dx), round(s.y + dy)) } catch { /* latitude at a pole */ }
}

// deletes the stations and their stops, asking first if lines stop at them
export async function deleteStations(model: Model, stations: Station[]) {
  if (stations.length === 0) return
  const ids = new Set(stations.map(s => s.id))
  const uses = model.lines.reduce((n, l) => n + l.stops.filter(s => ids.has(s.stationId)).length, 0)
  const [one] = stations
  const question = stations.length === 1
    ? t('dlg.deleteStation', { name: one.name, id: one.id, n: uses })
    : t('dlg.deleteStations', { count: stations.length, n: uses })
  if (uses > 0 && !await confirmDialog(question)) return
  for (const line of model.lines)
    if (line.stops.some(s => ids.has(s.stationId))) line.stops = line.stops.filter(s => !ids.has(s.stationId))
  model.stations = model.stations.filter(s => !ids.has(s.id))
  selection.value = new Set([...selection.value].filter(id => !ids.has(id)))
}
export const deleteStation = (model: Model, station: Station) => deleteStations(model, [station])

export async function deleteLine(model: Model, line: Line) {
  const uses = model.trips.filter(trip => trip.line === line.id).length
  if (uses > 0 && !await confirmDialog(t('dlg.deleteLine', { name: line.name, id: line.id, n: uses })))
    return
  model.trips = model.trips.filter(trip => trip.line !== line.id)
  model.lines.splice(model.lines.indexOf(line), 1)
}

export function remove<T>(list: T[], item: T) {
  list.splice(list.indexOf(item), 1)
}

// ID changes keep references intact; they return false (and toast) when the ID is taken.

export function changeStationId(model: Model, station: Station, newId: number): boolean {
  if (newId === station.id) return true
  if (model.stations.some(s => s !== station && s.id === newId)) {
    toast.error(t('toast.idTakenStation', { id: newId }))
    return false
  }
  for (const line of model.lines)
    for (const stop of line.stops)
      if (stop.stationId === station.id) stop.stationId = newId
  if (selection.value.has(station.id)) selection.value = new Set([...selection.value].map(id => id === station.id ? newId : id))
  station.id = newId
  return true
}

export function changeLineId(model: Model, line: Line, newId: number): boolean {
  if (newId === line.id) return true
  if (model.lines.some(l => l !== line && l.id === newId)) {
    toast.error(t('toast.idTakenLine', { id: newId }))
    return false
  }
  for (const trip of model.trips)
    if (trip.line === line.id) trip.line = newId
  if (pickLineId.value === line.id) pickLineId.value = newId
  line.id = newId
  return true
}

export function changeCalendarId(model: Model, calendar: Calendar, newId: number): boolean {
  if (newId === calendar.id) return true
  if (model.calendars.some(c => c !== calendar && c.id === newId)) {
    toast.error(t('toast.idTakenCalendar', { id: newId }))
    return false
  }
  for (const trip of model.trips)
    if (trip.service === calendar.id) trip.service = newId
  calendar.id = newId
  return true
}

// the add functions return the new item's id (none at a limit)
export function addLine(model: Model) {
  if (!hasRoom(model.lines.length, 'lines')) return
  const id = M.nextId(model.lines)
  model.lines.push({ id, name: 'L' + id, shortName: 'L' + id, color: M.LINE_COLORS[(id - 1) % M.LINE_COLORS.length], type: 1, stops: [] })
  return id
}

export function addCalendar(model: Model) {
  if (!hasRoom(model.calendars.length, 'calendars')) return
  const id = M.nextId(model.calendars)
  model.calendars.push({ id, start: '2025-01-01', end: '2025-12-31', availability: [1, 1, 1, 1, 1, 1, 1] })
  return id
}

// the expected model may borrow the Arrange calendars when it has none
export function calendarsFor(model: Model): Calendar[] {
  return model.calendars.length > 0 ? model.calendars : tc.value.arrange.calendars
}

export function addTrip(model: Model) {
  if (!hasRoom(model.trips.length, 'trips')) return
  const trip: Trip = { id: M.nextId(model.trips), line: model.lines[0]?.id ?? 1, service: calendarsFor(model)[0]?.id ?? 1 }
  model.trips.push(trip)
  return trip.id
}

// replaces the model of one tab (e.g. with routes imported from a GTFS feed); undoable
export function replaceModel(target: 'arrange' | 'expected', model: Model) {
  if (target === 'expected') {
    tc.value.expected.type = 'model'
    tc.value.expected.model = model
  } else {
    tc.value.arrange = model
  }
  tab.value = target
  clearSelection()
  pickLineId.value = null
  loadCount.value++ // the map re-fits to the new stations
  commit()
}
