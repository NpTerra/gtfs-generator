// Import / export / generate: everything that turns test cases
// into files or files into test cases (project files, see useProject.ts).
import { nextTick } from 'vue'
import { toast } from 'vue-sonner'
import { t } from '@/lib/i18n'
import * as gtfs from '@/lib/gtfs'
import * as M from '@/lib/model'
import { allSubmissions, readZip } from '@/lib/submission'
import * as zip from '@/lib/zip'
import { problems, tc } from './useEditor'
import { openGtfsImport } from './useGtfsImport'
import { showPanel } from './usePanels'
import { addFile, allTestCases, currentProject } from './useProject'
import { openSections } from './useSections'

function download(filename: string, data: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// the open test case, or another project file
export function exportJson(file: M.TestCase = tc.value) {
  download(file.name + '.json', M.toJSON(file) + '\n', 'application/json')
}

// "<project>-json.zip", "<project>-submissions.zip": the two project zips must not look alike
const projectFileName = (kind: string) => `${(currentProject.value?.name ?? 'project').replace(/[^\w.-]+/g, '_')}-${kind}.zip`

// every project file as <name>.json in one zip; Import reads it back
export function exportAll() {
  const names: string[] = [] // duplicate names would overwrite each other in the zip
  const files = allTestCases().map((f) => {
    names.push(M.uniqueName(f.name, names))
    return { name: names.at(-1) + '.json', data: M.toJSON(f) + '\n' }
  })
  download(projectFileName('json'), zip.create(files) as BlobPart, 'application/zip')
}

export function pickAndImport() {
  const input = document.createElement('input')
  Object.assign(input, { type: 'file', multiple: true, accept: '.json,.zip' })
  input.onchange = () => importFiles(input.files ?? [])
  input.click()
}

// Each test case found becomes a new project file (the last one is opened):
// test case .json files, submission zips, zips of several (Export all,
// Generate all). A bare GTFS feed opens the route picker for a new test case.
export async function importFiles(list: Iterable<File>) {
  const cases: M.TestCase[] = []
  const failed: string[] = []
  let feedOpened = false // the route picker takes one feed at a time
  for (const file of list) {
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        cases.push(M.fromJSON(await file.text()))
        continue
      }
      const found = await readZip(file.name, await zip.read(new Uint8Array(await file.arrayBuffer())))
      cases.push(...found.cases)
      failed.push(...found.failed.map(path => `${file.name}: ${path}`))
      if (found.gtfs && feedOpened) failed.push(`${file.name} (${t('toast.oneFeed')})`)
      else if (found.gtfs) feedOpened = await openGtfsImport(found.gtfs, file.name, 'new')
      else if (found.cases.length + found.failed.length === 0) failed.push(file.name)
    } catch (err) {
      console.error(err)
      failed.push(file.name)
    }
  }
  const added = cases.filter((next, i) => addFile(next, { open: i === cases.length - 1 }))
  if (added.length === 1) toast(t('toast.importedOne', { name: added[0].name }))
  else if (added.length > 1) toast(t('toast.importedMany', { n: added.length }))
  if (failed.length) toast.error(t('toast.importSkipped', { files: failed.join(', ') }))
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
    download(current.name + '.zip', zip.create(gtfs.buildTestFiles(current)) as BlobPart, 'application/zip')
    toast.success(t('toast.generated', { name: current.name }))
  } catch (err) {
    console.error(err)
    toast.error(t('toast.generateFailed', { msg: (err as Error).message }))
  }
}

// one zip with a submission folder per test case; all of them must be ready
export function generateAll() {
  const cases = allTestCases()
  const names = cases.map(f => f.name.toLowerCase())
  const blocked = cases.filter((f, i) => M.isPhoneMissing(f.agency) || names.indexOf(names[i]) !== i
    || M.validate(f).some(p => p.level === 'error')).map(f => f.name)
  if (blocked.length) return void toast.error(t('toast.generateAllBlocked', { names: blocked.join(', ') }), { duration: 10000 })
  try {
    download(projectFileName('submissions'), zip.create(allSubmissions(cases)) as BlobPart, 'application/zip')
    toast.success(t('toast.generatedAll', { n: cases.length }))
  } catch (err) {
    console.error(err)
    toast.error(t('toast.generateFailed', { msg: (err as Error).message }))
  }
}
