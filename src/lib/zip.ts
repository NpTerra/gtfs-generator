// Dependency-free ZIP writers (STORE; and DEFLATE with folder entries, as JSZip writes) and reader
// (STORE + DEFLATE via DecompressionStream).

export interface ZipEntry { name: string; data: Uint8Array | string }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++)
      c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++)
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const day = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, day }
}

// Returns a valid ZIP archive with the entries stored uncompressed.
export function create(files: ZipEntry[], date = new Date()): Uint8Array {
  const encoder = new TextEncoder()
  return assemble(files.map((file) => {
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data
    return { name: file.name, data, size: data.length, crc: crc32(data), deflated: false, dir: false }
  }), date, 'plain')
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// As JSZip writes with compression: 'DEFLATE' (the .tmx editor's zips): files deflated, and an
// entry for each folder ("history/", then "history/snapshots/", …) before the first file in it.
// Names are flagged UTF-8 only when they aren't plain ASCII, as JSZip does.
export async function createDeflated(files: ZipEntry[], date = new Date()): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const entries: Parameters<typeof assemble>[0] = []
  const folders = new Set<string>()
  for (const file of files) {
    const parts = file.name.split('/').slice(0, -1)
    for (let i = 1; i <= parts.length; i++) {
      const folder = parts.slice(0, i).join('/') + '/'
      if (folders.has(folder)) continue
      folders.add(folder)
      entries.push({ name: folder, data: new Uint8Array(0), size: 0, crc: 0, deflated: false, dir: true })
    }
    const raw = typeof file.data === 'string' ? encoder.encode(file.data) : file.data
    entries.push({ name: file.name, data: await deflateRaw(raw), size: raw.length, crc: crc32(raw), deflated: true, dir: false })
  }
  return assemble(entries, date, 'jszip')
}

// the local headers and data, then the central directory. JSZip's style: the UTF-8 flag only on
// non-ASCII names, and "version needed to extract" 1.0 on every entry (deflated ones too)
function assemble(
  entries: { name: string; data: Uint8Array; size: number; crc: number; deflated: boolean; dir: boolean }[],
  date: Date, style: 'plain' | 'jszip',
): Uint8Array {
  const encoder = new TextEncoder()
  const { time, day } = dosDateTime(date)
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const flags = style === 'plain' || !/^[\x20-\x7e]*$/.test(entry.name) ? 0x0800 : 0
    const needed = style === 'jszip' ? 10 : 20
    const method = entry.deflated ? 8 : 0
    const { data, crc } = entry

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true) // local file header signature
    local.setUint16(4, needed, true) // version needed
    local.setUint16(6, flags, true) // flags: UTF-8 names
    local.setUint16(8, method, true) // method: store or deflate
    local.setUint16(10, time, true)
    local.setUint16(12, day, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true) // compressed size
    local.setUint32(22, entry.size, true) // uncompressed size
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true) // extra length

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true) // central directory signature
    central.setUint16(4, 20, true) // version made by
    central.setUint16(6, needed, true) // version needed
    central.setUint16(8, flags, true) // flags: UTF-8 names
    central.setUint16(10, method, true) // method: store or deflate
    central.setUint16(12, time, true)
    central.setUint16(14, day, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, data.length, true)
    central.setUint32(24, entry.size, true)
    central.setUint16(28, nameBytes.length, true)
    central.setUint32(38, entry.dir ? 0x10 : 0, true) // external attributes: MS-DOS directory
    central.setUint32(42, offset, true) // local header offset

    localParts.push(new Uint8Array(local.buffer), nameBytes, data)
    centralParts.push(new Uint8Array(central.buffer), nameBytes)
    offset += 30 + nameBytes.length + data.length
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true) // end of central directory signature
  eocd.setUint16(8, entries.length, true)
  eocd.setUint16(10, entries.length, true)
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, offset, true) // central directory offset

  const parts = [...localParts, ...centralParts, new Uint8Array(eocd.buffer)]
  const total = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let pos = 0
  for (const part of parts) { total.set(part, pos); pos += part.length }
  return total
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// Reads a ZIP archive into { name: bytes }; `only` can skip entries that aren't needed.
export async function read(bytes: Uint8Array, only?: (name: string) => boolean): Promise<Record<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()

  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP file (missing end-of-central-directory).')

  const count = view.getUint16(eocd + 10, true)
  let pos = view.getUint32(eocd + 16, true)
  const files: Record<string, Uint8Array> = {}
  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50)
      throw new Error('Corrupted ZIP central directory.')
    const method = view.getUint16(pos + 10, true)
    const compSize = view.getUint32(pos + 20, true)
    const nameLen = view.getUint16(pos + 28, true)
    const extraLen = view.getUint16(pos + 30, true)
    const commentLen = view.getUint16(pos + 32, true)
    const localOffset = view.getUint32(pos + 42, true)
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen))

    // skip the local header to find the actual data
    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const data = bytes.subarray(dataStart, dataStart + compSize)

    if (!name.endsWith('/') && (!only || only(name))) {
      if (method === 0) files[name] = data.slice()
      else if (method === 8) files[name] = await inflateRaw(data)
      else throw new Error(`Unsupported compression method ${method} for "${name}".`)
    }
    pos += 46 + nameLen + extraLen + commentLen
  }
  return files
}
