// State of the "Import from GTFS" dialog (GtfsImportDialog.vue): pick routes
// from a feed to replace the Arrange or Expected model with, or to start a new
// test case with (a feed imported into the project).
import { reactive } from 'vue'
import { toast } from 'vue-sonner'
import type { Feed } from '@/lib/feed'
import { FEED_FILES, readFeed } from '@/lib/feed'
import { t } from '@/lib/i18n'
import * as M from '@/lib/model'
import * as zip from '@/lib/zip'
import { replaceModel, tab } from './useEditor'
import { addFile } from './useProject'

export type Target = 'arrange' | 'expected' | 'new'

export const gtfsImport = reactive({
  open: false,
  fileName: '',
  target: 'arrange' as Target,
  feed: null as Feed | null,
  selected: new Set<string>(),
  oneTripPerLine: true,
})

// files: an already-unzipped feed, or a .zip File to read first; false if it couldn't be read
export async function openGtfsImport(source: File | Record<string, Uint8Array>, fileName?: string, target: Target = tab.value): Promise<boolean> {
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
      target,
      feed,
      // small feeds (e.g. our own arrange.zip) come in whole; big ones start empty
      selected: new Set(feed.routes.length <= 8 ? feed.routes.map(r => r.key) : []),
      // one trip per line keeps generated stop_times small; feeds with few trips keep them all
      oneTripPerLine: feed.routes.some(r => r.tripCount > 5),
    })
    return true
  } catch (err) {
    console.error(err)
    toast.error(t('toast.importFailed', { msg: (err as Error).message }), { id: reading })
    return false
  }
}

export async function applyGtfsImport() {
  const { feed, selected, target, oneTripPerLine } = gtfsImport
  if (!feed || selected.size === 0) return
  const building = toast.loading(t('gtfs.reading'))
  try {
    await new Promise(r => setTimeout(r, 30)) // let the toast paint: big feeds take a few seconds
    const model = feed.build([...selected], oneTripPerLine)
    const over = M.countsOverLimit(model)
    if (over.length) {
      const details = over.map(o => `${o.n} ${t('count.' + o.what)} (max ${o.max})`).join(', ')
      return void toast.error(t('toast.importTooBig', { details }), { id: building })
    }
    if (target === 'new') {
      const next = M.defaultTestCase()
      // "budapest_gtfs (1).zip" (a second download of the same file) -> budapest_gtfs
      const name = gtfsImport.fileName.replace(/\.zip$/i, '').replace(/ \(\d+\)$/, '').replace(/[^A-Za-z0-9_\-. ]+/g, '_')
      next.name = M.isBadName(name) ? 'imported_routes' : name // addFile cuts it to the name limit
      next.arrange = model
      next.expected.model = M.cloneModel(model)
      addFile(next)
    } else {
      replaceModel(target, model)
    }
    gtfsImport.open = false
    toast.success(t('toast.importedRoutes', {
      n: model.lines.length, stations: model.stations.length, target: target === 'expected' ? 'Expected' : 'Arrange',
    }), { id: building })
  } catch (err) {
    console.error(err)
    toast.error(t('toast.importFailed', { msg: (err as Error).message }), { id: building })
  }
}
