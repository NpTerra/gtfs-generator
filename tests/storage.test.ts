// The storage layer (src/lib/storage.ts) on an in-memory IndexedDB: moving the
// data over from localStorage, write order, failed writes, other tabs.
import { IDBFactory } from 'fake-indexeddb'
import { createStore, entries, type UseStore } from 'idb-keyval'
import { beforeEach, describe, expect, it, vi } from 'vitest'

class MemoryStorage {
  m = new Map<string, string>()
  get length() { return this.m.size }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
}

let local: MemoryStorage
let fail: boolean
let store: UseStore // a store whose writes fail while `fail` is set

// a fresh copy of the module, like a new page load or another tab
async function start() {
  vi.resetModules()
  const storage = await import('../src/lib/storage')
  await storage.initStorage(store)
  return storage
}
const stored = async () => Object.fromEntries(await entries<string, string>(store))

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('localStorage', local = new MemoryStorage())
  fail = false
  const real = createStore('gtfs-test-editor', 'storage')
  store = (mode, cb) => fail && mode === 'readwrite' ? Promise.reject(new Error('QuotaExceededError')) : real(mode, cb)
})

describe('storage', () => {
  it('moves this app\'s localStorage keys to IndexedDB, then removes them', async () => {
    local.setItem('gtfs-projects', JSON.stringify([{ id: 'p', name: 'Mine' }]))
    local.setItem('gtfs-active-project', 'p')
    local.setItem('gtfs-file:p:a', '{"name":"a"}')
    local.setItem('gtfs-active-file:p', 'a')
    local.setItem('gtfs-test-editor-vue-autosave', '{"name":"old"}')
    local.setItem('gtfs-editor-theme', 'dark') // a UI pref: stays
    const storage = await start()
    expect(storage.usesIndexedDb()).toBe(true)
    expect(storage.projects()).toEqual([{ id: 'p', name: 'Mine' }])
    expect(storage.readFile('p', 'a')).toBe('{"name":"a"}')
    expect([...local.m.keys()]).toEqual(['gtfs-editor-theme'])
    expect(Object.keys(await stored())).toHaveLength(5)

    storage.migrateLegacy('p') // the old autosave becomes a file, as before
    expect(storage.fileIds('p')).toHaveLength(2)

    const again = await start() // the next load reads IndexedDB only
    expect(again.fileIds('p')).toHaveLength(2)
    expect(again.activeProjectId()).toBe('p')
  })

  it('keeps everything on localStorage when IndexedDB fails', async () => {
    local.setItem('gtfs-file:p:a', 'A')
    fail = true // the move fails: nothing is removed
    const storage = await start()
    expect(storage.usesIndexedDb()).toBe(false)
    expect(storage.readFile('p', 'a')).toBe('A')
    expect(storage.writeFile('p', 'b', 'B')).toBe(true)
    expect(local.getItem('gtfs-file:p:b')).toBe('B')
    expect(storage.totalChars()).toBe('gtfs-file:p:a'.length * 2 + 2)
  })

  it('writes in call order: the last write wins', async () => {
    const storage = await start()
    for (let i = 0; i < 50; i++) storage.writeFile('p', 'a', 'v' + i)
    storage.deleteFile('p', 'a')
    storage.writeFile('p', 'a', 'last')
    storage.writeFile('p', 'b', 'B')
    storage.deleteFile('p', 'b')
    expect(storage.readFile('p', 'a')).toBe('last') // memory at once
    expect(await stored()).toEqual({ 'gtfs-file:p:a': 'last' }) // reads queue behind the writes
    expect((await start()).fileIds('p')).toEqual(['a'])
  })

  it('reports failed writes and retries them once writing works again', async () => {
    const storage = await start()
    const failed = vi.fn()
    storage.onWriteFailed(failed)
    fail = true
    expect(storage.writeFile('p', 'a', 'A')).toBe(true) // not known yet
    await vi.waitFor(() => expect(failed).toHaveBeenCalled())
    expect(storage.writeFile('p', 'b', 'B')).toBe(true) // only a's write failed, not b's
    expect(storage.writeFile('p', 'a', 'A')).toBe(false) // a's last write failed: not saved yet
    fail = false
    await vi.waitFor(() => expect(failed).toHaveBeenCalledTimes(3))
    storage.writeFile('p', 'c', 'C') // succeeds, then retries a and b
    await vi.waitFor(async () => expect(Object.keys(await stored())).toHaveLength(3))
    expect(storage.writeFile('p', 'c', 'C2')).toBe(true)
  })

  it('saves the writes a closed page left in localStorage', async () => {
    const first = await start()
    first.writeFile('p', 'a', 'A1')
    first.writeFile('p', 'b', 'B')
    await vi.waitFor(async () => expect(Object.keys(await stored())).toHaveLength(2))
    // what its pagehide would leave: a's last edit, b deleted
    local.setItem('gtfs-unsaved:gtfs-file:p:a', JSON.stringify('A2'))
    local.setItem('gtfs-unsaved:gtfs-file:p:b', 'null')
    const storage = await start()
    expect(storage.readFile('p', 'a')).toBe('A2')
    expect(storage.fileIds('p')).toEqual(['a'])
    expect(local.length).toBe(0)
    await vi.waitFor(async () => expect(await stored()).toEqual({ 'gtfs-file:p:a': 'A2' }))
  })

  it('tells the other tabs about writes and deletes', async () => {
    const a = await start()
    const b = await start()
    const changes: [string, string | null][] = []
    b.onChanged((key, value) => changes.push([key, value]))
    a.writeFile('p', 'x', 'X')
    a.deleteFile('p', 'x')
    a.saveProjects([{ id: 'p', name: 'Renamed' }])
    await vi.waitFor(() => expect(changes).toHaveLength(3))
    expect(changes.slice(0, 2)).toEqual([['gtfs-file:p:x', 'X'], ['gtfs-file:p:x', null]])
    expect(b.projects()).toEqual([{ id: 'p', name: 'Renamed' }])
    expect(b.fileIds('p')).toEqual([])
  })

  it('later starts move over the keys IndexedDB lacks (an old build\'s tab kept saving)', async () => {
    const first = await start()
    first.writeFile('p', 'a', 'A')
    await vi.waitFor(async () => expect(await stored()).toEqual({ 'gtfs-file:p:a': 'A' }))
    local.setItem('gtfs-file:p:b', 'B')
    const storage = await start()
    expect(storage.readFile('p', 'b')).toBe('B')
    expect(local.getItem('gtfs-file:p:b')).toBeNull()
    expect(await stored()).toEqual({ 'gtfs-file:p:a': 'A', 'gtfs-file:p:b': 'B' })
  })

  it('a journal entry that is already finished deletes nothing', async () => {
    const page = new EventTarget() // the storage events another tab's localStorage writes fire here
    vi.stubGlobal('addEventListener', page.addEventListener.bind(page))
    const storage = await start()
    storage.writeFile('p', 'a', 'A')
    // a closing tab journaled a twice (its pagehide, then its last save): two events,
    // and the first one's finish already took the entry
    local.setItem('gtfs-unsaved:gtfs-file:p:a', JSON.stringify('A2'))
    const event = () => Object.assign(new Event('storage'), { key: 'gtfs-unsaved:gtfs-file:p:a', newValue: JSON.stringify('A2') })
    page.dispatchEvent(event())
    page.dispatchEvent(event())
    expect(storage.readFile('p', 'a')).toBe('A2')
    await vi.waitFor(async () => expect(await stored()).toEqual({ 'gtfs-file:p:a': 'A2' }))
    vi.unstubAllGlobals()
  })
})
