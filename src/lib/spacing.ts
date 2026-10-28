// Each station's distance to its second nearest other one, in meters (the map's
// dot size comes from it). It doesn't depend on the zoom, so it's found once per
// model, not per zoom step: the zoom only scales it to pixels.
//
// A grid of buckets about as wide as the average spacing; the search walks rings
// of buckets outwards until the ring is farther than the second nearest found.
export function secondNearest(points: readonly { id: number; x: number; y: number }[]): Map<number, number> {
  const out = new Map<number, number>()
  if (points.length < 3) { for (const p of points) out.set(p.id, Infinity); return out }
  // the extent of the middle 90% (a stray stop at 0,0 would make buckets a city wide, and
  // the search quadratic); along a line of stations the area is ~0, so the length counts too
  const spread = (v: number[]) => { v.sort((a, b) => a - b); return v[Math.floor(v.length * 0.95)] - v[Math.floor(v.length * 0.05)] }
  const w = spread(points.map(p => p.x)), h = spread(points.map(p => p.y))
  const cell = Math.max(1e-6, Math.sqrt(w * h / points.length), Math.max(w, h) / points.length)
  const grid = new Map<string, typeof points[number][]>()
  const at = (i: number, j: number) => grid.get(i + ':' + j)
  for (const p of points) {
    const k = Math.floor(p.x / cell) + ':' + Math.floor(p.y / cell)
    const bucket = grid.get(k)
    if (bucket) bucket.push(p); else grid.set(k, [p])
  }
  const RINGS = 64
  for (const p of points) {
    const ci = Math.floor(p.x / cell), cj = Math.floor(p.y / cell)
    let first = Infinity, second = Infinity
    const visit = (i: number, j: number) => {
      for (const q of at(i, j) ?? []) {
        if (q === p) continue
        const d = Math.hypot(q.x - p.x, q.y - p.y)
        if (d < first) [first, second] = [d, first]
        else if (d < second) second = d
      }
    }
    // after ring r, every point within r cells' distance has been seen
    for (let r = 0; r <= RINGS && second > (r - 1) * cell; r++) {
      if (r === 0) { visit(ci, cj); continue }
      for (let d = -r; d <= r; d++) { visit(ci + d, cj - r); visit(ci + d, cj + r) }
      for (let d = -r + 1; d <= r - 1; d++) { visit(ci - r, cj + d); visit(ci + r, cj + d) }
    }
    // an outlier (a stop far from the rest): beyond the rings, so check them all
    if (second >= RINGS * cell) {
      first = second = Infinity
      for (const q of points) if (q !== p) {
        const d = Math.hypot(q.x - p.x, q.y - p.y)
        if (d < first) [first, second] = [d, first]
        else if (d < second) second = d
      }
    }
    out.set(p.id, second)
  }
  return out
}
