// Import / export / generate: everything that turns test cases
// into files or files into test cases (project files, see useProject.ts).
import { nextTick } from 'vue'
import { toast } from 'vue-sonner'
import { t } from '@/lib/i18n'
import * as gtfs from '@/lib/gtfs'
import * as M from '@/lib/model'
import { allSubmissions, readZip } from '@/lib/submission'
import { buildTmxTestFiles } from '@/lib/tmx'
import * as zip from '@/lib/zip'
import { format, output, type Output, problems, tc } from './useEditor'
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
  // too big for the editor (it would crawl): skipped, with what's over
  const fitting = cases.filter((next) => {
    const over = [...M.countsOverLimit(next.arrange), ...M.countsOverLimit(next.expected.model)]
    if (over.length) toast.error(t('toast.fileTooBig', { name: next.name, details: over.map(o => `${o.n} ${t('count.' + o.what)} (max ${o.max})`).join(', ') }))
    return over.length === 0
  })
  const added = fitting.filter((next, i) => addFile(next, { open: i === fitting.length - 1 }))
  if (added.length === 1) toast(t('toast.importedOne', { name: added[0].name }))
  else if (added.length > 1) toast(t('toast.importedMany', { n: added.length }))
  if (failed.length) toast.error(t('toast.importSkipped', { files: failed.join(', ') }))
}

// The submission zip, its maps as GTFS feeds (arrange.zip, assert.zip) or, with the top bar's
// switch on TMX, as .tmx files for the course's Transport Map Editor (arrange.tmx, assert.tmx)
// The open test case by default, in the switch's format; the Project panel's file menu passes
// a file and a format (checked in that format, whichever the switch shows)
export async function generate(current: M.TestCase = tc.value, out: Output = output.value) {
  const fmt: M.Format = out === 'gtfs' ? 'gtfs' : 'tmx'
  const onScreen = current === tc.value && fmt === format.value // its problems are the ones shown
  // hard gate: the assigned phone number must be filled in (it's the GTFS agency's; a .tmx has none)
  if (fmt === 'gtfs' && M.isPhoneMissing(current.agency)) {
    toast.error(t('popup.phone'))
    if (current === tc.value) {
      showPanel('test')
      openSections.add('agency')
      nextTick(() => document.querySelector<HTMLInputElement>('[data-field="agency-phone"]')?.focus())
    }
    return
  }

  const errors = (onScreen ? problems.value : M.validate(current, fmt)).filter(p => p.level === 'error')
  if (errors.length > 0) {
    if (onScreen) showPanel('problems')
    toast.error(t('toast.fixErrors', { n: errors.length }))
    return
  }

  try {
    const files = fmt === 'tmx' ? await buildTmxTestFiles(current, out === 'plain') : gtfs.buildTestFiles(current)
    download(current.name + '.zip', zip.create(files) as BlobPart, 'application/zip')
    toast.success(t('toast.generated', { name: current.name }))
  } catch (err) {
    console.error(err)
    toast.error(t('toast.generateFailed', { msg: (err as Error).message }))
  }
}

// one zip with a submission folder per test case; all of them must be ready
export async function generateAll() {
  const cases = allTestCases()
  const names = cases.map(f => f.name.toLowerCase())
  const blocked = cases.filter((f, i) => (format.value === 'gtfs' && M.isPhoneMissing(f.agency)) || names.indexOf(names[i]) !== i
    || M.validate(f, format.value).some(p => p.level === 'error')).map(f => f.name)
  if (blocked.length) return void toast.error(t('toast.generateAllBlocked', { names: blocked.join(', ') }), { duration: 10000 })
  try {
    const files = format.value === 'tmx'
      ? (await Promise.all(cases.map(async tc => (await buildTmxTestFiles(tc, output.value === 'plain')).map(f => ({ ...f, name: `${tc.name}/${f.name}` }))))).flat()
      : allSubmissions(cases)
    download(projectFileName('submissions'), zip.create(files) as BlobPart, 'application/zip')
    toast.success(t('toast.generatedAll', { n: cases.length }))
  } catch (err) {
    console.error(err)
    toast.error(t('toast.generateFailed', { msg: (err as Error).message }))
  }
}
