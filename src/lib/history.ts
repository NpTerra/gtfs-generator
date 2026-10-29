// Undo steps that share what didn't change, the way git shares unchanged files
// between commits: a step holds the test case as one JSON string per station,
// line, calendar and trip (and one for everything else), and a piece equal to
// one in the step before is that very string. So a step costs only what changed
// plus a list of references: a whole city's 13 000 pieces are ~100 kB per step,
// not the 1 MB a full copy would be.
import type { Model, TestCase } from './model'

export interface Snapshot { pieces: string[]; counts: number[] }

const LISTS = ['stations', 'lines', 'calendars', 'trips'] as const
const EMPTY: Model = { stations: [], lines: [], calendars: [], trips: [] }

export function snapshot(tc: TestCase, prev?: Snapshot): Snapshot {
  const known = new Map(prev?.pieces.map(p => [p, p]))
  const pieces = [JSON.stringify({ ...tc, arrange: EMPTY, expected: { ...tc.expected, model: EMPTY } })]
  const counts: number[] = []
  for (const model of [tc.arrange, tc.expected.model])
    for (const list of LISTS) {
      counts.push(model[list].length)
      for (const item of model[list]) {
        const json = JSON.stringify(item)
        pieces.push(known.get(json) ?? json)
      }
    }
  pieces[0] = known.get(pieces[0]) ?? pieces[0]
  return { pieces, counts }
}

export function restore(s: Snapshot): TestCase {
  const tc = JSON.parse(s.pieces[0]) as TestCase
  let at = 1, c = 0
  for (const model of [tc.arrange, tc.expected.model])
    for (const list of LISTS) {
      const n = s.counts[c++]
      ;(model[list] as unknown[]) = s.pieces.slice(at, at + n).map(p => JSON.parse(p))
      at += n
    }
  return tc
}

// equal pieces are the same strings, so this is a reference check per piece
export const sameSnapshot = (a: Snapshot, b: Snapshot) =>
  a.pieces.length === b.pieces.length && a.counts.every((n, i) => n === b.counts[i]) && a.pieces.every((p, i) => p === b.pieces[i])
