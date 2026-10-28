// Projects and their files, as in IntelliJ: the header's project widget
// switches projects, the Project panel lists the open project's test cases
// (one "file" each, shown as <name>.json). The open file is useEditor's `tc`
// (saved by its autosave); the others live only in storage until opened.
// "Example Models" is a project like the others, filled from the built-in
// examples when it doesn't exist (so deleting it resets it).
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, ref, shallowRef, watchEffect } from 'vue'
import { toast } from 'vue-sonner'
import { exampleTestCases } from '@/lib/examples'
import { t } from '@/lib/i18n'
import * as M from '@/lib/model'
import type { TestCase } from '@/lib/model'
import * as storage from '@/lib/storage'
import type { ProjectInfo } from '@/lib/storage'
import { confirmDialog, promptDialog } from './useConfirm'
import { activeId, activeProject, openTestCase, otherNames, problems, reloadTestCase, tc } from './useEditor'
import { showPanel } from './usePanels'

export interface ProjectFile { id: string; name: string; errors: number; unreadable?: boolean }

export const EXAMPLES = 'examples'
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

// ---- projects --------------------------------------------------------------------------

// in memory first, so the editor still works when storage is disabled
const projectList = ref<ProjectInfo[]>(storage.projects())
function saveProjects(list: ProjectInfo[]) {
  projectList.value = list
  storage.saveProjects(list)
}

// yours by name, Example Models last
export const projects = computed(() => [
  ...projectList.value.filter(p => p.id !== EXAMPLES).sort(byName),
  ...projectList.value.filter(p => p.id === EXAMPLES),
])
export const currentProject = computed(() => projectList.value.find(p => p.id === activeProject.value))

function createProject(name: string, id = storage.newId()): string {
  saveProjects([...projectList.value, { id, name: M.uniqueName(name, projectList.value.map(p => p.name)) }])
  return id
}

function seedExamples() {
  createProject('Example Models', EXAMPLES)
  for (const example of exampleTestCases()) storage.writeFile(EXAMPLES, storage.newId(), M.toJSON(example))
}

export function openProject(project: string) {
  if (project !== activeProject.value) reopen(project)
}

// opens the project's last open file (or its first readable one, or a new one)
function reopen(project: string) {
  const ids = storage.fileIds(project)
  const order = [storage.activeFileId(project), ...ids.map(id => ({ id, name: nameOf(project, id) })).sort(byName).map(f => f.id)]
  for (const id of order) {
    const file = id !== null && ids.includes(id) ? read(project, id) : null
    if (file) {
      openTestCase(project, id!, file)
      return refresh()
    }
  }
  const id = storage.newId()
  openTestCase(project, id, M.defaultTestCase()) // saved by openTestCase
  refresh()
}

export async function newProject() {
  const name = await promptDialog(t('dlg.newProject'), 'New project')
  if (name?.trim()) openProject(createProject(name.trim()))
}

export async function renameProject() {
  const project = currentProject.value
  const name = project && await promptDialog(t('dlg.renameProject'), project.name)
  if (!project || !name?.trim()) return
  saveProjects(projectList.value.map(p => p.id === project.id ? { ...p, name: name.trim() } : p))
}

// deleting Example Models resets it to the built-in examples
export async function deleteProject() {
  const project = currentProject.value
  const isExamples = project?.id === EXAMPLES
  if (!project || !await confirmDialog(t(isExamples ? 'dlg.resetExamples' : 'dlg.deleteProject', { name: project.name }))) return
  if (!isExamples) {
    const entry = toTrash({ kind: 'project', name: project.name, project, files: allTestCases().map(f => M.toJSON(f)) })
    toast(t('toast.deletedProject', { name: project.name }), { action: { label: 'Undo', onClick: () => restore(entry) } })
  }
  activeId.value = '' // nothing left to save to
  storage.deleteProject(project.id)
  projectList.value = projectList.value.filter(p => p.id !== project.id)
  if (isExamples) seedExamples()
  const next = isExamples ? EXAMPLES : projects.value.find(p => p.id !== EXAMPLES)?.id ?? createProject('My tests')
  reopen(next)
}

// ---- files of the open project ---------------------------------------------------------

function read(project: string, id: string): TestCase | null {
  if (project === activeProject.value && id === activeId.value) return tc.value
  try { return M.fromJSON(storage.readFile(project, id) ?? '') } catch { return null }
}
function nameOf(project: string, id: string) {
  return read(project, id)?.name ?? ''
}

// the closed files of the open project, read from storage (refresh() after changing them)
const stored = ref<ProjectFile[]>([])
function refresh() {
  const project = activeProject.value
  stored.value = storage.fileIds(project).filter(id => id !== activeId.value).map((id) => {
    const file = read(project, id)
    return file
      ? { id, name: file.name, errors: M.validate(file).filter(p => p.level === 'error').length }
      : { id, name: 'unreadable-' + id, errors: 1, unreadable: true }
  })
}

// every file, the open one live, sorted by name like a project tree
export const files = computed<ProjectFile[]>(() => [
  ...stored.value,
  { id: activeId.value, name: tc.value.name, errors: problems.value.filter(p => p.level === 'error').length },
].sort(byName))

watchEffect(() => { otherNames.value = stored.value.map(f => f.name) })

export function openFile(id: string) {
  if (id === activeId.value) return
  const next = read(activeProject.value, id)
  if (!next) return void toast.error(t('toast.unreadableFile'))
  openTestCase(activeProject.value, id, next)
  refresh()
}

// Adds a test case as a new file (renamed if its name is taken), to the open
// project unless another is given; opens it if it lands in the open project.
// false: not saved (storage full or disabled).
export function addFile(next: TestCase, { open = true, project = activeProject.value } = {}): boolean {
  const taken = project === activeProject.value ? files.value.map(f => f.name) : storage.fileIds(project).map(id => nameOf(project, id))
  next.name = M.uniqueName(next.name, taken)
  const id = storage.newId()
  if (!storage.writeFile(project, id, M.toJSON(next))) {
    toast.error(t('toast.saveFailed'))
    return false
  }
  if (project === activeProject.value) {
    if (open) openTestCase(project, id, next)
    refresh()
  }
  return true
}

export function newFile() {
  addFile(M.defaultTestCase())
  showPanel('test')
  nextTick(() => document.querySelector<HTMLInputElement>('[data-field="test-name"]')?.select())
}

// a file of the open project (the open one live)
export const fileTestCase = (id: string) => read(activeProject.value, id)

const copyOf = (id: string) => {
  const file = fileTestCase(id)
  return file && M.fromJSON(M.toJSON(file))
}

export function duplicateFile(id: string) {
  const copy = copyOf(id)
  if (copy) addFile({ ...copy, name: copy.name + '_copy' })
}

export function copyToProject(id: string, project: ProjectInfo) {
  const copy = copyOf(id)
  if (!copy) return
  if (addFile(copy, { project: project.id })) toast.success(t('toast.copiedTo', { name: copy.name, project: project.name }))
}

export async function renameFile(id: string) {
  const file = files.value.find(f => f.id === id)
  const name = file && (await promptDialog(t('dlg.renameFile'), file.name))?.trim()
  if (!file || !name || name === file.name) return
  const taken = files.value.some(f => f.id !== id && f.name.toLowerCase() === name.toLowerCase())
  if (M.isBadName(name) || taken) return void toast.error(taken ? t('toast.nameTaken', { name }) : t('v.badName'))
  if (id === activeId.value) return void (tc.value.name = name)
  const closed = read(activeProject.value, id)
  if (!closed) return
  closed.name = name
  storage.writeFile(activeProject.value, id, M.toJSON(closed))
  refresh()
}

export async function deleteFile(id: string) {
  const file = files.value.find(f => f.id === id)
  if (!file || !await confirmDialog(t('dlg.deleteFile', { name: file.name }))) return
  const content = read(activeProject.value, id)
  if (content && currentProject.value) {
    const entry = toTrash({ kind: 'file', name: file.name, project: currentProject.value, files: [M.toJSON(content)] })
    toast(t('toast.deletedFile', { name: file.name }), { action: { label: 'Undo', onClick: () => restore(entry) } })
  }
  storage.deleteFile(activeProject.value, id)
  if (id === activeId.value) leaveDeleted(id)
  refresh()
}

// the open file is gone: open another one without saving it back
function leaveDeleted(id: string) {
  const next = files.value.find(f => f.id !== id && !f.unreadable)
  const nextFile = next && read(activeProject.value, next.id)
  activeId.value = ''
  if (next && nextFile) openTestCase(activeProject.value, next.id, nextFile)
  else openTestCase(activeProject.value, storage.newId(), M.defaultTestCase()) // saved (or warned) like any edit
  refresh()
}

// the open project's test cases (Export all, Generate all)
export const allTestCases = () => files.value.map(f => read(activeProject.value, f.id)).filter((f): f is TestCase => f !== null)

// ---- recently deleted: this session's deleted files and projects, newest first ----------

export interface Trashed { kind: 'file' | 'project'; name: string; project: ProjectInfo; files: string[]; at: number }
export const trash = shallowRef<Trashed[]>([]) // shallow: entries stay plain objects, so === finds them

function toTrash(entry: Omit<Trashed, 'at'>): Trashed {
  const full = { ...entry, at: Date.now() }
  trash.value = [full, ...trash.value].slice(0, 20)
  return full
}

// a file goes back into its project (or the open one if that is gone too), a
// project comes back as a new one; either way it is opened
export function restore(entry: Trashed | undefined) {
  if (!entry || !trash.value.includes(entry)) return
  trash.value = trash.value.filter(e => e !== entry)
  const cases = entry.files.map(json => M.fromJSON(json))
  if (entry.kind === 'project') {
    const id = createProject(entry.name)
    for (const tc of cases) storage.writeFile(id, storage.newId(), M.toJSON(tc))
    return reopen(id)
  }
  const home = projectList.value.some(p => p.id === entry.project.id) ? entry.project.id : activeProject.value
  if (home !== activeProject.value) reopen(home)
  // the open file couldn't be left (its save failed): keep it in the bin, not in the wrong project
  if (home !== activeProject.value) { trash.value = [entry, ...trash.value]; return }
  addFile(cases[0])
}

// ---- start ------------------------------------------------------------------------------

if (!projectList.value.some(p => p.id !== EXAMPLES)) {
  const id = createProject('My tests')
  storage.migrateLegacy(id)
}
if (!projectList.value.some(p => p.id === EXAMPLES)) seedExamples()
reopen(projectList.value.find(p => p.id === storage.activeProjectId())?.id ?? projects.value[0].id)

// Another browser tab changed storage: re-read the project list and files,
// and the open file if it was the one changed (our next edit would otherwise
// overwrite theirs).
useEventListener(window, 'storage', (ev: StorageEvent) => {
  if (ev.key === null) return
  const file = storage.fileOf(ev.key)
  if (!file) {
    if (ev.key !== 'gtfs-projects') return
    projectList.value = storage.projects()
    if (!currentProject.value) { // deleted there: don't keep saving into it
      activeId.value = ''
      reopen(projects.value[0]?.id ?? createProject('My tests'))
    }
    return
  }
  if (file.project !== activeProject.value || !currentProject.value) return
  if (file.id === activeId.value && ev.newValue === null) {
    leaveDeleted(file.id)
    toast(t('toast.deletedElsewhere'))
  } else if (file.id === activeId.value && ev.newValue !== null && ev.newValue !== M.toJSON(tc.value)) {
    try {
      reloadTestCase(M.fromJSON(ev.newValue))
      toast(t('toast.changedElsewhere', { name: tc.value.name }))
    } catch { /* half-written or foreign value: keep ours */ }
  }
  refresh()
})
