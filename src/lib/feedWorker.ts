// The page's side of feed.worker.ts: a feed read in a worker, its routes here and
// build() answered from there. close() ends the worker (and frees the feed).
import type { FeedRoute } from './feed'
import type { Model } from './model'

export interface WorkerFeed {
  routes: FeedRoute[]
  build(routeKeys: string[], oneTripPerLine: boolean, mergeWithin: number): Promise<Model>
  close(): void
}

// source: a .zip's bytes, or an already-unzipped feed (keyed by base name)
export async function openFeed(source: ArrayBuffer | Record<string, Uint8Array>): Promise<WorkerFeed> {
  const worker = new Worker(new URL('./feed.worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void }>()
  let next = 0
  worker.onmessage = ({ data }) => {
    const call = pending.get(data.id)
    pending.delete(data.id)
    if ('error' in data) call?.reject(new Error(data.error)); else call?.resolve(data.result as never)
  }
  worker.onerror = (ev) => {
    ev.preventDefault()
    for (const call of pending.values()) call.reject(new Error(ev.message || 'the feed reader stopped'))
    pending.clear()
  }
  const ask = <T>(message: object, transfer: Transferable[] = []): Promise<T> => new Promise((resolve, reject) => {
    const id = next++
    pending.set(id, { resolve: resolve as (v: never) => void, reject })
    worker.postMessage({ ...message, id }, transfer)
  })
  // moved to the worker, not copied: a city's feed is hundreds of MB (the page doesn't use it after)
  const buffers = source instanceof ArrayBuffer ? [source] : [...new Set(Object.values(source).map(u => u.buffer as ArrayBuffer))]
  try {
    const routes = await ask<FeedRoute[]>({ type: 'read', source }, buffers)
    return {
      routes,
      build: (keys, oneTripPerLine, mergeWithin) => ask<Model>({ type: 'build', keys, oneTripPerLine, mergeWithin }),
      close: () => { // a build still under way fails ("closed")
        worker.terminate()
        for (const call of pending.values()) call.reject(new Error('closed'))
        pending.clear()
      },
    }
  } catch (err) {
    worker.terminate()
    throw err
  }
}
