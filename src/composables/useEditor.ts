// The editor's shared state and actions. Module-level refs make this a
// singleton "store": every component that imports it sees the same state.
// (Pinia is the official store library, worth adopting once this grows.)
import { useManualRefHistory, watchDebounced } from '@vueuse/core'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { t } from '@/lib/i18n'
import type { Calendar, Line, Model, Station, TestCase, Trip } from '@/lib/model'
import * as M from '@/lib/model'
import { confirmDialog } from './useConfirm'

const AUTOSAVE_KEY = 'gtfs-test-editor-vue-autosave'

function restore(): TestCase {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY)
    if (saved) return M.fromJSON(saved)
  } catch { /* corrupted or unavailable */ }
  return M.defaultTestCase()
}

// ---- state ----------------------------------------------------------------------

export const tc = ref<TestCase>(restore())
export const tab = ref<'arrange' | 'expected'>('arrange') // which model the map + Model panel edit
export const selection = ref<number | null>(null) // selected station id
export const pickLineId = ref<number | null>(null) // line that map clicks append stops to
export const loadCount = ref(0) // bumped on every load, so the map can re-fit

export const editableModel = computed<Model>(() =>
  tab.value === 'expected' ? tc.value.expected.model : tc.value.arrange)
export const canEdit = computed(() => !(tab.value === 'expected' && tc.value.expected.type === 'exception'))
export const problems = computed(() => M.validate(tc.value))
export const errorCount = computed(() => problems.value.filter(p => p.level === 'error').length)
export const pickLine = computed(() => editableModel.value.lines.find(l => l.id === pickLineId.value) ?? null)

// ---- undo history + autosave ---------------------------------------------------------
// Snapshots are JSON strings. Edits are committed 300 ms after they stop, so a
// burst of typing (or one station drag) becomes a single undo step.

const history = useManualRefHistory(tc, { capacity: 100, dump: JSON.stringify, parse: JSON.parse })
const dirty = computed(() => JSON.stringify(tc.value) !== history.last.value.snapshot)

function persist() {
  try { localStorage.setItem(AUTOSAVE_KEY, M.toJSON(tc.value)) } catch { /* storage full / disabled */ }
}

function commit() {
  if (!dirty.value) return
  history.commit()
  persist()
}
watchDebounced(tc, commit, { deep: true, debounce: 300 })

// Discrete interactions (clicks, select/checkbox changes, the click ending a
// station drag) are their own undo step right away, so quick successive
// actions don't merge. setTimeout runs after the handlers, including ones that
// awaited a confirm dialog.
if (typeof document !== 'undefined')
  for (const type of ['click', 'change'])
    document.addEventListener(type, () => setTimeout(commit), true)

// a pending (not yet committed) edit is undoable too
export const canUndo = computed(() => history.canUndo.value || dirty.value)
export const canRedo = computed(() => history.canRedo.value && !dirty.value)

export function undo() {
  commit()
  if (!history.canUndo.value) return
  history.undo()
  selection.value = null
  persist()
}

export function redo() {
  if (!canRedo.value) return
  history.redo()
  selection.value = null
  persist()
}

// ---- actions --------------------------------------------------------------------------

export function setTab(next: 'arrange' | 'expected') {
  if (tab.value === next) return
  tab.value = next
  selection.value = null
  pickLineId.value = null
}

export function loadTestCase(next: TestCase) {
  tc.value = next
  tab.value = 'arrange'
  selection.value = null
  pickLineId.value = null
  loadCount.value++
  commit() // loading is undoable
}

export function addStation(x: number, y: number) {
  const model = editableModel.value
  const id = M.nextId(model.stations)
  model.stations.push(M.makeStation(id, M.nextStationName(model.stations), x, y))
  selection.value = id
}

// a map click: either appends a stop (pick mode) or selects the station
export function clickStation(id: number) {
  if (pickLine.value) M.appendStop(pickLine.value, id)
  else selection.value = id
}

export async function deleteStation(model: Model, station: Station) {
  const uses = model.lines.reduce((n, l) => n + l.stops.filter(s => s.stationId === station.id).length, 0)
  if (uses > 0 && !await confirmDialog(t('dlg.deleteStation', { name: station.name, id: station.id, n: uses })))
    return
  for (const line of model.lines)
    line.stops = line.stops.filter(s => s.stationId !== station.id)
  model.stations.splice(model.stations.indexOf(station), 1)
  if (selection.value === station.id) selection.value = null
}

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
  if (selection.value === station.id) selection.value = newId
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

export function addLine(model: Model) {
  const id = M.nextId(model.lines)
  model.lines.push({ id, name: 'L' + id, shortName: 'L' + id, color: M.LINE_COLORS[(id - 1) % M.LINE_COLORS.length], type: 1, stops: [] })
}

export function addCalendar(model: Model) {
  model.calendars.push({ id: M.nextId(model.calendars), start: '2025-01-01', end: '2025-12-31', availability: [1, 1, 1, 1, 1, 1, 1] })
}

// the expected model may borrow the Arrange calendars when it has none
export function calendarsFor(model: Model): Calendar[] {
  return model.calendars.length > 0 ? model.calendars : tc.value.arrange.calendars
}

export function addTrip(model: Model) {
  const trip: Trip = { id: M.nextId(model.trips), line: model.lines[0]?.id ?? 1, service: calendarsFor(model)[0]?.id ?? 1 }
  model.trips.push(trip)
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
  selection.value = null
  pickLineId.value = null
  loadCount.value++ // the map re-fits to the new stations
  commit()
}
