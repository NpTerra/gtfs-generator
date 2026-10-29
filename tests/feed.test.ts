// Importing picked routes from a real-world style GTFS feed (src/lib/feed.ts).
import { describe, expect, it } from 'vitest'
import { readFeed } from '../src/lib/feed'
import { validate, defaultTestCase } from '../src/lib/model'

const enc = new TextEncoder()
const feedFiles = (tables: Record<string, string>) =>
  Object.fromEntries(Object.entries(tables).map(([name, text]) => [name, enc.encode(text.trim() + '\n')]))

// STA1 is a station with two platforms; R10 has two full trips and a short one;
// R20 runs only on Sundays, defined through calendar_dates.txt alone
const files = feedFiles({
  'stops.txt': `stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station
STA1,Central,47.5,19.05,1,
P1a,Central,47.5001,19.0501,0,STA1
P1b,Central,47.5002,19.0502,0,STA1
X,Bridge,47.51,19.06,0,
Y,Mill,47.52,19.07,0,`,
  'routes.txt': `route_id,route_short_name,route_long_name,route_type,route_color
R10,10,Ten,3,
R20,20,Twenty,0,FFD800
R30,30,Thirty,3,0055AA`,
  'trips.txt': `route_id,service_id,trip_id
R10,WK,T1
R10,WK,T2
R10,WK,T3
R20,SUN,T4
R30,WK,T5`,
  'stop_times.txt': `trip_id,arrival_time,departure_time,stop_id,stop_sequence
T1,08:00:00,08:00:00,P1a,1
T1,08:05:00,08:06:00,X,2
T1,08:10:00,08:10:00,Y,3
T2,09:00:00,09:00:00,P1a,1
T2,09:05:00,09:06:00,X,2
T2,09:10:00,09:10:00,Y,3
T3,10:00:00,10:00:00,X,1
T3,10:05:00,10:05:00,Y,2
T4,25:10:00,25:10:00,Y,1
T4,25:20:00,25:20:00,P1b,2
T5,07:00:00,07:00:00,P1a,1
T5,07:01:00,07:01:00,P1b,2
T5,07:09:00,07:09:00,X,3`,
  'calendar.txt': `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
WK,1,1,1,1,1,0,0,20250101,20251231`,
  'calendar_dates.txt': `service_id,date,exception_type
SUN,20250105,1
SUN,20250112,1
SUN,20250119,2`,
})

describe('readFeed', () => {
  const feed = readFeed(files)

  it('lists routes with their longest trip and its pattern count', () => {
    expect(feed.routes.map(r => [r.key, r.stopCount, r.tripCount])).toEqual([['R20', 2, 1], ['R10', 3, 2], ['R30', 3, 1]])
    expect(feed.routes.find(r => r.key === 'R20')!.color).toBe('#FFD800')
    expect(feed.routes.find(r => r.key === 'R10')!.color).toMatch(/^#[0-9A-F]{6}$/) // no route_color: default palette
  })

  it('builds one line per route from its longest trip, platforms merged into stations', () => {
    const m = feed.build(['R10'], true)
    expect(m.lines).toHaveLength(1)
    expect(m.lines[0]).toMatchObject({ id: 10, shortName: '10', name: 'Ten' })
    expect(m.lines[0].stops.map(s => m.stations.find(st => st.id === s.stationId)!.name)).toEqual(['Central', 'Bridge', 'Mill'])
    expect(m.lines[0].stops[1]).toMatchObject({ arrival: '08:05:00', departure: '08:06:00' })
    const central = m.stations.find(s => s.name === 'Central')!
    expect(central).toMatchObject({ id: 1, coordMode: 'gps', lat: 47.5, lon: 19.05 }) // the station, not a platform
    expect(m.trips).toHaveLength(1)
    expect(m.calendars).toEqual([{ id: 1, start: '2025-01-01', end: '2025-12-31', availability: [1, 1, 1, 1, 1, 0, 0] }])
  })

  it('keeps every same-pattern trip when asked', () => {
    expect(feed.build(['R10'], false).trips.map(t => t.line)).toEqual([10, 10])
  })

  it('shares stations between lines, dedupes consecutive platforms, derives calendar_dates services', () => {
    const m = feed.build(['R10', 'R20', 'R30'], true)
    expect(m.stations).toHaveLength(3)
    expect(m.lines.find(l => l.id === 30)!.stops).toHaveLength(2) // P1a, P1b -> one Central stop
    expect(m.lines.find(l => l.id === 20)!.stops[0].arrival).toBe('25:10:00')
    const sunday = m.calendars.find(c => c.id === m.trips.find(t => t.line === 20)!.service)!
    expect(sunday).toMatchObject({ start: '2025-01-05', end: '2025-01-12', availability: [0, 0, 0, 0, 0, 0, 1] })
  })

  it('produces a model that validates without errors', () => {
    const tc = defaultTestCase()
    tc.arrange = feed.build(['R10', 'R20', 'R30'], true)
    tc.expected.model = structuredClone(tc.arrange)
    expect(validate(tc).filter(p => p.level === 'error')).toEqual([])
  })

  it('reads calendar_dates.txt when only some used services are in calendar.txt', () => {
    const withWeekend = { ...files, ...feedFiles({ 'calendar.txt': `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
WK,1,1,1,1,1,0,0,20250101,20251231
WE,0,0,0,0,0,1,1,20250101,20251231` }) }
    const m = readFeed(withWeekend).build(['R20'], true) // 2 calendars, 1 used service, which is calendar_dates-only
    expect(m.calendars[0]).toMatchObject({ start: '2025-01-05', availability: [0, 0, 0, 0, 0, 0, 1] })
  })

  it('reads a feed zipped inside a folder', () => {
    const nested = Object.fromEntries(Object.entries(files).map(([name, data]) => ['feed/' + name, data]))
    expect(readFeed(nested).routes).toHaveLength(3)
  })

  it('skips stop_times rows whose stop is missing from stops.txt', () => {
    const broken = { ...files, 'stop_times.txt': enc.encode(new TextDecoder().decode(files['stop_times.txt']) + 'T1,08:20:00,08:20:00,GONE,4\n') }
    const m = readFeed(broken).build(['R10'], true)
    expect(m.lines[0].stops).toHaveLength(3)
  })

  it('rejects a zip without stops.txt', () => {
    expect(() => readFeed(feedFiles({ 'routes.txt': 'route_id\nR1' }))).toThrow(/stops\.txt/)
  })
})

describe('createRowReader', () => {
  it('reads rows across chunk boundaries, with quoted commas, quotes and line breaks', async () => {
    const { createRowReader } = await import('../src/lib/csv')
    const rows: string[][] = []
    let header: string[] = []
    const reader = createRowReader(h => { header = h }, r => rows.push(r))
    const text = '﻿id,name\r\n1,plain\r\n2,"comma, inside"\r\n3,"multi\r\nline ""quoted"""\r\n4,last'
    for (let i = 0; i < text.length; i += 3) reader.push(text.slice(i, i + 3)) // tiny chunks
    reader.end()
    expect(header).toEqual(['id', 'name'])
    expect(rows).toEqual([['1', 'plain'], ['2', 'comma, inside'], ['3', 'multi\nline "quoted"'], ['4', 'last']])
  })
})

describe('merging same-named stops (optional)', () => {
  // two "Bridge" stops ~50 m apart and a third ~2 km away, none with a parent station
  const hub = readFeed(feedFiles({
    'stops.txt': `stop_id,stop_name,stop_lat,stop_lon
Ba,Bridge,47.5,19.05
Bb,Bridge,47.5004,19.05
Bfar,Bridge,47.518,19.05
M,Mill,47.51,19.07`,
    'routes.txt': `route_id,route_short_name,route_long_name,route_type
R1,1,One,3`,
    'trips.txt': `route_id,service_id,trip_id
R1,WK,T1`,
    'stop_times.txt': `trip_id,arrival_time,departure_time,stop_id,stop_sequence
T1,08:00:00,08:00:00,Ba,1
T1,08:05:00,08:05:00,M,2
T1,08:10:00,08:10:00,Bb,3
T1,08:20:00,08:20:00,Bfar,4`,
    'calendar.txt': `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
WK,1,1,1,1,1,0,0,20250101,20251231`,
  }))
  const names = (m: ReturnType<typeof hub.build>) => m.lines[0].stops.map(s => m.stations.find(st => st.id === s.stationId)!.name + '#' + s.stationId)

  it('keeps every stop by default', () => {
    expect(hub.build(['R1'], true).stations).toHaveLength(4)
  })

  it('merges same-named stops within the distance into the first one', () => {
    const m = hub.build(['R1'], true, 150)
    expect(m.stations.map(s => s.name).sort()).toEqual(['Bridge', 'Bridge', 'Mill']) // the far one stays apart
    const [first, , third, fourth] = names(m)
    expect(third).toBe(first) // Bb became Ba
    expect(fourth).not.toBe(first)
  })

  it('follows a chain of close stops past the distance', () => {
    // three "Row" stops 100 m apart: the last is 200 m from the first, but 100 m from the middle one
    const row = readFeed(feedFiles({
      'stops.txt': `stop_id,stop_name,stop_lat,stop_lon
Ra,Row,47.5,19.05
Rb,Row,47.5009,19.05
Rc,Row,47.5018,19.05`,
      'routes.txt': `route_id,route_short_name,route_long_name,route_type
R1,1,One,3`,
      'trips.txt': `route_id,service_id,trip_id
R1,WK,T1`,
      'stop_times.txt': `trip_id,arrival_time,departure_time,stop_id,stop_sequence
T1,08:00:00,08:00:00,Rc,1
T1,08:05:00,08:05:00,Ra,2
T1,08:10:00,08:10:00,Rb,3`,
    }))
    const merged = row.build(['R1'], true, 150)
    expect(merged.stations).toHaveLength(1)
    // the three stops in a row become one: arriving at the first, leaving from the last
    expect(merged.lines[0].stops).toEqual([{ stationId: merged.stations[0].id, arrival: '08:00:00', departure: '08:10:00' }])
    expect(row.build(['R1'], true, 50).stations).toHaveLength(3)
  })

  it('a chain never reaches past 1000 m from its first stop', () => {
    // five "Long" stops ~896 m apart: each within 1000 m of the next, the ends 3.6 km apart
    const ids = ['La', 'Lb', 'Lc', 'Ld', 'Le']
    const chain = readFeed(feedFiles({
      'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\n' + ids.map((id, i) => `${id},Long,${47.5 + i * 0.0081},19.05`).join('\n'),
      'routes.txt': `route_id,route_short_name,route_long_name,route_type
R1,1,One,3`,
      'trips.txt': `route_id,service_id,trip_id
R1,WK,T1`,
      'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' + ids.map((id, i) => `T1,08:0${i}:00,08:0${i}:00,${id},${i + 1}`).join('\n'),
    }))
    expect(chain.build(['R1'], true, 1000).stations).toHaveLength(3) // La+Lb, Lc+Ld, Le
  })
})
