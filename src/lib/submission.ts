// Submissions <-> test cases. A submission is one folder with comment.txt,
// act.txt, arrange.zip and assert.zip or assert.txt (what Generate writes).
import * as gtfs from './gtfs'
import * as M from './model'
import type { TestCase } from './model'
import * as zip from './zip'

export interface ZipContents {
  cases: TestCase[] // in path order
  failed: string[] // entries that looked like test cases but didn't parse
  gtfs?: Record<string, Uint8Array> // a bare GTFS feed (no test cases), keyed by base name
}

const dec = new TextDecoder()
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const dirName = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0))

// Everything importable in a zip: test case .json files (Export all), and one
// test case per folder holding a submission (Generate, Generate all, or a
// zipped folder of real submissions). Each is named after its folder, one
// at the zip's root after the zip.
export async function readZip(zipName: string, entries: Record<string, Uint8Array>): Promise<ZipContents> {
  const paths = Object.keys(entries).filter(p => !p.includes('__MACOSX/') && !baseName(p).startsWith('._')).sort()
  const out: ZipContents = { cases: [], failed: [] }

  for (const path of paths.filter(p => p.toLowerCase().endsWith('.json'))) {
    try { out.cases.push(M.fromJSON(dec.decode(entries[path]))) } catch { out.failed.push(path) }
  }

  const dirs = [...new Set(paths.filter(p => ['act.txt', 'arrange.zip'].includes(baseName(p))).map(dirName))]
  for (const dir of dirs) {
    const files = Object.fromEntries(paths.filter(p => dirName(p) === dir).map(p => [baseName(p), entries[p]]))
    const name = dir ? baseName(dir) : zipName.replace(/\.zip$/i, '')
    try { out.cases.push(await fromSubmission(name, files)) } catch { out.failed.push(dir || zipName) }
  }

  // a bare feed (the first one, if the zip holds several in folders)
  const feedDir = paths.find(p => baseName(p) === 'stops.txt')
  if (out.cases.length === 0 && out.failed.length === 0 && feedDir !== undefined)
    out.gtfs = Object.fromEntries(paths.filter(p => dirName(p) === dirName(feedDir)).map(p => [baseName(p), entries[p]]))
  return out
}

export async function fromSubmission(name: string, files: Record<string, Uint8Array>): Promise<TestCase> {
  const text = (file: string) => files[file] ? dec.decode(files[file]).replace(/\r\n/g, '\n').replace(/\n+$/, '') : ''
  const tc = M.defaultTestCase()
  tc.name = name
  tc.description = text('comment.txt')
  tc.act = text('act.txt')
  tc.arrange = M.emptyModel()
  tc.expected = { type: 'model', exception: 'INVALID_ARGUMENT', model: M.emptyModel() }
  if (files['arrange.zip']) {
    const { model, agency } = gtfs.importGTFS(await zip.read(files['arrange.zip']))
    tc.arrange = model
    if (agency) tc.agency = agency
  }
  if (files['assert.txt']) Object.assign(tc.expected, { type: 'exception', exception: text('assert.txt') })
  else if (files['assert.zip']) tc.expected.model = gtfs.importGTFS(await zip.read(files['assert.zip'])).model
  return tc
}

// Generate all: one submission folder per test case
export function allSubmissions(cases: TestCase[]): zip.ZipEntry[] {
  return cases.flatMap(tc => gtfs.buildTestFiles(tc).map(f => ({ ...f, name: `${tc.name}/${f.name}` })))
}
