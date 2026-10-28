// Projects and their test case files in the browser's localStorage. A file is
// one test case (shown as <name>.json); each project remembers its open file.
// All access is guarded: storage can be disabled (private mode) or full.
export interface ProjectInfo { id: string; name: string }

const PROJECTS_KEY = 'gtfs-projects'
const ACTIVE_PROJECT_KEY = 'gtfs-active-project'
const fileKey = (project: string, id: string) => `gtfs-file:${project}:${id}`
const activeFileKey = (project: string) => `gtfs-active-file:${project}`
const LEGACY_KEY = 'gtfs-test-editor-vue-autosave' // the single autosave before projects

function guard<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}
const get = (key: string) => guard(() => localStorage.getItem(key), null)
// false: not saved (storage full or disabled)
const set = (key: string, value: string) => guard(() => (localStorage.setItem(key, value), true), false)
const remove = (key: string) => guard(() => localStorage.removeItem(key), undefined)

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// ---- projects ------------------------------------------------------------------------

export function projects(): ProjectInfo[] {
  try {
    const list = JSON.parse(get(PROJECTS_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter(p => typeof p?.id === 'string').map(p => ({ id: p.id, name: String(p.name ?? p.id) })) : []
  } catch { return [] }
}
export const saveProjects = (list: ProjectInfo[]) => set(PROJECTS_KEY, JSON.stringify(list))

export const activeProjectId = () => get(ACTIVE_PROJECT_KEY)
export const setActiveProjectId = (id: string) => set(ACTIVE_PROJECT_KEY, id)

// the list first: other tabs then leave the project before its files vanish
export function deleteProject(project: string) {
  saveProjects(projects().filter(p => p.id !== project))
  for (const id of fileIds(project)) remove(fileKey(project, id))
  remove(activeFileKey(project))
}

// ---- files ---------------------------------------------------------------------------

export const fileIds = (project: string) => guard(() => {
  const prefix = fileKey(project, '')
  return Object.keys(localStorage).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length))
}, [] as string[])

export const readFile = (project: string, id: string) => get(fileKey(project, id))
export const writeFile = (project: string, id: string, json: string) => set(fileKey(project, id), json)
export const deleteFile = (project: string, id: string) => remove(fileKey(project, id))

export const activeFileId = (project: string) => get(activeFileKey(project))
export const setActiveFileId = (project: string, id: string) => set(activeFileKey(project), id)

// the project and file a storage event key belongs to, if it is a file
export function fileOf(key: string | null): { project: string; id: string } | null {
  const m = /^gtfs-file:([^:]+):(.+)$/.exec(key ?? '')
  return m ? { project: m[1], id: m[2] } : null
}

// the old single autosave becomes the first file of the given project
export function migrateLegacy(project: string) {
  const old = get(LEGACY_KEY)
  if (old === null) return
  const id = newId()
  if (set(fileKey(project, id), old)) {
    set(activeFileKey(project), id)
    remove(LEGACY_KEY)
  }
}
