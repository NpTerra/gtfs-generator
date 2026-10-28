// Which station labels fit on the map: greedy, in priority order, a label is
// shown only if its box overlaps no label already placed and no other
// station's dot (labels above priority 1, e.g. the selected station's, may
// cover dots). A grid of buckets keeps it near-linear for big networks.
export interface Box { x1: number; y1: number; x2: number; y2: number }
export interface LabelCandidate { id: number; box: Box; dot?: Box; priority: number } // no dot: blocks nothing

const CELL = 96 // px

function cells(b: Box, each: (key: string) => void) {
  for (let cx = Math.floor(b.x1 / CELL); cx <= Math.floor(b.x2 / CELL); cx++)
    for (let cy = Math.floor(b.y1 / CELL); cy <= Math.floor(b.y2 / CELL); cy++) each(cx + ':' + cy)
}

const overlaps = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2

// ids of the labels to show; higher priority first, then in the given order
export function placeLabels(candidates: LabelCandidate[]): Set<number> {
  const grid = new Map<string, { id: number; box: Box }[]>()
  const add = (id: number, box: Box) => cells(box, key => {
    const list = grid.get(key)
    if (list) list.push({ id, box }); else grid.set(key, [{ id, box }])
  })
  // dots are stored under their station id, placed labels under negative ids
  const blocked = (id: number, box: Box, overDots: boolean) => {
    let hit = false
    cells(box, (key) => {
      if (!hit) hit = grid.get(key)?.some(o => o.id !== id && !(overDots && o.id >= 0) && overlaps(o.box, box)) ?? false
    })
    return hit
  }

  for (const c of candidates) if (c.dot) add(c.id, c.dot) // every dot is an obstacle, except to its own label
  const shown = new Set<number>()
  const order = candidates.map((c, i) => ({ c, i })).sort((a, b) => b.c.priority - a.c.priority || a.i - b.i)
  for (const { c } of order) {
    if (blocked(c.id, c.box, c.priority > 1)) continue
    shown.add(c.id)
    add(-1 - c.id, c.box) // a placed label blocks everyone, its own station included
  }
  return shown
}
