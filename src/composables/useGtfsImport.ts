// State of the "Import from GTFS" dialog (GtfsImportDialog.vue): pick routes
// from a feed and replace the Arrange or Expected model with them.
import { reactive } from 'vue'
import { toast } from 'vue-sonner'
import type { Feed } from '@/lib/feed'
import { FEED_FILES, readFeed } from '@/lib/feed'
import { t } from '@/lib/i18n'
import * as zip from '@/lib/zip'
import { replaceModel, tab } from './useEditor'

export const gtfsImport = reactive({
  open: false,
  fileName: '',
  target: 'arrange' as 'arrange' | 'expected',
  feed: null as Feed | null,
  selected: new Set<string>(),
  oneTripPerLine: true,
})

// files: an already-unzipped feed, or a .zip File to read first
export async function openGtfsImport(source: File | Record<string, Uint8Array>, fileName?: string) {
  const reading = toast.loading(t('gtfs.reading'))
  try {
    await new Promise(r => setTimeout(r, 30)) // let the toast paint before the heavy parsing
    // ponytail: parses on the main thread (a big city feed blocks the UI for a few seconds); a Web Worker if that bites
    const files = source instanceof File
      ? await zip.read(new Uint8Array(await source.arrayBuffer()), name => FEED_FILES.has(name.split('/').pop()!))
      : source
    const feed = readFeed(files)
    if (feed.routes.length === 0) throw new Error(t('gtfs.noRoutes'))
    toast.dismiss(reading)
    Object.assign(gtfsImport, {
      open: true,
      fileName: fileName ?? (source instanceof File ? source.name : 'feed.zip'),
      target: tab.value,
      feed,
      // small feeds (e.g. our own arrange.zip) come in whole; big ones start empty
      selected: new Set(feed.routes.length <= 8 ? feed.routes.map(r => r.key) : []),
      // one trip per line keeps generated stop_times small; feeds with few trips keep them all
      oneTripPerLine: feed.routes.some(r => r.tripCount > 5),
    })
  } catch (err) {
    console.error(err)
    toast.error(t('toast.importFailed', { msg: (err as Error).message }), { id: reading })
  }
}

export async function applyGtfsImport() {
  const { feed, selected, target, oneTripPerLine } = gtfsImport
  if (!feed || selected.size === 0) return
  const building = toast.loading(t('gtfs.reading'))
  try {
    await new Promise(r => setTimeout(r, 30)) // let the toast paint: big feeds take a few seconds
    const model = feed.build([...selected], oneTripPerLine)
    replaceModel(target, model)
    gtfsImport.open = false
    toast.success(t('toast.importedRoutes', {
      n: model.lines.length, stations: model.stations.length, target: target === 'expected' ? 'Expected' : 'Arrange',
    }), { id: building })
  } catch (err) {
    console.error(err)
    toast.error(t('toast.importFailed', { msg: (err as Error).message }), { id: building })
  }
}
