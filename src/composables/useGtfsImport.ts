// State of the "Import from GTFS" dialog (GtfsImportDialog.vue): pick routes
// from a feed to replace the Arrange or Expected model with, or to start a new
// test case with (a feed imported into the project).
import { markRaw, reactive, watch } from 'vue'
import { toast } from 'vue-sonner'
import type { WorkerFeed } from '@/lib/feedWorker'
import { openFeed } from '@/lib/feedWorker'
import { t } from '@/lib/i18n'
import * as M from '@/lib/model'
import { replaceModel, tab } from './useEditor'
import { addFile } from './useProject'

export type Target = 'arrange' | 'expected' | 'new'

export const gtfsImport = reactive({
  open: false,
  fileName: '',
  target: 'arrange' as Target,
  feed: null as WorkerFeed | null, // read in a worker, which lives until the dialog closes
  selected: new Set<string>(),
  oneTripPerLine: true,
})

// files: an already-unzipped feed, or a .zip File to read first; false if it couldn't be read
watch(() => gtfsImport.open, (open) => {
  if (open) return
  gtfsImport.feed?.close()
  gtfsImport.feed = null
})

export async function openGtfsImport(source: File | Record<string, Uint8Array>, fileName?: string, target: Target = tab.value): Promise<boolean> {
  const reading = toast.loading(t('gtfs.reading'))
  try {
    const feed = await openFeed(source instanceof File ? await source.arrayBuffer() : source)
    if (feed.routes.length === 0) {
      feed.close()
      throw new Error(t('gtfs.noRoutes'))
    }
    toast.dismiss(reading)
    gtfsImport.feed?.close()
    Object.assign(gtfsImport, {
      open: true,
      fileName: fileName ?? (source instanceof File ? source.name : 'feed.zip'),
      target,
      feed: markRaw(feed), // its route list is only read
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
    const model = await feed.build([...selected], oneTripPerLine)
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
    if (!gtfsImport.open) return void toast.dismiss(building) // closed while building: nothing to say
    console.error(err)
    toast.error(t('toast.importFailed', { msg: (err as Error).message }), { id: building })
  }
}
