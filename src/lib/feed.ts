// Importing routes from a real-world GTFS feed into a test-case model.
//
// Real feeds are large (hundreds of routes, thousands of stops, millions of
// stop_times), so instead of copying everything this picks routes:
//   - each route becomes one line, built from its longest trip
//   - platforms are merged into their parent station (act.txt names stations);
//     optionally also stops with the same name close together (feeds without
//     parent stations list every platform of a hub as its own stop)
//   - only stops used by the picked lines become stations, in GPS mode so
//     their coordinates stay exact
//   - trips: one per line, or every trip of the route with the same stop count
//     and the same first and last stop as the line (the line's times apply to
//     all of them anyway); the dialog picks one per line when some route has
//     more than 5 such trips
//   - calendars come from calendar.txt, or are derived from calendar_dates.txt
// The agency is left alone: the test keeps its assigned phone number.

// the files this reads; zips can skip the rest (shapes.txt alone can be tens of MB)
export const FEED_FILES = new Set(['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt'])
import * as csv from './csv'
import { DAYS, numericId } from './gtfs'
import type { Calendar, Line, Model, Station, Trip } from './model'
import { emptyModel, LINE_COLORS, syncFromGPS } from './model'

export interface FeedRoute {
  key: string // route_id
  shortName: string
  longName: string
  color: string // "#RRGGBB"
  type: number
  stopCount: number // stops on its longest trip
  tripCount: number // trips sharing that stop pattern
}

export interface Feed {
  routes: FeedRoute[]
  build(routeKeys: string[], oneTripPerLine: boolean, mergeWithin?: number): Model // mergeWithin: meters, 0 = off
}

interface TripInfo { route: string; service: string; count: number; minSeq: number; maxSeq: number; first: string; last: string }

const SPAN = 1000 // meters: how far a merged group of same-named stops reaches from its first

const routeColor = (raw: string | undefined, i: number) =>
  /^#?[0-9a-fA-F]{6}$/.test(raw ?? '') ? '#' + raw!.replace(/^#/, '').toUpperCase() : LINE_COLORS[i % LINE_COLORS.length]

const patternOf = (t: TripInfo) => `${t.count}|${t.first}|${t.last}`

export function readFeed(files: Record<string, Uint8Array>): Feed {
  // a zipped folder has its files under "feed/stops.txt"
  files = Object.fromEntries(Object.entries(files).map(([name, data]) => [name.split('/').pop()!, data]))
  const decoder = new TextDecoder()
  const text = (name: string) => files[name] ? decoder.decode(files[name]) : ''
  const table = (name: string) => csv.parse(text(name))

  const stops = new Map(table('stops.txt').map(s => [s.stop_id, s]))
  if (stops.size === 0) throw new Error('This zip has no stops.txt, so it is not a GTFS feed.')
  const routeRows = table('routes.txt')

  const trips = new Map<string, TripInfo>()
  for (const t of table('trips.txt'))
    trips.set(t.trip_id, { route: t.route_id, service: t.service_id, count: 0, minSeq: Infinity, maxSeq: -Infinity, first: '', last: '' })

  // pass 1 over stop_times: length and end stops of every trip, nothing stored per row
  const stopTimes = files['stop_times.txt'] ?? new Uint8Array()
  let col: Record<string, number> = {}
  csv.forEachRowInBytes(stopTimes, h => { col = Object.fromEntries(h.map((name, i) => [name, i])) }, r => {
    const trip = trips.get(r[col.trip_id])
    if (!trip || !stops.has(r[col.stop_id])) return // broken feeds: skip stops missing from stops.txt
    const seq = Number(r[col.stop_sequence])
    trip.count++
    if (seq < trip.minSeq) { trip.minSeq = seq; trip.first = r[col.stop_id] }
    if (seq > trip.maxSeq) { trip.maxSeq = seq; trip.last = r[col.stop_id] }
  })

  // each route's representative trip: the longest one, and among equally long ones
  // the trip on the route's most-used service (not a one-off holiday/replacement run)
  const serviceUse = new Map<string, number>() // "route|service" -> trips
  for (const t of trips.values()) serviceUse.set(`${t.route}|${t.service}`, (serviceUse.get(`${t.route}|${t.service}`) ?? 0) + 1)
  const use = (t: TripInfo) => serviceUse.get(`${t.route}|${t.service}`)!
  const repTrip = new Map<string, string>()
  for (const [id, t] of trips) {
    const best = repTrip.has(t.route) ? trips.get(repTrip.get(t.route)!)! : null
    if (!best || t.count > best.count || (t.count === best.count && use(t) > use(best))) repTrip.set(t.route, id)
  }
  const tripsByRoute = new Map<string, string[]>()
  for (const [id, t] of trips) {
    if (!tripsByRoute.has(t.route)) tripsByRoute.set(t.route, [])
    tripsByRoute.get(t.route)!.push(id)
  }
  const samePattern = (routeKey: string) => {
    const pattern = patternOf(trips.get(repTrip.get(routeKey)!)!)
    return tripsByRoute.get(routeKey)!.filter(id => patternOf(trips.get(id)!) === pattern)
  }

  const routes: FeedRoute[] = routeRows
    .filter(r => repTrip.has(r.route_id) && trips.get(repTrip.get(r.route_id)!)!.count >= 2)
    .map((r, i) => ({
      key: r.route_id,
      shortName: r.route_short_name ?? '',
      longName: r.route_long_name ?? '',
      color: routeColor(r.route_color, i),
      type: parseInt(r.route_type, 10) || 0,
      stopCount: trips.get(repTrip.get(r.route_id)!)!.count,
      tripCount: samePattern(r.route_id).length,
    }))
    .sort((a, b) => a.type - b.type || (a.shortName || a.longName).localeCompare(b.shortName || b.longName, undefined, { numeric: true }))

  function build(routeKeys: string[], oneTripPerLine: boolean, mergeWithin = 0): Model {
    const picked = routes.filter(r => routeKeys.includes(r.key))
    const tripsOf = new Map(picked.map(r => [r.key, oneTripPerLine ? [repTrip.get(r.key)!] : samePattern(r.key)]))
    const repIds = new Set(picked.map(r => repTrip.get(r.key)!))

    // pass 2: keep the stop_times rows of the representative trips only
    const rows = new Map<string, { seq: number; stop: string; arrival: string; departure: string }[]>()
    csv.forEachRowInBytes(stopTimes, () => {}, r => {
      const tripId = r[col.trip_id]
      if (!repIds.has(tripId) || !stops.has(r[col.stop_id])) return
      if (!rows.has(tripId)) rows.set(tripId, [])
      rows.get(tripId)!.push({ seq: Number(r[col.stop_sequence]), stop: r[col.stop_id], arrival: r[col.arrival_time] ?? '', departure: r[col.departure_time] ?? '' })
    })

    // platforms (stops with a known parent_station) count as their station
    const parentOf = (stopId: string) => {
      const parent = stops.get(stopId)?.parent_station
      return parent && stops.has(parent) ? parent : stopId
    }
    // and, if asked, same-named stops in a chain of steps within mergeWithin meters
    // count as the first of them (a hub's platforms can stretch past the distance),
    // but none farther than SPAN from it: the station is drawn there, and a long chain
    // could reach a different place sharing the name
    const sameAs = new Map<string, string>()
    if (mergeWithin > 0) {
      const byName = new Map<string, string[]>()
      for (const list of rows.values())
        for (const { stop } of list) {
          const id = parentOf(stop), name = stops.get(id)?.stop_name ?? ''
          const same = byName.get(name) ?? []
          if (!same.includes(id)) same.push(id)
          byName.set(name, same)
        }
      const at = (id: string) => ({ lat: parseFloat(stops.get(id)!.stop_lat) || 0, lon: parseFloat(stops.get(id)!.stop_lon) || 0 })
      const meters = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => // close enough at these distances
        Math.hypot((b.lon - a.lon) * Math.cos(a.lat * Math.PI / 180) * 111_320, (b.lat - a.lat) * 110_540)
      for (const ids of byName.values()) {
        const left = ids.sort()
        while (left.length) {
          const first = left.shift()!, group = [first]
          for (const g of group) // grows while it is walked
            for (let i = left.length - 1; i >= 0; i--)
              if (meters(at(g), at(left[i])) <= mergeWithin && meters(at(first), at(left[i])) <= SPAN) group.push(...left.splice(i, 1))
          for (const id of group.slice(1)) sameAs.set(id, first)
        }
      }
    }
    const stationOf = (stopId: string) => {
      const id = parentOf(stopId)
      return sameAs.get(id) ?? id
    }

    const model = emptyModel()
    const stationIds = new Map<string, number>(), usedStations = new Set<number>()
    const usedLines = new Set<number>(), usedTrips = new Set<number>()
    const calendarIds = new Map<string, number>(), usedCalendars = new Set<number>()

    const stationId = (gtfsId: string): number => {
      if (stationIds.has(gtfsId)) return stationIds.get(gtfsId)!
      const id = numericId(gtfsId, usedStations)
      stationIds.set(gtfsId, id)
      const s = stops.get(gtfsId)!
      const station: Station = {
        id, name: s.stop_name ?? '', coordMode: 'gps', x: 0, y: 0,
        lat: parseFloat(s.stop_lat) || 0, lon: parseFloat(s.stop_lon) || 0,
      }
      syncFromGPS(station)
      model.stations.push(station)
      return id
    }
    const calendarId = (service: string) => {
      if (!calendarIds.has(service)) calendarIds.set(service, numericId(service, usedCalendars))
      return calendarIds.get(service)!
    }

    for (const route of picked) {
      const stopRows = (rows.get(repTrip.get(route.key)!) ?? []).sort((a, b) => a.seq - b.seq)
      const line: Line = {
        id: numericId(route.key, usedLines),
        name: route.longName || route.shortName || 'Line',
        shortName: route.shortName,
        color: route.color,
        type: route.type,
        stops: [],
      }
      for (const r of stopRows) {
        const id = stationId(stationOf(r.stop))
        // two platforms of the same station in a row are one stop of the line: it arrives
        // at the first and leaves from the last
        const last = line.stops.at(-1)
        if (last?.stationId === id) { last.departure = r.departure; continue }
        line.stops.push({ stationId: id, arrival: r.arrival, departure: r.departure })
      }
      model.lines.push(line)
      for (const tripId of tripsOf.get(route.key)!) {
        const trip: Trip = { id: numericId(tripId, usedTrips), line: line.id, service: calendarId(trips.get(tripId)!.service) }
        model.trips.push(trip)
      }
    }

    // calendars of the services the kept trips run on
    const calendarRows = new Map(table('calendar.txt').map(c => [c.service_id, c]))
    const dateRows = [...calendarIds.keys()].some(s => !calendarRows.has(s)) ? table('calendar_dates.txt') : []
    const iso = (d: string) => /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d
    for (const [service, id] of calendarIds) {
      const c = calendarRows.get(service)
      if (c) {
        model.calendars.push({ id, start: iso(c.start_date), end: iso(c.end_date), availability: DAYS.map(d => c[d] === '1' ? 1 : 0) })
        continue
      }
      // only calendar_dates: the date range it runs on, and the weekdays those dates fall on
      const dates = dateRows.filter(d => d.service_id === service && d.exception_type === '1').map(d => d.date).sort()
      const availability = [0, 0, 0, 0, 0, 0, 0]
      for (const d of dates) availability[(new Date(`${iso(d)}T12:00:00Z`).getUTCDay() + 6) % 7] = 1
      const calendar: Calendar = dates.length
        ? { id, start: iso(dates[0]), end: iso(dates.at(-1)!), availability }
        : { id, start: '2025-01-01', end: '2025-12-31', availability: [1, 1, 1, 1, 1, 1, 1] }
      model.calendars.push(calendar)
    }
    return model
  }

  return { routes, build }
}
