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
import * as M from '../src/lib/model'
import * as zip from '../src/lib/zip'

const ROOT = join(__dirname, '..')
const EXAMPLES = join(ROOT, 'examples')
const SUBMITTED = join(ROOT, 'submitted-tests')
const TABLES = ['agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'calendar.txt', 'stop_times.txt']

const decoder = new TextDecoder()
const table = (files: Record<string, Uint8Array>, name: string) => files[name] ? csv.parse(decoder.decode(files[name])) : []
const fileData = (files: zip.ZipEntry[], name: string) => files.find(f => f.name === name)?.data

describe.each(readdirSync(EXAMPLES).filter(f => f.endsWith('.json')))('example %s', (file) => {
  const tc = M.fromJSON(readFileSync(join(EXAMPLES, file), 'utf8'))

  it('validates without errors and survives a JSON round trip', () => {
    expect(M.validate(tc).filter(p => p.level === 'error')).toEqual([])
    expect(M.toJSON(M.fromJSON(M.toJSON(tc)))).toBe(M.toJSON(tc))
  })

  it('generates, with coordinates in range even at the largest random offset', async () => {
    const offset = gtfs.pickOffsets({ ...tc, randomizeOffsets: true }, () => 0.99)
    const files = gtfs.buildTestFiles(tc, offset)
    const stops = table(await zip.read(fileData(files, 'arrange.zip') as Uint8Array), 'stops.txt')
    expect(stops.length).toBeGreaterThan(0)
    expect(stops.filter(s => Math.abs(+s.stop_lat) > 85 || Math.abs(+s.stop_lon) > 180)).toEqual([])
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

  const enc = new TextEncoder()
  const files = {
    'calendar.txt': enc.encode('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nC1,1,1,1,1,1,1,1,20250101,20251231\n'),
    'trips.txt': enc.encode('route_id,service_id,trip_id\nR1,weekday,T1\n'),
  }
  expect(gtfs.importGTFS(files).model.trips[0].service).toBe(1) // unparsable service_id falls back to 1
})

it('act.txt split/join keeps field positions', () => {
  const act = acts.split('DIVERT_LINE\nZ2;Walk;Tower;Campus')
  expect(acts.fields(act)[1].values.join(';')).toBe('Walk;Tower;Campus') // the repeat param takes the rest
  expect(acts.join({ ...act, params: ['', '10'] })).toBe('DIVERT_LINE\n;10')
  expect(acts.join({ method: 'CLOSE_AREA', params: ['A', ''], rest: [] })).toBe('CLOSE_AREA\nA')
  expect(acts.join(acts.split('CLOSE_AREA\nA;10\nL1;L2'))).toBe('CLOSE_AREA\nA;10\nL1;L2')

  const keys = (text: string) => acts.checkAct(text, M.defaultTestCase().arrange).map(p => p.key)
  expect(keys('CLOSE_AREA\nA;10')).toEqual([])
  expect(keys('CLOSE_AREA\nX;ten')).toEqual(['v.actNoStation', 'v.actNotNumber'])
  expect(keys('DIVERT_LINE\nl1;A;Nope')).toEqual(['v.actNoStation']) // line names match case-insensitively
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
      randomizeOffsets: false,
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
    const generated = gtfs.buildTestFiles(tc2, { lat: 0, lon: 0 })
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
