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
