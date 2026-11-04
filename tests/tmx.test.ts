// The .tmx export (src/lib/tmx.ts), opened the way the course's Transport Map Editor
// opens it: the envelope decrypted with Node's own AES-GCM, the zip read back, and the
// extension's validation rules checked on the CSVs.
import { createDecipheriv, createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import * as M from '../src/lib/model'
import { buildTmxTestFiles, toTmx } from '../src/lib/tmx'
import * as zip from '../src/lib/zip'

async function open(file: Uint8Array) {
  const b = Buffer.from(file)
  expect(b.subarray(0, 4).toString('ascii')).toBe('TMX1')
  expect(b.readUInt8(4)).toBe(1)
  const ivLen = b.readUInt32BE(5), tagLen = b.readUInt32BE(9), bodyLen = b.readUInt32BE(13)
  expect(b.length).toBe(17 + ivLen + tagLen + bodyLen)
  const iv = b.subarray(17, 17 + ivLen), tag = b.subarray(17 + ivLen, 17 + ivLen + tagLen), body = b.subarray(17 + ivLen + tagLen)
  const key = createHash('sha256').update('tmx-global-static-key-v1', 'utf8').digest()
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const raw = Buffer.concat([decipher.update(body), decipher.final()])
  const files = await zip.read(new Uint8Array(raw))
  const text = (name: string) => new TextDecoder().decode(files[name])
  const rows = (name: string) => text(name).split('\n').map(l => l.split(','))
  // every entry of the central directory, folders included (zip.read skips those): name and method
  const entries: { name: string; method: number }[] = []
  const eocd = raw.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  for (let i = 0, at = raw.readUInt32LE(eocd + 16); i < raw.readUInt16LE(eocd + 10); i++) {
    const nameLen = raw.readUInt16LE(at + 28)
    entries.push({ name: raw.toString('utf8', at + 46, at + 46 + nameLen), method: raw.readUInt16LE(at + 10) })
    at += 46 + nameLen + raw.readUInt16LE(at + 30) + raw.readUInt16LE(at + 32)
  }
  return { names: Object.keys(files), text, rows, entries }
}

describe('.tmx export', () => {
  it('writes what the Transport Map Editor reads: stops, lines, ordered connections, an honest history', async () => {
    const model = M.defaultTestCase().arrange // stations A, B, C; line L1 stopping at all three
    model.stations[1].name = 'B, the "middle"' // quoted in the CSV
    model.lines[0].name = 'Ahead to C' // the long name: the short one, L1, is what a .tmx line is called
    const file = await open(await toTmx(model, new Date('2026-11-05T10:00:00Z')))

    const manifest = JSON.parse(file.text('manifest.json'))
    // exactly the extension's fields, in its order: nothing of ours
    expect(Object.keys(manifest)).toEqual(['formatVersion', 'archiveUuid', 'previousArchiveUuids', 'createdAt', 'savedAt', 'snapshotEveryEvents'])
    expect(manifest).toMatchObject({ formatVersion: '0.1.0', snapshotEveryEvents: 250 })
    // as "New TMX File" and one save leave it: the empty archive first, then the saved one
    expect(manifest.previousArchiveUuids).toHaveLength(1)
    const [firstArchive] = manifest.previousArchiveUuids
    expect(manifest.createdAt).toBe('2026-11-05T10:00:00.000Z')

    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const stops = file.text('current/stops.csv').split('\n')
    expect(stops[0]).toBe('uuid,name,latitude,longitude')
    expect(stops).toHaveLength(4)
    expect(stops[2]).toContain(',"B, the ""middle""",')
    const [, , lat, lon] = file.rows('current/stops.csv')[1]
    expect([Number(lat), Number(lon)]).toEqual([model.stations[0].lat, model.stations[0].lon])
    const stopIds = file.rows('current/stops.csv').slice(1).map(r => r[0])
    expect(stopIds.every(id => uuid.test(id))).toBe(true)

    expect(file.rows('current/lines.csv')).toEqual([['uuid', 'name', 'color'], [expect.stringMatching(uuid), 'L1', '#AABBCC']])
    const connections = file.rows('current/connections.csv')
    expect(connections[0]).toEqual(['uuid', 'line_uuid', 'stop_uuid', 'sequence'])
    expect(connections.slice(1).map(r => [r[2], r[3]])).toEqual([[stopIds[0], '1'], [stopIds[1], '2'], [stopIds[2], '3']])

    // every entity created once, all at the moment of export, in this one archive
    const events = file.text('history/events.jsonl').trim().split('\n').map(l => JSON.parse(l))
    expect(events).toHaveLength(3 + 1 + 3)
    expect(new Set(events.map(e => e.timestamp))).toEqual(new Set(['2026-11-05T10:00:00.000Z']))
    expect(events.every(e => e.action === 'create' && e.archiveUuid === firstArchive)).toBe(true)
    expect(events.map(e => e.entityType)).toEqual(['stop', 'stop', 'stop', 'line', 'connection', 'connection', 'connection'])

    const index = JSON.parse(file.text('history/snapshot-index.json'))
    expect(index.snapshots).toEqual([
      expect.objectContaining({ eventCount: 0, eventRange: { start: 0, end: -1 } }), // the empty map's save
      expect.objectContaining({ eventCount: 7, eventRange: { start: 0, end: 6 } }),
    ])
    expect(file.text(`history/snapshots/${index.snapshots[0].snapshotUuid}/stops.csv`)).toBe('uuid,name,latitude,longitude')
    expect(file.text(`history/snapshots/${index.snapshots[1].snapshotUuid}/stops.csv`)).toBe(file.text('current/stops.csv'))
    // the zip as the extension's JSZip writes it: a folder entry before each folder's files, files deflated
    expect(file.entries.filter(e => e.name.endsWith('/')).map(e => e.name.replace(/[0-9a-f-]{36}/, '<id>')))
      .toEqual(['current/', 'history/', 'history/snapshots/', 'history/snapshots/<id>/', 'history/snapshots/<id>/'])
    expect(file.entries.filter(e => !e.name.endsWith('/')).every(e => e.method === 8)).toBe(true)
    expect(file.entries).toHaveLength(19)
  })

  it('generates the submission files with .tmx maps in place of the GTFS zips', async () => {
    const tc = M.defaultTestCase()
    expect((await buildTmxTestFiles(tc)).map(f => f.name)).toEqual(['comment.txt', 'act.txt', 'arrange.tmx', 'assert.tmx'])
    tc.expected = { ...tc.expected, type: 'exception', exception: 'IllegalArgumentException' }
    const files = await buildTmxTestFiles(tc)
    expect(files.map(f => f.name)).toEqual(['comment.txt', 'act.txt', 'arrange.tmx', 'assert.txt'])
    expect((await open(files[2].data as Uint8Array)).text('current/lines.csv')).toContain('L1,#AABBCC')
    Object.assign(tc.arrange.lines[0], { shortName: '', name: 'Ahead to C' }) // no short name: the long one
    expect((await open((await buildTmxTestFiles(tc))[2].data as Uint8Array)).text('current/lines.csv')).toContain(',Ahead to C,#AABBCC')
  })

  it('plain: what a .tmx holds, unencrypted, in arrange-tmx/ and assert-tmx/ folders', async () => {
    const tc = M.defaultTestCase()
    const names = (await buildTmxTestFiles(tc, true)).map(f => f.name)
    expect(names.slice(0, 2)).toEqual(['comment.txt', 'act.txt'])
    // the same files the envelope seals
    const sealed = (await open(await toTmx(tc.arrange))).names
    const anySnapshot = (n: string) => n.replace(/snapshots\/[^/]+/, 'snapshots/*')
    for (const folder of ['arrange-tmx/', 'assert-tmx/'])
      expect(names.filter(n => n.startsWith(folder)).map(n => anySnapshot(n.slice(folder.length)))).toEqual(sealed.map(anySnapshot))
  })

})
