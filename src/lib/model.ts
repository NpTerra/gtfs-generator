// Test-case data model: types, defaults, coordinate sync, JSON (de)serialization,
// validation.
import { gpsToXY, xyToGPS } from './geo'
import { t } from './i18n'
import { checkAct } from './acts'

// ---- types ------------------------------------------------------------------

export type CoordMode = 'xy' | 'gps'

// A station always carries both coordinate systems; coordMode says which one
// the user edits (and which one is authoritative when saving).
export interface Station { id: number; name: string; coordMode: CoordMode; x: number; y: number; lat: number; lon: number }
export interface Stop { stationId: number; arrival: string; departure: string }
export interface Line { id: number; name: string; shortName: string; color: string; type: number; stops: Stop[] }
export interface Calendar { id: number; start: string; end: string; availability: number[] }
export interface Trip { id: number; line: number; service: number }
export interface Model { stations: Station[]; lines: Line[]; calendars: Calendar[]; trips: Trip[] }
export interface Agency { name: string; url: string; timezone: string; language: string; phone: string }
export interface Expected { type: 'model' | 'exception'; exception: string; model: Model }

export interface TestCase {
  version: 1
  name: string
  description: string
  act: string
  agency: Agency
  arrange: Model
  expected: Expected
}

export interface Problem { level: 'error' | 'warning'; text: string }

export const KNOWN_EXCEPTIONS = [
  'INVALID_ARGUMENT',
  'AMBIGUOUS_STATION_NAMES',
  'RADIUS_TOO_SMALL',
  'TOO_MANY_LINE_FRAGMENTS',
  'TOO_MANY_SHORT_LINES',
  'LOOP_ON_LINE',
  'NOT_NEIGHBOR_STATIONS_IN_SELECTION',
]

// default colors for new lines (and imported routes without route_color)
export const LINE_COLORS = ['#AABBCC', '#FF00FF', '#00AA55', '#FF7700', '#3355FF', '#BB2222']

export function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6
}

// ---- stations -------------------------------------------------------------------

export function syncFromXY(station: Station) {
  const gps = xyToGPS(station.x, station.y)
  station.lat = gps.lat
  station.lon = gps.lon
}

export function syncFromGPS(station: Station) {
  const xy = gpsToXY(station.lat, station.lon)
  station.x = xy.x
  station.y = xy.y
}

export function makeStation(id: number, name: string, x: number, y: number): Station {
  const s: Station = { id, name, coordMode: 'xy', x, y, lat: 0, lon: 0 }
  syncFromXY(s)
  return s
}

// the conversion runs before anything is assigned, so when it throws (latitude
// at a pole) the station stays unchanged
export function setStationXY(station: Station, x: number, y: number) {
  Object.assign(station, { x, y }, xyToGPS(x, y))
}

export function setStationGPS(station: Station, lat: number, lon: number) {
  Object.assign(station, { lat, lon }, gpsToXY(lat, lon))
}

// ---- factories ------------------------------------------------------------------

export function emptyModel(): Model {
  return { stations: [], lines: [], calendars: [], trips: [] }
}

export function nextId(list: { id: number }[]): number {
  return list.reduce((max, item) => Math.max(max, item.id), 0) + 1
}

// first unused name of A, B, ..., Z, AA, AB, ...
export function nextStationName(stations: Station[]): string {
  const used = new Set(stations.map(s => s.name))
  for (let i = 0; ; i++) {
    let name = ''
    let n = i
    do { name = String.fromCharCode(65 + (n % 26)) + name; n = Math.floor(n / 26) - 1 } while (n >= 0)
    if (!used.has(name)) return name
  }
}

// appends a stop, copying the previous stop's times
export function appendStop(line: Line, stationId: number) {
  const last = line.stops[line.stops.length - 1]
  line.stops.push({
    stationId,
    arrival: last ? last.arrival : '08:00:00',
    departure: last ? last.departure : '08:00:00',
  })
}

export function cloneModel(model: Model): Model {
  return JSON.parse(JSON.stringify(model))
}

export function defaultTestCase(): TestCase {
  const arrange: Model = {
    stations: [makeStation(1, 'A', 0, 0), makeStation(2, 'B', 10, 0), makeStation(3, 'C', 20, 0)],
    lines: [{
      id: 1, name: 'L1', shortName: 'L1', color: '#AABBCC', type: 1,
      stops: [1, 2, 3].map(stationId => ({ stationId, arrival: '08:00:00', departure: '08:00:00' })),
    }],
    calendars: [{ id: 1, start: '2025-01-01', end: '2025-12-31', availability: [1, 1, 1, 1, 1, 1, 1] }],
    trips: [{ id: 1, line: 1, service: 1 }],
  }
  return {
    version: 1,
    name: 'my_test',
    description: 'Describe what this test verifies.',
    act: 'CLOSE_AREA\nA;15', // B (10 m) clearly inside, C (20 m) clearly outside: no boundary case
    agency: {
      name: 'Your Transit Agency',
      url: 'http://www.yourtransitagency.com',
      timezone: 'America/New_York',
      language: 'en',
      phone: '',
    },
    arrange,
    expected: { type: 'model', exception: 'INVALID_ARGUMENT', model: cloneModel(arrange) },
  }
}

// ---- time / date helpers --------------------------------------------------------------

// Accepts "8:00", "08:00", "8:00:00", "26:05:00" (GTFS allows hours > 23).
// Returns normalized "HH:MM:SS", or null if invalid.
export function normalizeTime(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return '00:00:00'
  const s = String(value).trim()
  if (s === '') return '00:00:00'
  const m = s.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/)
  if (!m) return null
  const pad = (v: string | number) => String(v).padStart(2, '0')
  return `${pad(m[1])}:${pad(m[2])}:${pad(m[3] ?? 0)}`
}

export function isValidDate(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))
}

// ---- JSON import/export -----------------------------------------------------------------

export function toJSON(tc: TestCase): string {
  const mapStation = (s: Station) => s.coordMode === 'gps'
    ? { id: s.id, name: s.name, coordMode: s.coordMode, lat: s.lat, lon: s.lon }
    : { id: s.id, name: s.name, coordMode: s.coordMode, x: s.x, y: s.y }
  const mapModel = (m: Model) => ({
    stations: m.stations.map(mapStation),
    lines: m.lines.map(l => ({
      id: l.id, name: l.name, shortName: l.shortName, color: l.color, type: l.type,
      stops: l.stops.map(st => ({ stationId: st.stationId, arrival: st.arrival, departure: st.departure })),
    })),
    calendars: m.calendars.map(c => ({ id: c.id, start: c.start, end: c.end, availability: [...c.availability] })),
    trips: m.trips.map(tr => ({ id: tr.id, line: tr.line, service: tr.service })),
  })

  return JSON.stringify({
    version: 1,
    name: tc.name,
    description: tc.description,
    act: tc.act,
    agency: { ...tc.agency },
    arrange: mapModel(tc.arrange),
    // both, so switching the type back (or reloading) keeps the other one
    expected: { type: tc.expected.type, exception: tc.expected.exception, model: mapModel(tc.expected.model) },
  }, null, 2)
}

const num = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// Untrusted input (imported files, old autosaves): every field is coerced to its type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = any

export function fromJSON(text: string): TestCase {
  const raw: Raw = JSON.parse(text)
  if (typeof raw !== 'object' || raw === null) throw new Error('Not a test-case file.')

  const readStation = (s: Raw): Station => {
    const station: Station = {
      id: num(s.id, 0), name: String(s.name ?? ''),
      coordMode: s.coordMode === 'gps' ? 'gps' : 'xy',
      x: 0, y: 0, lat: 0, lon: 0,
    }
    if (station.coordMode === 'gps') {
      station.lat = num(s.lat, 0)
      station.lon = num(s.lon, 0)
      syncFromGPS(station)
    } else {
      station.x = num(s.x, 0)
      station.y = num(s.y, 0)
      syncFromXY(station)
    }
    return station
  }
  const readModel = (m: Raw): Model => {
    m = m ?? {}
    return {
      stations: (m.stations ?? []).map(readStation),
      lines: (m.lines ?? []).map((l: Raw) => ({
        id: num(l.id, 0),
        name: String(l.name ?? ''),
        shortName: String(l.shortName ?? ''),
        color: String(l.color ?? '#000000'),
        type: num(l.type, 1),
        stops: (l.stops ?? []).map((st: Raw) => ({
          stationId: num(st.stationId, 0),
          arrival: String(st.arrival ?? ''),
          departure: String(st.departure ?? ''),
        })),
      })),
      calendars: (m.calendars ?? []).map((c: Raw) => ({
        id: num(c.id, 0),
        start: String(c.start ?? ''),
        end: String(c.end ?? ''),
        availability: Array.from({ length: 7 }, (_, i) => (c.availability ?? [])[i] ? 1 : 0),
      })),
      trips: (m.trips ?? []).map((tr: Raw) => ({ id: num(tr.id, 0), line: num(tr.line, 0), service: num(tr.service, 0) })),
    }
  }

  const expected = raw.expected ?? {}
  return {
    version: 1,
    name: String(raw.name ?? 'unnamed_test'),
    description: String(raw.description ?? ''),
    act: String(raw.act ?? ''),
    agency: {
      name: String(raw.agency?.name ?? ''),
      url: String(raw.agency?.url ?? ''),
      timezone: String(raw.agency?.timezone ?? ''),
      language: String(raw.agency?.language ?? ''),
      phone: String(raw.agency?.phone ?? ''),
    },
    arrange: readModel(raw.arrange),
    expected: {
      type: expected.type === 'exception' ? 'exception' : 'model',
      exception: String(expected.exception ?? 'INVALID_ARGUMENT'),
      model: readModel(expected.model),
    },
  }
}

// ---- validation ---------------------------------------------------------------------------

export function isPhoneMissing(agency: Agency | undefined): boolean {
  return !agency?.phone?.trim() || /123-456-7890/.test(agency.phone)
}

function validateModel(model: Model, label: string, problems: Problem[]) {
  const stationIds = new Set<number>()
  const nameCounts = new Map<string, number>()
  for (const s of model.stations) {
    if (stationIds.has(s.id)) problems.push({ level: 'error', text: t('v.dupStation', { label, id: s.id }) })
    stationIds.add(s.id)
    if (!s.name) problems.push({ level: 'warning', text: t('v.stationNoName', { label, id: s.id }) })
    else nameCounts.set(s.name, (nameCounts.get(s.name) ?? 0) + 1)
  }
  // only a warning: AMBIGUOUS_STATION_NAMES tests need duplicates on purpose
  for (const [name, n] of nameCounts)
    if (n > 1) problems.push({ level: 'warning', text: t('v.dupStationName', { label, name, n }) })

  const lineIds = new Set<number>()
  for (const l of model.lines) {
    if (lineIds.has(l.id)) problems.push({ level: 'error', text: t('v.dupLine', { label, id: l.id }) })
    lineIds.add(l.id)
    if (l.stops.length < 2) problems.push({ level: 'warning', text: t('v.fewStops', { label, name: l.name }) })
    l.stops.forEach((st, i) => {
      if (!stationIds.has(st.stationId))
        problems.push({ level: 'error', text: t('v.stopMissingStation', { label, name: l.name, n: i + 1, id: st.stationId }) })
      if (normalizeTime(st.arrival) === null)
        problems.push({ level: 'error', text: t('v.badArrival', { label, name: l.name, n: i + 1, time: st.arrival }) })
      if (normalizeTime(st.departure) === null)
        problems.push({ level: 'error', text: t('v.badDeparture', { label, name: l.name, n: i + 1, time: st.departure }) })
    })
  }

  const calendarIds = new Set<number>()
  for (const c of model.calendars) {
    if (calendarIds.has(c.id)) problems.push({ level: 'error', text: t('v.dupCalendar', { label, id: c.id }) })
    calendarIds.add(c.id)
    if (!isValidDate(c.start) || !isValidDate(c.end))
      problems.push({ level: 'error', text: t('v.badDates', { label, id: c.id }) })
    else if (c.start > c.end)
      problems.push({ level: 'warning', text: t('v.calendarOrder', { label, id: c.id }) })
  }

  const tripIds = new Set<number>()
  for (const trip of model.trips) {
    if (tripIds.has(trip.id)) problems.push({ level: 'error', text: t('v.dupTrip', { label, id: trip.id }) })
    tripIds.add(trip.id)
    if (!lineIds.has(trip.line))
      problems.push({ level: 'error', text: t('v.tripMissingLine', { label, id: trip.id, line: trip.line }) })
  }

  for (const l of model.lines)
    if (l.stops.length > 0 && !model.trips.some(trip => trip.line === l.id))
      problems.push({ level: 'warning', text: t('v.lineNoTrips', { label, name: l.name }) })

  return calendarIds
}

// the test name is also the zip, folder and project file name; "." and ".."
// pass the character check but are no usable name
export function isBadName(name: string): boolean {
  return !/^[A-Za-z0-9_\-. ]+$/.test(name) || !/[^. ]/.test(name)
}

// name if it is free, else the next free numbered one: a -> a_2, a_2 -> a_3, line_10 -> line_11
// (compared case-insensitively, as on macOS/Windows disks)
export function uniqueName(name: string, taken: string[]): string {
  const used = new Set(taken.map(n => n.toLowerCase()))
  if (!used.has(name.toLowerCase())) return name
  const m = /^(.*)_(\d+)$/.exec(name)
  const base = m ? m[1] : name
  let n = m ? Number(m[2]) + 1 : 2
  while (used.has(`${base}_${n}`.toLowerCase())) n++
  return `${base}_${n}`
}

export function validate(tc: TestCase): Problem[] {
  const problems: Problem[] = []

  if (isBadName(tc.name)) problems.push({ level: 'error', text: t('v.badName') })
  if (!tc.description?.trim()) problems.push({ level: 'warning', text: t('v.noDescription') })
  if (!tc.act?.trim()) problems.push({ level: 'error', text: t('v.noAct') })
  for (const p of checkAct(tc.act, tc.arrange)) problems.push({ level: 'warning', text: t(p.key, p.params) })
  if (isPhoneMissing(tc.agency)) problems.push({ level: 'warning', text: t('v.phone') })

  const arrangeCalendars = validateModel(tc.arrange, 'Arrange', problems)
  for (const trip of tc.arrange.trips)
    if (!arrangeCalendars.has(trip.service))
      problems.push({ level: 'error', text: t('v.tripMissingCalendar', { label: 'Arrange', id: trip.id, service: trip.service }) })

  if (tc.expected.type === 'exception') {
    if (!tc.expected.exception?.trim()) problems.push({ level: 'error', text: t('v.noException') })
  } else {
    const expectedCalendars = validateModel(tc.expected.model, 'Expected', problems)
    // the expected model may borrow the arrange calendars when it has none
    const effective = tc.expected.model.calendars.length > 0 ? expectedCalendars : arrangeCalendars
    for (const trip of tc.expected.model.trips)
      if (!effective.has(trip.service))
        problems.push({ level: 'error', text: t('v.tripMissingCalendar', { label: 'Expected', id: trip.id, service: trip.service }) })
  }
  return problems
}
