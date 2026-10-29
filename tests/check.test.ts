// The examples, the model helpers, and (if a local submitted-tests/ folder
// exists) a round trip of every real submission: import, serialize to JSON,
// regenerate, and compare with the original files. That folder is never
// committed, so on a fresh clone this part is skipped.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as acts from '../src/lib/acts'
import * as csv from '../src/lib/csv'
import * as gtfs from '../src/lib/gtfs'
import * as history from '../src/lib/history'
import { placeLabels } from '../src/lib/labels'
import { t } from '../src/lib/i18n'
import * as M from '../src/lib/model'
import { secondNearest } from '../src/lib/spacing'
import * as submission from '../src/lib/submission'
import * as zip from '../src/lib/zip'

const ROOT = join(__dirname, '..')
const EXAMPLES = join(ROOT, 'examples')
const SUBMITTED = join(ROOT, 'submitted-tests')
const TABLES = ['agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'calendar.txt', 'stop_times.txt']

const decoder = new TextDecoder()
const table = (files: Record<string, Uint8Array>, name: string) => files[name] ? csv.parse(decoder.decode(files[name])) : []
const fileData = (files: zip.ZipEntry[], name: string) => files.find(f => f.name === name)?.data

describe.each(readdirSync(EXAMPLES).filter(f => f.endsWith('.json')))('example %s', (file) => {
  const text = readFileSync(join(EXAMPLES, file), 'utf8')
  const tc = M.fromJSON(text)

  it('validates without errors and is exactly what Export JSON writes', () => {
    expect(M.validate(tc).filter(p => p.level === 'error')).toEqual([])
    expect(M.toJSON(tc) + '\n').toBe(text)
  })

  it('generates arrange.zip with stops', async () => {
    const files = gtfs.buildTestFiles(tc)
    const stops = table(await zip.read(fileData(files, 'arrange.zip') as Uint8Array), 'stops.txt')
    expect(stops.length).toBeGreaterThan(0)
  })
})

it('model helpers', () => {
  const named = (...names: string[]) => names.map((name, i) => M.makeStation(i + 1, name, 0, 0))
  expect(M.nextStationName([])).toBe('A')
  expect(M.nextStationName(named('A', 'C'))).toBe('B')
  expect(M.nextStationName(named(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'))).toBe('AA')

  const line: M.Line = { id: 1, name: '', shortName: '', color: '', type: 3, stops: [] }
  M.appendStop(line, 1)
  line.stops[0].arrival = line.stops[0].departure = '09:15:00'
  M.appendStop(line, 2)
  expect(line.stops[1]).toMatchObject({ stationId: 2, arrival: '09:15:00' }) // copies the previous times

  const tc = M.defaultTestCase()
  tc.arrange.stations[1].name = tc.arrange.stations[0].name
  tc.arrange.calendars[0].end = '2000-01-01'
  const warnings = M.validate(tc).filter(p => p.level === 'warning').map(p => p.text).join('\n')
  expect(warnings).toContain('named "A"')
  expect(warnings).toContain('ends before it starts')
  const nameError = (name: string) => M.validate({ ...M.defaultTestCase(), name }).some(p => p.text === t('v.badName'))
  expect(['.', '..', 'a/b', ''].map(nameError)).toEqual([true, true, true, true])
  expect(nameError('v1.2 test')).toBe(false)

  // the inactive expected result survives a JSON round trip (autosave, export)
  tc.expected.type = 'exception'
  expect(M.fromJSON(M.toJSON(tc)).expected.model.stations).toHaveLength(3)

  // a failed conversion (latitude at a pole) leaves the station unchanged
  const station = M.makeStation(1, 'A', 10, 20)
  const before = { ...station }
  expect(() => M.setStationGPS(station, 90, 0)).toThrow()
  expect(() => M.setStationXY(station, 0, 90 * 110574)).toThrow()
  expect(station).toEqual(before)

  const enc = new TextEncoder()
  const files = {
    'calendar.txt': enc.encode('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nC1,1,1,1,1,1,1,1,20250101,20251231\n'),
    'trips.txt': enc.encode('route_id,service_id,trip_id\nR1,weekday,T1\n'),
  }
  expect(gtfs.importGTFS(files).model.trips[0].service).toBe(1) // unparsable service_id falls back to 1
})

it('limits: oversized test cases get warnings (only an overlong name is an error)', () => {
  const of = (tc: M.TestCase, level: string) => M.validate(tc).filter(p => p.level === level).map(p => p.text).join('\n')
  expect(of(M.defaultTestCase(), 'error')).toBe('')
  const big = M.defaultTestCase()
  big.arrange.stations = Array.from({ length: M.LIMITS.stations + 1 }, (_, i) => M.makeStation(i + 1, 'S' + i, i, 0))
  big.description = 'x'.repeat(M.LIMITS.description + 1)
  big.arrange.lines[0].name = 'n'.repeat(M.LIMITS.text + 1)
  expect(of(big, 'error')).toBe('') // the editor's limits, not the homework's: nothing blocks Generate
  const text = of(big, 'warning')
  expect(text).toContain(`${M.LIMITS.stations + 1} stations`)
  expect(text).toContain('comment.txt is')
  expect(text).toContain('1 station or line name(s) longer')
  big.name = 'a'.repeat(M.LIMITS.name + 1)
  expect(of(big, 'error')).toContain('Name is')
  // a field that came in longer than its limit has no maxlength, so it stays editable
  expect(M.room(M.LIMITS.text, 'short')).toBe(M.LIMITS.text)
  expect(M.room(M.LIMITS.description, big.description)).toBeUndefined()
  expect(M.countsOverLimit(big.arrange)).toEqual([{ what: 'stations', n: M.LIMITS.stations + 1, max: M.LIMITS.stations }])

  // stops count per line and for all lines together
  const stops = M.defaultTestCase().arrange
  const stop = { stationId: 1, arrival: '08:00:00', departure: '08:00:00' }
  stops.lines = Array.from({ length: 5 }, (_, i) => ({ ...stops.lines[0], id: i + 1, stops: Array(M.LIMITS.stops / 5 + 1).fill(stop) }))
  expect(M.countsOverLimit(stops).map(o => o.what)).toEqual(['stops'])

  // browser storage holds compact JSON; files people read stay indented
  const tc = M.defaultTestCase()
  expect(M.toJSON(tc, 0)).not.toContain('\n')
  expect(M.fromJSON(M.toJSON(tc, 0))).toEqual(M.fromJSON(M.toJSON(tc)))
})

it('map labels: overlapping ones are dropped, by priority', () => {
  // a station at (x, y) with a 100 px wide label to its upper right
  const at = (id: number, x: number, y: number, priority = 1) => ({
    id, priority, box: { x1: x + 10, y1: y - 12, x2: x + 110, y2: y + 4 }, dot: { x1: x - 8, y1: y - 8, x2: x + 8, y2: y + 8 },
  })
  const shown = (...c: ReturnType<typeof at>[]) => [...placeLabels(c)].sort()
  expect(shown(at(1, 0, 0), at(2, 300, 0))).toEqual([1, 2]) // far apart: both
  expect(shown(at(1, 0, 0), at(2, 40, 12))).toEqual([1]) // the labels overlap: the first one stays
  expect(shown(at(1, 0, 0), at(2, 40, 12, 3))).toEqual([2]) // …unless the other is the selected station
  expect(shown(at(1, 0, 0), at(2, 50, 0))).toEqual([2]) // 1's label would cover 2's dot
  expect(shown(at(1, 0, 0, 3), at(2, 50, 0))).toEqual([1]) // a selected station's label may cover dots
  expect([...placeLabels([at(1, 0, 0)], [at(9, 40, 12).box])]).toEqual([]) // an earlier pass's name blocks it
})

it('map spacing: second nearest station, as a brute force finds it', () => {
  let seed = 7
  const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647
  // a dense cluster, a sparse ring around it and a far loner
  const pts = [
    ...Array.from({ length: 300 }, (_, i) => ({ id: i, x: rnd() * 50, y: rnd() * 50 })),
    ...Array.from({ length: 40 }, (_, i) => ({ id: 300 + i, x: 1000 * Math.cos(i), y: 1000 * Math.sin(i) })),
    { id: 999, x: 90_000, y: -40_000 },
  ]
  const found = secondNearest(pts)
  for (const p of pts) {
    const d = pts.filter(q => q !== p).map(q => Math.hypot(q.x - p.x, q.y - p.y)).sort((a, b) => a - b)
    expect(found.get(p.id)).toBeCloseTo(d[1], 9)
  }
  expect(secondNearest([{ id: 1, x: 0, y: 0 }, { id: 2, x: 5, y: 0 }]).get(1)).toBe(Infinity)
  // stations along a line (one a hair off it) and a city far from a stray stop at 0,0
  const line = [...Array.from({ length: 200 }, (_, i) => ({ id: i, x: i * 10, y: 0 })), { id: 200, x: 5, y: 0.01 }]
  const city = [...Array.from({ length: 3000 }, (_, i) => ({ id: i, x: 1.4e6 + rnd() * 20_000, y: 5.2e6 + rnd() * 20_000 })), { id: 3000, x: 0, y: 0 }]
  for (const pts of [line, city]) {
    const t0 = performance.now(), found = secondNearest(pts), ms = performance.now() - t0
    expect(ms).toBeLessThan(200)
    for (const p of pts.slice(0, 50).concat(pts.at(-1)!)) {
      const d = pts.filter(q => q !== p).map(q => Math.hypot(q.x - p.x, q.y - p.y)).sort((a, b) => a - b)
      expect(found.get(p.id)).toBeCloseTo(d[1], 6)
    }
  }
})

it('act.txt split/join keeps field positions', () => {
  const act = acts.split('DIVERT_LINE\nZ2;Walk;Tower;Campus')
  expect(acts.fields(act)[1].values.join(';')).toBe('Walk;Tower;Campus') // the repeat param takes the rest
  expect(acts.join({ ...act, params: ['', '10'] })).toBe('DIVERT_LINE\n;10')
  expect(acts.join({ method: 'CLOSE_AREA', params: ['A', ''], rest: [] })).toBe('CLOSE_AREA\nA')
  expect(acts.join(acts.split('CLOSE_AREA\nA;10\nL1;L2'))).toBe('CLOSE_AREA\nA;10\nL1;L2')
  expect(acts.split('\nCLOSE_AREA\n\n A;10 \n')).toEqual({ method: 'CLOSE_AREA', params: ['A', '10'], rest: [] }) // blank lines skipped
  expect(acts.split(acts.join({ method: 'CLOSE_AREA', params: ['', ''], rest: ['L1'] })).rest).toEqual(['L1'])

  const keys = (text: string) => acts.checkAct(text, M.defaultTestCase().arrange).map(p => p.key)
  expect(keys('CLOSE_AREA\nA;15')).toEqual([])
  expect(keys('CLOSE_AREA\nX;ten')).toEqual(['v.actNoStation', 'v.actNotNumber'])
  expect(keys('DIVERT_LINE\nl1;A;Nope')).toEqual(['v.actNoStation']) // line names match case-insensitively
  expect(keys(M.defaultTestCase().act)).toEqual([]) // a new test case starts without warnings
  expect(keys('CLOSE_AREA\nA;20')).toEqual(['v.actOnBoundary']) // C is exactly 20 m from A
  expect(keys('CLOSE_AREA\nA;20.01')).toEqual([])
})

it('project files: unique names, Generate all / Export all zips import back', async () => {
  expect(M.uniqueName('a', ['b'])).toBe('a')
  expect(M.uniqueName('a', ['A', 'a_2'])).toBe('a_3') // case-insensitive
  expect(M.uniqueName('a_2', ['a_2'])).toBe('a_3')
  expect(M.uniqueName('line_10', ['line_10', 'line_11'])).toBe('line_12')

  const cases = readdirSync(EXAMPLES).filter(f => f.endsWith('.json')).map(f => M.fromJSON(readFileSync(join(EXAMPLES, f), 'utf8')))
  const roundTrip = async (entries: zip.ZipEntry[], zipName = 'all.zip') =>
    submission.readZip(zipName, await zip.read(zip.create(entries)))

  const all = await roundTrip(submission.allSubmissions(cases))
  expect(all.failed).toEqual([])
  expect(all.cases.map(c => c.name)).toEqual(cases.map(c => c.name)) // one folder each, named after it
  for (const [i, c] of all.cases.entries()) {
    expect(c.act).toBe(cases[i].act)
    expect(c.expected.type).toBe(cases[i].expected.type)
    expect(c.arrange.stations).toHaveLength(cases[i].arrange.stations.length)
  }

  const single = await roundTrip(gtfs.buildTestFiles(cases[0]), 'renamed.zip')
  expect(single.cases.map(c => c.name)).toEqual(['renamed']) // a submission at the zip's root is named after the zip
  const oneFolder = await roundTrip(submission.allSubmissions([cases[0]]), 'all.zip')
  expect(oneFolder.cases.map(c => c.name)).toEqual([cases[0].name]) // one in a folder after the folder

  const json = await roundTrip([...cases.map(c => ({ name: c.name + '.json', data: M.toJSON(c) })), { name: 'broken.json', data: '{' }])
  expect(json.cases.map(c => M.toJSON(c))).toEqual(cases.map(c => M.toJSON(c)))
  expect(json.failed).toEqual(['broken.json'])

  const feed = await roundTrip(gtfs.modelToGTFSFiles(cases[0].arrange, cases[0].agency), 'city.zip')
  expect(feed.cases).toEqual([])
  expect(Object.keys(feed.gtfs ?? {})).toContain('stops.txt')
})

const submissions = existsSync(SUBMITTED)
  ? readdirSync(SUBMITTED).filter(d => statSync(join(SUBMITTED, d)).isDirectory())
  : []

describe.skipIf(submissions.length === 0)('submitted-tests round trip', () => {
  it.each(submissions)('%s', async (dir) => {
    const base = join(SUBMITTED, dir)
    const readTxt = (f: string) => existsSync(join(base, f))
      ? readFileSync(join(base, f), 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '')
      : null
    const readZip = (f: string) => zip.read(new Uint8Array(readFileSync(join(base, f))))

    const arrangeFiles = await readZip('arrange.zip')
    const { model: arrange, agency } = gtfs.importGTFS(arrangeFiles)
    const tc: M.TestCase = {
      version: 1,
      name: dir,
      description: readTxt('comment.txt') ?? '',
      act: readTxt('act.txt') ?? '',
      agency: agency ?? { name: '', url: '', timezone: '', language: '', phone: '' },
      arrange,
      expected: { type: 'model', exception: 'INVALID_ARGUMENT', model: M.emptyModel() },
    }
    const assertText = readTxt('assert.txt')
    const assertFiles = assertText === null ? await readZip('assert.zip') : null
    if (assertFiles) tc.expected.model = gtfs.importGTFS(assertFiles).model
    else Object.assign(tc.expected, { type: 'exception', exception: assertText })

    const tc2 = M.fromJSON(M.toJSON(tc))
    expect(M.validate(tc2).filter(p => p.level === 'error')).toEqual([]) // real, accepted tests
    const generated = gtfs.buildTestFiles(tc2)
    expect(fileData(generated, 'comment.txt')).toBe(tc.description + '\n')
    expect(fileData(generated, 'act.txt')).toBe(tc.act + '\n')

    const compare = async (original: Record<string, Uint8Array>, name: string) => {
      const regenerated = await zip.read(fileData(generated, name) as Uint8Array)
      for (const t of TABLES) expect(rows(t, table(regenerated, t)), `${name}/${t}`).toEqual(rows(t, table(original, t)))
    }
    await compare(arrangeFiles, 'arrange.zip')
    if (assertFiles) await compare(assertFiles, 'assert.zip')
    else expect(fileData(generated, 'assert.txt')).toBe(assertText + '\n')
  })
})

// the columns that matter, normalized, as sorted keys (row order and formatting are free)
function rows(name: string, list: Record<string, string>[]) {
  const service = (v: string | undefined) => String(v ?? '').replace(/^C/, '')
  const key: Record<string, (r: Record<string, string>) => string> = {
    'agency.txt': r => JSON.stringify(r),
    'stops.txt': r => `${r.stop_id}|${r.stop_name}|${(+r.stop_lat).toFixed(9)}|${(+r.stop_lon).toFixed(9)}`,
    'routes.txt': r => `${r.route_id}|${r.route_short_name}|${r.route_long_name}|${+r.route_type}|${(r.route_color || '').toUpperCase()}`,
    'trips.txt': r => `${r.route_id}|${service(r.service_id)}|${r.trip_id}`,
    'calendar.txt': r => `${service(r.service_id)}|${r.monday}${r.tuesday}${r.wednesday}${r.thursday}${r.friday}${r.saturday}${r.sunday}|${r.start_date}|${r.end_date}`,
    'stop_times.txt': r => `${r.trip_id}|${r.arrival_time}|${r.departure_time}|${r.stop_id}|${+r.stop_sequence}`,
  }
  return list.map(key[name]).sort()
}

it('undo steps restore exactly and share unchanged pieces', () => {
  const tc = M.fromJSON(readFileSync(join(EXAMPLES, 'example3_divertLine.json'), 'utf8'))
  const a = history.snapshot(tc)
  expect(history.restore(a)).toEqual(tc)
  tc.arrange.stations[1].x += 5 // one station moved
  const b = history.snapshot(tc, a)
  expect(history.restore(b)).toEqual(tc)
  expect(b.pieces.filter((p, i) => p !== a.pieces[i])).toHaveLength(1) // only its piece is new
  expect(history.sameSnapshot(history.snapshot(tc, b), b)).toBe(true)
  expect(history.sameSnapshot(a, b)).toBe(false)
})

it('limits: large models allowed with IndexedDB', () => {
  const before = { ...M.LIMITS }
  try {
    M.allowLargeModels()
    expect(M.LIMITS.stations).toBeGreaterThanOrEqual(4251) // all of Budapest
    expect(M.LIMITS.name).toBe(before.name) // text lengths stay
  } finally { Object.assign(M.LIMITS, before) }
})

it('file weights: every example is light, a whole city huge', () => {
  for (const f of readdirSync(EXAMPLES)) expect(M.fileWeight(M.toJSON(M.fromJSON(readFileSync(join(EXAMPLES, f), 'utf8')), 0).length)).toBe('light')
  expect([M.fileWeight(50_000), M.fileWeight(1_000_000)]).toEqual(['heavy', 'huge'])
})
