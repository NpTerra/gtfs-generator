// Projects and their test case files, kept in IndexedDB. A file is one test
// case (shown as <name>.json); each project remembers its open file.
// initStorage() loads everything into memory before the app starts, so reads
// stay synchronous; writes go to memory at once and to IndexedDB in the
// background, in call order (IndexedDB runs a store's transactions in the
// order they were created). Without IndexedDB (disabled, some private modes)
// it falls back to localStorage, as before. All access is guarded: storage
// can be disabled or full.
import { createStore, del, entries, set as idbSet, setMany, type UseStore } from 'idb-keyval'

export interface ProjectInfo { id: string; name: string }

const PROJECTS_KEY = 'gtfs-projects'
const ACTIVE_PROJECT_KEY = 'gtfs-active-project'
const fileKey = (project: string, id: string) => `gtfs-file:${project}:${id}`
const activeFileKey = (project: string) => `gtfs-active-file:${project}`
const LEGACY_KEY = 'gtfs-test-editor-vue-autosave' // the single autosave before projects
export const LOCAL_STORAGE_LIMIT = 5_242_880 // characters per site, keys included (measured in Chrome)

function guard<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}

let idb: UseStore | null = null // null: on localStorage
const cache = new Map<string, string>() // IndexedDB's contents
const pending = new Map<string, Promise<void>>() // each key's last unfinished write
const unsaved = new Set<string>() // keys whose last write failed
let channel: BroadcastChannel | null = null // tells the other tabs about writes
let failed = () => {}
let changed: (key: string, value: string | null) => void = () => {}
const JOURNAL = 'gtfs-unsaved:' // localStorage: writes a closed page left unfinished
let leaving = false // pagehide came: IndexedDB writes may not finish any more

export const usesIndexedDb = () => idb !== null

const localKeys = () => guard(() => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!), [])
const keys = () => idb ? [...cache.keys()] : localKeys()
const get = (key: string) => idb ? cache.get(key) ?? null : guard(() => localStorage.getItem(key), null)

// false: not saved (storage full or disabled). With IndexedDB the write
// finishes later; false then means this key's last write failed and it isn't
// saved yet (it's retried; other keys' failures don't count).
function set(key: string, value: string) {
  if (!idb) return guard(() => (localStorage.setItem(key, value), true), false)
  const failedBefore = unsaved.has(key)
  cache.set(key, value)
  write(key)
  return !failedBefore
}
function remove(key: string) {
  if (!idb) return guard(() => localStorage.removeItem(key), undefined)
  cache.delete(key)
  write(key)
}

function write(key: string, broadcast = true) {
  const value = cache.get(key) ?? null
  if (broadcast) channel?.postMessage({ key, value })
  const p = (value === null ? del(key, idb!) : idbSet(key, value, idb!)).then(() => {
    unsaved.delete(key)
    // storage works again (space freed?): retry the earlier failures
    for (const k of unsaved) { unsaved.delete(k); write(k, false) }
  }, () => {
    unsaved.add(key)
    failed()
  }).finally(() => { if (pending.get(key) === p) pending.delete(key) })
  pending.set(key, p)
  if (leaving) keep(key) // e.g. the editor's last save, on pagehide
}

const keep = (key: string) => {
  try { localStorage.setItem(JOURNAL + key, JSON.stringify(cache.get(key) ?? null)) } catch (err) {
    console.warn(`Couldn't keep ${key} for the next start (localStorage full?); its last change may be lost.`, err)
  }
}

// another tab's change (value null: deleted)
function apply(key: string, value: string | null) {
  if (value === null) cache.delete(key)
  else cache.set(key, value)
  changed(key, value)
}

// a closed page's unfinished write: apply and save it here
function finish(journalKey: string) {
  // gone: another tab (or this one, for the same key twice) finished it already. Not
  // a delete: JSON.parse(null) is null, which would delete the key in every tab
  const raw = guard(() => localStorage.getItem(journalKey), null)
  if (raw === null) return
  const value = guard(() => JSON.parse(raw) as string | null, undefined)
  guard(() => localStorage.removeItem(journalKey), undefined)
  if (value === undefined) return
  apply(journalKey.slice(JOURNAL.length), value)
  write(journalKey.slice(JOURNAL.length)) // tells a page that just started, too
}

// called when a background write fails (to warn the user)
export const onWriteFailed = (fn: () => void) => { failed = fn }
// called with a key another tab changed (value null: deleted)
export const onChanged = (fn: (key: string, value: string | null) => void) => { changed = fn }

const ours = (key: string) => key === PROJECTS_KEY || key === ACTIVE_PROJECT_KEY || key === LEGACY_KEY ||
  key.startsWith('gtfs-file:') || key.startsWith('gtfs-active-file:')

// Loads IndexedDB into memory and moves this app's data over from localStorage
// (removed there only once IndexedDB has it): all of it the first time, later any
// key IndexedDB lacks (written by a tab of an older build, or by a session that
// fell back to localStorage). Without IndexedDB everything stays on localStorage.
// `store` is for tests.
export async function initStorage(store = createStore('gtfs-test-editor', 'storage')) {
  try {
    let all = await entries<string, string>(store)
    const ch = new BroadcastChannel('gtfs-storage')
    const have = new Set(all.map(([k]) => k))
    const moved = localKeys().filter(k => ours(k) && !have.has(k)).map((k): [string, string] => [k, get(k) ?? ''])
    if (moved.length > 0) {
      await setMany(moved, store)
      for (const [k] of moved) guard(() => localStorage.removeItem(k), undefined)
      all = [...all, ...moved]
    }
    for (const [k, v] of all) cache.set(k, v)
    idb = store
    channel = ch
    ch.onmessage = ({ data }: MessageEvent<{ key: string; value: string | null }>) => apply(data.key, data.value)
    // A page going away aborts its unfinished IndexedDB writes (the last edit
    // before a reload, say), so it leaves them, and the failed ones, in
    // synchronous localStorage; an open tab or the next start saves them.
    const finishAll = () => localKeys().filter(k => k.startsWith(JOURNAL)).forEach(finish)
    finishAll()
    globalThis.addEventListener?.('pagehide', () => {
      leaving = true
      new Set([...pending.keys(), ...unsaved]).forEach(keep)
    })
    globalThis.addEventListener?.('pageshow', (ev: PageTransitionEvent) => { // back from the bfcache
      if (ev.persisted) { leaving = false; finishAll() }
    })
    globalThis.addEventListener?.('storage', (ev: StorageEvent) => { if (ev.key?.startsWith(JOURNAL) && ev.newValue !== null) finish(ev.key) })
  } catch {
    globalThis.addEventListener?.('storage', (ev: StorageEvent) => { if (ev.key !== null) changed(ev.key, ev.newValue) })
  }
}

// characters stored for a project's files, and in all (on localStorage: every key, prefs too)
const chars = (list: string[]) => list.reduce((n, k) => n + k.length + (get(k)?.length ?? 0), 0)
export const projectChars = (project: string) => chars(keys().filter(k => k.startsWith(fileKey(project, ''))))
export const totalChars = () => chars(keys())

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

export const fileIds = (project: string) => {
  const prefix = fileKey(project, '')
  return keys().filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length))
}

export const readFile = (project: string, id: string) => get(fileKey(project, id))
export const writeFile = (project: string, id: string, json: string) => set(fileKey(project, id), json)
export const deleteFile = (project: string, id: string) => remove(fileKey(project, id))

export const activeFileId = (project: string) => get(activeFileKey(project))
export const setActiveFileId = (project: string, id: string) => set(activeFileKey(project), id)

// the project and file a changed key belongs to, if it is a file
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
