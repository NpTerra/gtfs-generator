// Mapping between the test-case model and GTFS txt/zip files. The output
// mirrors the Java generator:
//   station 3 -> stop_id "S3", line 2 -> route_id "R2",
//   calendar 1 -> service_id "C1", trip 4 -> trip_id "T4"
import * as csv from './csv'
import * as zip from './zip'
import type { Agency, Calendar, Model, TestCase } from './model'
import { emptyModel, normalizeTime, round6, syncFromGPS, syncFromXY } from './model'

export interface Offset { lat: number; lon: number }

const cols = (pairs: [string, string][]) => pairs.map(([key, header]) => ({ key, header }))
const COLS = {
  agency: cols([['name', 'agency_name'], ['url', 'agency_url'], ['timezone', 'agency_timezone'], ['language', 'agency_lang'], ['phone', 'agency_phone']]),
  stops: cols([['id', 'stop_id'], ['name', 'stop_name'], ['lat', 'stop_lat'], ['lon', 'stop_lon']]),
  routes: cols([['id', 'route_id'], ['shortName', 'route_short_name'], ['longName', 'route_long_name'], ['type', 'route_type'], ['color', 'route_color']]),
  trips: cols([['routeId', 'route_id'], ['serviceId', 'service_id'], ['tripId', 'trip_id']]),
  calendar: cols([['service', 'service_id'], ['monday', 'monday'], ['tuesday', 'tuesday'], ['wednesday', 'wednesday'],
    ['thursday', 'thursday'], ['friday', 'friday'], ['saturday', 'saturday'], ['sunday', 'sunday'],
    ['startDate', 'start_date'], ['endDate', 'end_date']]),
  stopTimes: cols([['trip', 'trip_id'], ['arrival', 'arrival_time'], ['departure', 'departure_time'], ['stop', 'stop_id'], ['sequence', 'stop_sequence']]),
}

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

// offset: whole degrees added to every station's GPS position
export function modelToGTFSFiles(model: Model, agency: Agency, offset?: Offset, fallbackCalendars?: Calendar[]): zip.ZipEntry[] {
  const off = offset ?? { lat: 0, lon: 0 }
  const stops = model.stations.map(s => ({ id: 'S' + s.id, name: s.name, lat: s.lat + off.lat, lon: s.lon + off.lon }))
  const routes = model.lines.map(l => ({
    id: 'R' + l.id, shortName: l.shortName, longName: l.name, type: l.type,
    color: String(l.color ?? '').replace(/^#/, '').toUpperCase(),
  }))
  const trips = model.trips.map(tr => ({ routeId: 'R' + tr.line, serviceId: 'C' + tr.service, tripId: 'T' + tr.id }))

  const calendarSource = model.calendars.length > 0 ? model.calendars : (fallbackCalendars ?? [])
  const calendars = calendarSource.map(c => {
    const row: Record<string, unknown> = { service: 'C' + c.id }
    DAYS.forEach((day, i) => { row[day] = c.availability[i] ? 1 : 0 })
    row.startDate = String(c.start).replaceAll('-', '')
    row.endDate = String(c.end).replaceAll('-', '')
    return row
  })

  // same expansion as the Java generator: per line, per stop, per trip of that line
  const stopTimes: Record<string, unknown>[] = []
  for (const line of model.lines) {
    line.stops.forEach((stop, i) => {
      for (const trip of model.trips) {
        if (trip.line !== line.id) continue
        stopTimes.push({
          trip: 'T' + trip.id,
          arrival: normalizeTime(stop.arrival) ?? '00:00:00',
          departure: normalizeTime(stop.departure) ?? '00:00:00',
          stop: 'S' + stop.stationId,
          sequence: i + 1,
        })
      }
    })
  }

  return [
    { name: 'agency.txt', data: csv.write(COLS.agency, [agency as unknown as csv.Row]) },
    { name: 'stops.txt', data: csv.write(COLS.stops, stops) },
    { name: 'routes.txt', data: csv.write(COLS.routes, routes) },
    { name: 'trips.txt', data: csv.write(COLS.trips, trips) },
    { name: 'calendar.txt', data: csv.write(COLS.calendar, calendars) },
    { name: 'stop_times.txt', data: csv.write(COLS.stopTimes, stopTimes) },
  ]
}

// Random whole-degree offsets (anti-plagiarism) that keep every station of
// both models on valid, non-wrapping coordinates.
export function pickOffsets(tc: TestCase, rand: () => number = Math.random): Offset {
  const stations = [...tc.arrange.stations, ...(tc.expected.type === 'model' ? tc.expected.model.stations : [])]
  let minLat = 0, maxLat = 0, minLon = 0, maxLon = 0
  for (const s of stations) {
    minLat = Math.min(minLat, s.lat); maxLat = Math.max(maxLat, s.lat)
    minLon = Math.min(minLon, s.lon); maxLon = Math.max(maxLon, s.lon)
  }
  // keep results within lat ±80 and lon ±179
  const latLo = Math.max(-60, Math.ceil(-80 - minLat))
  const latHi = Math.min(60, Math.floor(80 - maxLat))
  const lonLo = Math.max(-150, Math.ceil(-179 - minLon))
  const lonHi = Math.min(150, Math.floor(179 - maxLon))
  const pick = (lo: number, hi: number) => lo > hi ? 0 : lo + Math.floor(rand() * (hi - lo + 1))
  return { lat: pick(latLo, latHi), lon: pick(lonLo, lonHi) }
}

// The four submission files.
export function buildTestFiles(tc: TestCase, offset?: Offset): zip.ZipEntry[] {
  const off = tc.randomizeOffsets ? (offset ?? pickOffsets(tc)) : { lat: 0, lon: 0 }
  const files: zip.ZipEntry[] = [
    { name: 'comment.txt', data: tc.description + '\n' },
    { name: 'act.txt', data: tc.act + '\n' },
    { name: 'arrange.zip', data: zip.create(modelToGTFSFiles(tc.arrange, tc.agency, off)) },
  ]
  if (tc.expected.type === 'exception')
    files.push({ name: 'assert.txt', data: tc.expected.exception + '\n' })
  else
    files.push({ name: 'assert.zip', data: zip.create(modelToGTFSFiles(tc.expected.model, tc.agency, off, tc.arrange.calendars)) })
  return files
}

// ---- GTFS -> model (import) -----------------------------------------------------

function numericId(text: string | undefined, used: Set<number>): number {
  const m = String(text ?? '').match(/^[A-Za-z]*0*(\d+)$/)
  let id = m ? parseInt(m[1], 10) : null
  if (id === null || used.has(id)) {
    id = 1
    while (used.has(id)) id++
  }
  used.add(id)
  return id
}

export function importGTFS(filesMap: Record<string, Uint8Array>): { model: Model; agency: Agency | null } {
  const decoder = new TextDecoder()
  const table = (name: string) => filesMap[name] ? csv.parse(decoder.decode(filesMap[name])) : []

  const model = emptyModel()
  let agency: Agency | null = null

  const agencyRows = table('agency.txt')
  if (agencyRows.length > 0) {
    const a = agencyRows[0]
    agency = {
      name: a.agency_name ?? '', url: a.agency_url ?? '', timezone: a.agency_timezone ?? '',
      language: a.agency_lang ?? '', phone: a.agency_phone ?? '',
    }
  }

  const stationIds = new Map<string, number>() // "S1" -> 1
  const usedStationIds = new Set<number>()
  for (const row of table('stops.txt')) {
    const id = numericId(row.stop_id, usedStationIds)
    stationIds.set(row.stop_id, id)
    const station = {
      id, name: row.stop_name ?? '', coordMode: 'xy' as const, x: 0, y: 0,
      lat: parseFloat(row.stop_lat) || 0, lon: parseFloat(row.stop_lon) || 0,
    }
    syncFromGPS(station)
    station.x = round6(station.x)
    station.y = round6(station.y)
    syncFromXY(station)
    model.stations.push(station)
  }

  const lineIds = new Map<string, number>()
  const usedLineIds = new Set<number>()
  for (const row of table('routes.txt')) {
    const id = numericId(row.route_id, usedLineIds)
    lineIds.set(row.route_id, id)
    model.lines.push({
      id,
      name: row.route_long_name || row.route_short_name || ('Line ' + id),
      shortName: row.route_short_name ?? '',
      color: '#' + (row.route_color || '000000').replace(/^#/, '').toUpperCase(),
      type: parseInt(row.route_type, 10) || 0,
      stops: [],
    })
  }

  const calendarIds = new Map<string, number>()
  const usedCalendarIds = new Set<number>()
  const isoDate = (v: string | undefined) => /^\d{8}$/.test(v ?? '')
    ? `${v!.slice(0, 4)}-${v!.slice(4, 6)}-${v!.slice(6, 8)}`
    : (v ?? '')
  for (const row of table('calendar.txt')) {
    const id = numericId(row.service_id, usedCalendarIds)
    calendarIds.set(row.service_id, id)
    model.calendars.push({
      id, start: isoDate(row.start_date), end: isoDate(row.end_date),
      availability: DAYS.map(d => row[d] === '1' ? 1 : 0),
    })
  }

  const tripIds = new Map<string, number>()
  const usedTripIds = new Set<number>()
  for (const row of table('trips.txt')) {
    const id = numericId(row.trip_id, usedTripIds)
    tripIds.set(row.trip_id, id)
    // barebones generators sometimes wrote "1" instead of "C1"; match leniently
    const parsed = parseInt(String(row.service_id).replace(/^\D*/, ''), 10)
    const service = calendarIds.get(row.service_id)
      ?? calendarIds.get('C' + row.service_id)
      ?? (Number.isNaN(parsed) ? 1 : parsed)
    model.trips.push({ id, line: lineIds.get(row.route_id) ?? 0, service })
  }

  // stop_times: reconstruct each line's stop list from its first trip
  const byTrip = new Map<string, Record<string, string>[]>()
  for (const row of table('stop_times.txt')) {
    if (!byTrip.has(row.trip_id)) byTrip.set(row.trip_id, [])
    byTrip.get(row.trip_id)!.push(row)
  }
  for (const rows of byTrip.values())
    rows.sort((a, b) => parseInt(a.stop_sequence, 10) - parseInt(b.stop_sequence, 10))

  for (const line of model.lines) {
    const trip = model.trips.find(tr => tr.line === line.id)
    if (!trip) continue
    const originalTripId = [...tripIds.entries()].find(([, v]) => v === trip.id)?.[0]
    const rows = (originalTripId !== undefined ? byTrip.get(originalTripId) : undefined) ?? []
    line.stops = rows.map(r => ({
      stationId: stationIds.get(r.stop_id) ?? 0,
      arrival: r.arrival_time ?? '',
      departure: r.departure_time ?? '',
    }))
  }

  return { model, agency }
}
