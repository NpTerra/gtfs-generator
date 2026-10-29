// Reads a GTFS feed off the page's thread (a city's feed takes seconds) and keeps
// it, so the routes the user picks are built here too. See feedWorker.ts.
import type { Feed } from './feed'
import { FEED_FILES, readFeed } from './feed'
import * as zip from './zip'

let feed: Feed | null = null

self.onmessage = async ({ data }: MessageEvent) => {
  try {
    if (data.type === 'read') {
      const files: Record<string, Uint8Array> = data.source instanceof ArrayBuffer
        ? await zip.read(new Uint8Array(data.source), name => FEED_FILES.has(name.split('/').pop()!))
        : data.source
      feed = readFeed(files)
      postMessage({ id: data.id, result: feed.routes })
    } else {
      postMessage({ id: data.id, result: feed!.build(data.keys, data.oneTripPerLine, data.mergeWithin) })
    }
  } catch (err) {
    postMessage({ id: data.id, error: String((err as Error)?.message || err || 'the feed reader failed') })
  }
}
