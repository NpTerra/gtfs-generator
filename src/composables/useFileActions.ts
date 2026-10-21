// Import / export / generate / examples: everything that turns the test case
// into files or files into a test case.
import { nextTick } from 'vue'
import { toast } from 'vue-sonner'
import { t } from '@/lib/i18n'
import * as gtfs from '@/lib/gtfs'
import * as M from '@/lib/model'
import * as zip from '@/lib/zip'
import { confirmDialog } from './useConfirm'
import { loadTestCase, problems, tc } from './useEditor'
import { openGtfsImport } from './useGtfsImport'
import { showPanel } from './usePanels'
import { openSections } from './useSections'

// The examples are bundled at build time straight from examples/, so
// no directory listing is needed (adding one means rebuilding).
const exampleFiles = import.meta.glob<unknown>('../../examples/*.json', { eager: true, import: 'default' })
export const examples = Object.entries(exampleFiles)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, data]) => ({ file: path.split('/').pop()!, data }))
  .map(e => ({ ...e, name: String((e.data as { name?: string })?.name ?? e.file) }))

function download(filename: string, data: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export async function newTestCase() {
  if (await confirmDialog(t('dlg.newConfirm'))) loadTestCase(M.defaultTestCase())
}

export async function loadExample(example: { data: unknown }) {
  if (!await confirmDialog(t('dlg.exampleConfirm'))) return
  loadTestCase(M.fromJSON(JSON.stringify(example.data)))
  toast(t('toast.exampleLoaded', { name: tc.value.name }))
}

export function exportJson() {
  download(tc.value.name + '.json', M.toJSON(tc.value), 'application/json')
}

export async function importFile(file: File) {
  try {
    if (file.name.toLowerCase().endsWith('.json')) {
      const next = M.fromJSON(await file.text())
      if (!await confirmDialog(t('dlg.importConfirm', { name: next.name }))) return
      loadTestCase(next)
      toast(t('toast.importedJson', { name: next.name }))
      return
    }

    const files = await zip.read(new Uint8Array(await file.arrayBuffer()))

    if (files['act.txt'] || files['arrange.zip']) {
      // a full submission zip (act.txt + comment.txt + arrange.zip + assert.*)
      if (!await confirmDialog(t('dlg.importConfirm', { name: file.name }))) return
      const dec = new TextDecoder()
      const text = (name: string) => files[name] ? dec.decode(files[name]).replace(/\r\n/g, '\n').replace(/\n+$/, '') : ''

      const next = M.defaultTestCase()
      next.name = file.name.replace(/\.zip$/i, '')
      next.description = text('comment.txt')
      next.act = text('act.txt')
      next.randomizeOffsets = false
      next.arrange = M.emptyModel()
      next.expected = { type: 'model', exception: 'INVALID_ARGUMENT', model: M.emptyModel() }
      if (files['arrange.zip']) {
        const { model, agency } = gtfs.importGTFS(await zip.read(files['arrange.zip']))
        next.arrange = model
        if (agency) next.agency = agency
      }
      if (files['assert.txt']) {
        next.expected.type = 'exception'
        next.expected.exception = text('assert.txt')
      } else if (files['assert.zip']) {
        next.expected.model = gtfs.importGTFS(await zip.read(files['assert.zip'])).model
      }
      loadTestCase(next)
      toast(t('toast.importedSubmission', { name: next.name }))
      return
    }

    if (files['stops.txt']) {
      // a bare GTFS feed: pick routes to replace the active tab's model with
      await openGtfsImport(files, file.name)
      return
    }

    toast.error(t('toast.zipUnknown'))
  } catch (err) {
    console.error(err)
    toast.error(t('toast.importFailed', { msg: (err as Error).message }))
  }
}

export function generate() {
  const current = tc.value
  // hard gate: the assigned phone number must be filled in
  if (M.isPhoneMissing(current.agency)) {
    toast.error(t('popup.phone'))
    showPanel('test')
    openSections.add('agency')
    nextTick(() => document.querySelector<HTMLInputElement>('[data-field="agency-phone"]')?.focus())
    return
  }

  const errors = problems.value.filter(p => p.level === 'error')
  if (errors.length > 0) {
    showPanel('problems')
    toast.error(t('toast.fixErrors', { n: errors.length }))
    return
  }

  try {
    const offset = current.randomizeOffsets ? gtfs.pickOffsets(current) : { lat: 0, lon: 0 }
    download(current.name + '.zip', zip.create(gtfs.buildTestFiles(current, offset)) as BlobPart, 'application/zip')
    const sign = (v: number) => (v >= 0 ? '+' : '') + v
    toast.success(t('toast.generated', { name: current.name }), {
      description: current.randomizeOffsets ? t('toast.offset', { lat: sign(offset.lat), lon: sign(offset.lon) }) : undefined,
    })
  } catch (err) {
    console.error(err)
    toast.error(t('toast.generateFailed', { msg: (err as Error).message }))
  }
}
