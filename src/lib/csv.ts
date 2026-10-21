// Minimal CSV writer/parser for the GTFS txt files.

export interface Column { key: string; header: string }
export type Row = Record<string, unknown>

function encodeField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  const needsQuoting = /[",\n\r]/.test(s) || /^\s|\s$/.test(s)
  return needsQuoting ? '"' + s.replaceAll('"', '""') + '"' : s
}

export function write(columns: Column[], rows: Row[]): string {
  const lines = [columns.map(c => encodeField(c.header)).join(',')]
  for (const row of rows)
    lines.push(columns.map(c => encodeField(row[c.key])).join(','))
  return lines.join('\n') + '\n'
}

// Parses CSV text into objects keyed by the header row.
export function parse(text: string): Record<string, string>[] {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false

  const pushField = () => { record.push(field); field = '' }
  const pushRecord = () => {
    pushField()
    if (record.length > 1 || record[0] !== '') records.push(record)
    record = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      pushField()
    } else if (ch === '\n') {
      pushRecord()
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field !== '' || record.length > 0) pushRecord()

  if (records.length === 0) return []
  const header = records[0].map(h => h.trim())
  return records.slice(1).map(rec => {
    const obj: Record<string, string> = {}
    header.forEach((h, i) => { obj[h] = rec[i] ?? '' })
    return obj
  })
}

// Streaming row reader for (possibly huge) CSV files: real feeds' stop_times.txt
// can be 500+ MB, past what one JS string can hold. Text is pushed in chunks and
// read line by line; lines without quotes take a fast split(',') path, and a
// quoted field may even span lines. onHeader gets the header row first, then
// onRow every data row as an array of fields.
export function createRowReader(onHeader: (header: string[]) => void, onRow: (row: string[]) => void) {
  let rest = '' // an incomplete last line, waiting for the next chunk
  let pending = '' // lines of a record whose quoted field spans lines
  let headerSeen = false

  const splitQuoted = (line: string) => {
    const fields: string[] = []
    let field = '', inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { field += '"'; i++ }
          else inQuotes = false
        } else field += ch
      } else if (ch === '"') inQuotes = true
      else if (ch === ',') { fields.push(field); field = '' }
      else field += ch
    }
    fields.push(field)
    return fields
  }
  const quotes = (line: string) => { let n = 0; for (let i = line.indexOf('"'); i >= 0; i = line.indexOf('"', i + 1)) n++; return n }

  const emit = (line: string) => {
    if (line.endsWith('\r')) line = line.slice(0, -1)
    if (line === '') return
    const fields = line.includes('"') ? splitQuoted(line.replace(/\r\n/g, '\n')) : line.split(',')
    if (headerSeen) onRow(fields)
    else { headerSeen = true; onHeader(fields.map(h => h.trim().replace(/^\uFEFF/, ''))) }
  }
  const line = (text: string) => {
    const record = pending ? pending + '\n' + text : text
    if (record.includes('"') && quotes(record) % 2 === 1) { pending = record; return }
    pending = ''
    emit(record)
  }

  return {
    push(chunk: string) {
      const text = rest + chunk
      let start = 0
      for (let nl = text.indexOf('\n'); nl >= 0; nl = text.indexOf('\n', start)) {
        line(text.slice(start, nl))
        start = nl + 1
      }
      rest = text.slice(start)
    },
    end() {
      if (rest || pending) line(rest)
      if (pending) emit(pending) // unbalanced quotes at the end: keep what is there
      rest = pending = ''
    },
  }
}

export function forEachRow(text: string, onHeader: (header: string[]) => void, onRow: (row: string[]) => void) {
  const reader = createRowReader(onHeader, onRow)
  reader.push(text)
  reader.end()
}

// the same straight from UTF-8 bytes, decoded in slices (never one giant string)
export function forEachRowInBytes(bytes: Uint8Array, onHeader: (header: string[]) => void, onRow: (row: string[]) => void) {
  const reader = createRowReader(onHeader, onRow)
  const decoder = new TextDecoder()
  const SLICE = 8 << 20
  for (let i = 0; i < bytes.length; i += SLICE)
    reader.push(decoder.decode(bytes.subarray(i, i + SLICE), { stream: i + SLICE < bytes.length }))
  reader.end()
}
