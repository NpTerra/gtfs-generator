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
