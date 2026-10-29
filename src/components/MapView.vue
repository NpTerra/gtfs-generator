<script setup lang="ts">
// Canvas map: grid, faded Arrange model (on the Expected tab), act overlay,
// lines and draggable stations. What to draw is worked out from the store and
// the zoom (panning doesn't redo it); draw() paints it all whenever any of it
// changes. Stations under the pointer are found by distance, not by DOM hit.
// Given a `model` (and its own `viewport`), it only shows that model:
// pan and zoom, no editing (the compare view).
import { useDevicePixelRatio, useEventListener, useResizeObserver, useThrottleFn } from '@vueuse/core'
import { computed, nextTick, onMounted, ref, useTemplateRef, watch, watchEffect } from 'vue'
import {
  addStation, canEdit, clickStation, editableModel, loadCount, selection, tab, tc,
} from '@/composables/useEditor'
import { measure, measureClick, measured } from '@/composables/useMeasure'
import { themeShown } from '@/composables/useTheme'
import { clampScale, cursorText, labelMode, mainViewport, showArrangeGhost, type Viewport } from '@/composables/useViewport'
import { type Box, placeLabels } from '@/lib/labels'
import { computeAct } from '@/lib/acts'
import { xyToGPS } from '@/lib/geo'
import type { Model, Station } from '@/lib/model'
import { round6, setStationXY } from '@/lib/model'
import { secondNearest } from '@/lib/spacing'

const props = withDefaults(defineProps<{ viewport?: Viewport; model?: Model | null }>(), { viewport: () => mainViewport })
const readonly = props.model !== undefined
const { view, size, worldToScreen, screenToWorld, gridStep, fit, ensureVisible } = props.viewport

const box = ref<HTMLDivElement>()
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
// the layout size: useElementSize measures with getBoundingClientRect, which a
// dialog's zoom-in animation shrinks
useResizeObserver(box, ([entry]) => {
  size.w = entry.contentRect.width
  size.h = entry.contentRect.height
})

const model = computed<Model | null>(() => readonly ? props.model ?? null : canEdit.value ? editableModel.value : null)
// tinted as Expected: the editor map on the Expected tab, a compare map showing that model
const showsExpected = computed(() => readonly ? props.model === tc.value.expected.model : tab.value === 'expected')
const ghost = computed(() => !readonly && showArrangeGhost.value && tab.value === 'expected' && model.value ? tc.value.arrange : null)
// A station being dragged is drawn where the pointer has it, but the model only
// changes when it's let go: the drag is one edit for validation, autosave and undo.
const dragged = ref<{ id: number; x: number; y: number } | null>(null)
const shown = computed<Model | null>(() => {
  const m = model.value, d = dragged.value
  return m && d ? { ...m, stations: m.stations.map(s => s.id === d.id ? { ...s, x: d.x, y: d.y } : s) } : m
})
const act = computed(() => shown.value ? computeAct(shown.value, tc.value.act) : null)

// ---- what to draw ------------------------------------------------------------------

// Everything but the grid is laid out in layer coordinates (world x layoutScale,
// y down), which only change with the zoom; drawing shifts the layer by `pan`.
// They're measured from `origin`, a world point near the view taken at layout time:
// the canvas keeps coordinates in 32-bit floats, and an imported city's meters from
// GPS 0,0 (Budapest: y ≈ 5 250 000) times the zoom lost pixels from ~2 px/m and
// drew nothing at all past ~6 px/m.
const layoutScale = ref(view.scale)
const origin = ref({ x: view.cx, y: view.cy })
const layOut = () => { layoutScale.value = view.scale; origin.value = { x: view.cx, y: view.cy } }
const toLayer = (x: number, y: number) => ({ x: (x - origin.value.x) * layoutScale.value, y: -(y - origin.value.y) * layoutScale.value })
const pan = computed(() => ({
  x: size.w / 2 - (view.cx - origin.value.x) * view.scale,
  y: size.h / 2 + (view.cy - origin.value.y) * view.scale,
}))
// panned a long way without zooming: lay out around the new place, before precision suffers
watch(() => Math.max(Math.abs(view.cx - origin.value.x), Math.abs(view.cy - origin.value.y)) * layoutScale.value > 1e6,
  (far) => { if (far) layOut() })
const zoom = computed(() => view.scale / layoutScale.value) // 1 except mid-zoom on a big map

// Zooming a big map (wheel, pinch, or the other map of a synced compare view) lays it
// out again at most every 200 ms; in between, the last layout is scaled like a picture
// (names and dots grow or shrink for a moment). A single change (Fit view) is laid out
// right away: the throttle runs its first call at once.
const BIG = 300 // ponytail: station count above which a relayout per wheel tick drops frames
// leading too: without it, wheel ticks over 200 ms apart (a mouse wheel's slow clicks) never relaid it
const relayout = useThrottleFn(layOut, 200, true, true)
watch(() => view.scale, () => {
  if ((model.value?.stations.length ?? 0) + (ghost.value?.stations.length ?? 0) > BIG) relayout()
  else layOut()
}, { flush: 'sync' })

// ---- what's in view: only things with no part near the screen are skipped -------------
// The drawn area is the screen plus a margin of half a screen or more, in steps of
// that margin, so it only changes every so often while panning (not every frame),
// and nothing pops into existence at the edges.
const cull = computed<Box>((prev) => {
  const m = Math.max(200, Math.ceil(Math.max(size.w, size.h) / 2))
  const { x, y } = pan.value, z = zoom.value // the screen in layer coordinates: (0 - x) / z ...
  const x1 = (Math.floor(-x / z / m) - 1) * m, y1 = (Math.floor(-y / z / m) - 1) * m
  const x2 = (Math.ceil((size.w - x) / z / m) + 1) * m, y2 = (Math.ceil((size.h - y) / z / m) + 1) * m
  return prev && prev.x1 === x1 && prev.y1 === y1 && prev.x2 === x2 && prev.y2 === y2 ? prev : { x1, y1, x2, y2 }
})
const inView = (b: Box) => b.x2 > cull.value.x1 && b.x1 < cull.value.x2 && b.y2 > cull.value.y1 && b.y1 < cull.value.y2
const around = (p: { x: number; y: number }, r: number): Box => ({ x1: p.x - r, y1: p.y - r, x2: p.x + r, y2: p.y + r })
// a stretch's bounding box, widened by its side shift and line width (glow included)
const stretchInView = (a: { x: number; y: number }, b: { x: number; y: number }, pad: number) =>
  inView({ x1: Math.min(a.x, b.x) - pad, y1: Math.min(a.y, b.y) - pad, x2: Math.max(a.x, b.x) + pad, y2: Math.max(a.y, b.y) + pad })

// Lines sharing a stretch between two stations are drawn side by side, each
// shifted by its rank among the lines on that stretch only (a line alone on a
// stretch stays on it). The shift's side comes from the station pair in id
// order, so it doesn't flip with a line's direction of travel.
const pairKey = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`
// the drawable lines with their stations, and which lines share each stretch;
// only changes with the model, not on every pan frame
const network = computed(() => {
  if (!shown.value) return null
  const byId = new Map(shown.value.stations.map(s => [s.id, s]))
  const drawable = shown.value.lines.map(line => ({
    line, stops: line.stops.map(st => byId.get(st.stationId)).filter(s => s !== undefined),
  })).filter(d => d.stops.length >= 2)
  const sharing = new Map<string, number[]>() // stretch -> ids of the lines on it, in line order
  for (const { line, stops } of drawable) {
    for (let i = 0; i < stops.length - 1; i++) {
      const on = sharing.get(pairKey(stops[i].id, stops[i + 1].id)) ?? []
      if (!on.includes(line.id)) on.push(line.id)
      sharing.set(pairKey(stops[i].id, stops[i + 1].id), on)
    }
  }

  return { drawable, sharing }
})

const lines = computed(() => {
  if (!network.value) return []
  const { drawable, sharing } = network.value
  return drawable.map(({ line, stops }) => {
    let d = ''
    for (let i = 0; i < stops.length - 1; i++) {
      const on = sharing.get(pairKey(stops[i].id, stops[i + 1].id))!
      // side by side, but the whole bundle never gets wider than a dot (they overlap instead)
      const offset = (on.indexOf(line.id) - (on.length - 1) / 2) * Math.min(lineW.value, 2 * dotR.value / on.length)
      const a = toLayer(stops[i].x, stops[i].y), b = toLayer(stops[i + 1].x, stops[i + 1].y)
      if (!stretchInView(a, b, Math.abs(offset) + 8)) continue
      const [lo, hi] = stops[i].id < stops[i + 1].id ? [a, b] : [b, a]
      const len = Math.hypot(hi.x - lo.x, hi.y - lo.y) || 1
      const nx = -(hi.y - lo.y) / len * offset, ny = (hi.x - lo.x) / len * offset
      d += `M ${a.x + nx} ${a.y + ny} L ${b.x + nx} ${b.y + ny} `
    }
    const names = act.value?.lineNames
    const isTarget = !!names && (names.has(line.shortName.toLowerCase()) || names.has(line.name.toLowerCase()))
    return { line, path: new Path2D(d), isTarget, empty: !d }
  }).filter(l => !l.empty)
})

const ghostLines = computed(() => {
  if (!ghost.value) return []
  const byId = new Map(ghost.value.stations.map(s => [s.id, s]))
  return ghost.value.lines.map((line) => {
    const pts = line.stops.map(st => byId.get(st.stationId)).filter(s => s !== undefined).map(s => toLayer(s.x, s.y))
    const d = pts.slice(1).map((b, i) => stretchInView(pts[i], b, 4) ? `M ${pts[i].x} ${pts[i].y} L ${b.x} ${b.y} ` : '').join('')
    return { line, path: new Path2D(d), empty: !d }
  }).filter(g => !g.empty)
})

const stations = computed(() => (shown.value?.stations ?? []).map(s => ({ s, p: toLayer(s.x, s.y) })))

// ---- crowded maps: smaller dots, and only the names that fit ----------------------------

const onScreen = computed(() => stations.value.filter(({ p }) => inView(around(p, 16)))) // dot, ring or click area
// How close stations on screen are: the median distance to the second nearest
// other one, in px (along a line: the next stop; the nearest is often the same
// stop's other platform), capped at CELL px (roomy). An average over the screen's
// area would be fooled by the empty space between lines. The distances are found
// once per model, in meters (lib/spacing.ts); zooming only scales them.
const CELL = 40
function medianSpacing(spacing: Map<number, number>, shown: { s: Station }[]) {
  const k = layoutScale.value
  const dists = shown.map(({ s }) => Math.min(CELL, (spacing.get(s.id) ?? Infinity) * k)).sort((a, b) => a - b)
  return dists.length > 1 ? dists[dists.length >> 1] : CELL
}
const dotSize = (nearest: number) => Math.max(1.5, Math.min(7, nearest / 5))
const spacing = computed(() => secondNearest(model.value?.stations ?? []))
const nearest = computed(() => medianSpacing(spacing.value, onScreen.value))
const dotR = computed(() => dotSize(nearest.value))
// packed too tight to point at one: plain markers, no clicking, hovering or dragging (zoom in for that)
const markers = computed(() => dotR.value < 3)
const lineW = computed(() => Math.max(1, Math.min(3.5, dotR.value / 2)))
const compact = computed(() => nearest.value < 30) // smaller label text too
const hovered = ref<number | null>(null) // its name is shown even where it doesn't fit

let measureCtx: CanvasRenderingContext2D | null = null
let fontFamily = ''
const family = () => fontFamily ||= getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'sans-serif'
const widths = new Map<string, number>()
// names measured before the web font arrived used the fallback's widths: measure again
const fontsLoaded = ref(0)
useEventListener(document.fonts, 'loadingdone', () => { widths.clear(); fontsLoaded.value++ })
function textWidth(text: string, font: string) {
  const key = font + '|' + text
  let w = widths.get(key)
  if (w === undefined) {
    measureCtx ??= document.createElement('canvas').getContext('2d')
    if (measureCtx) measureCtx.font = font
    w = measureCtx?.measureText(text).width ?? text.length * 7
    widths.set(key, w)
  }
  return w
}

// every station's name and dot boxes; a name can reach the screen from a station just off it
const labelBoxes = computed(() => {
  const r = dotR.value
  const [nameSize, idSize] = compact.value ? [11, 9.5] : [13, 11]
  void fontsLoaded.value
  return stations.value.map(({ s, p }) => {
    const w = textWidth(s.name + ' ', `700 ${nameSize}px ${family()}`) + textWidth(`(S${s.id})`, `500 ${idSize}px ${family()}`)
    const x = p.x + r + 3, y = p.y - r - 1 // the text's start and baseline
    return {
      s, p,
      box: { x1: x - 2, y1: y - nameSize - 1, x2: x + w + 2, y2: y + 4 },
      dot: { x1: p.x - r - 1, y1: p.y - r - 1, x2: p.x + r + 1, y2: p.y + r + 1 },
    }
  }).filter(l => inView(l.box) || inView(l.dot))
})

// the faded Arrange model on the Expected tab: sized by its own crowding like the
// model's (smaller still), names below in italics
const GHOST = 1e9 // their label ids, apart from the model's station ids
const ghostPoints = computed(() => (ghost.value?.stations ?? []).map(s => ({ s, p: toLayer(s.x, s.y) })))
const ghostSpacing = computed(() => secondNearest(ghost.value?.stations ?? []))
const ghostR = computed(() => Math.min(5, dotSize(medianSpacing(ghostSpacing.value, ghostPoints.value.filter(({ p }) => inView(around(p, 8)))))))
const ghostLineW = computed(() => Math.max(1, Math.min(3, ghostR.value / 2)))
const ghostStations = computed(() => ghostPoints.value.map(({ s, p }) => {
  void fontsLoaded.value
  const r = ghostR.value
  const x = p.x + r + 3, y = p.y + r + 9
  const w = textWidth(s.name, `italic 400 11px ${family()}`)
  return { s, p, x, y, box: { x1: x - 2, y1: y - 11, x2: x + w + 2, y2: y + 3 }, dot: around(p, r + 1) }
}).filter(g => inView(g.box) || inView(g.dot)))

// the ids of the names drawn (faded ones as GHOST + id)
const labelIds = computed<Set<number>>(() => {
  if (labelMode.value === 'none') return new Set()
  const real = labelBoxes.value.map(({ s, box, dot }) => ({
    id: s.id, box, dot,
    priority: !readonly && selection.value === s.id ? 3 : act.value?.ringStationIds.has(s.id) ? 2 : 1,
  }))
  const faded = ghostStations.value.map(({ s, box, dot }) => ({ id: GHOST + s.id, box, dot, priority: 1 }))
  if (labelMode.value === 'all') return new Set([...real, ...faded].filter(l => inView(l.box)).map(l => l.id))
  const shown = placeLabels(real)
  // the faded names fit in around everything real (faded dots never push a real name out)
  const taken = [...real.map(c => c.dot), ...real.filter(c => shown.has(c.id)).map(c => c.box)]
  for (const id of placeLabels(faded, taken)) shown.add(id)
  return shown
})
const labelled = computed(() => {
  const shown = stations.value.filter(({ s }) => s.id !== hovered.value && labelIds.value.has(s.id))
  const top = stations.value.find(({ s }) => s.id === hovered.value)
  return top ? [...shown, top] : shown
})

// the measure tool's line, in screen coordinates, with its label in the middle
const ruler = computed(() => {
  const { a, b, distance } = measured.value
  if (!a || readonly) return null // measuring is the editor map's tool
  const pa = toLayer(a.x, a.y)
  const pb = b ? toLayer(b.x, b.y) : null
  return { pa, pb, mid: pb && { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, label: formatDistance(distance) }
})
function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${Number(m.toFixed(3))} m`
}
const actCircles = computed(() => (act.value?.circles ?? [])
  .map(c => ({ ...toLayer(c.x, c.y), r: c.r * layoutScale.value }))
  .filter(c => inView(around(c, c.r + 2))))

// ---- camera: fit on load, keep visible on tab switch ----------------------------------

// the first fit has to wait until the map has been measured
watch(() => size.w > 0 && size.h > 0, (measured) => { if (measured) fit(model.value, act.value) }, { once: true })
// the compare view's maps come back with their last size already measured: fit them then
onMounted(() => { if (size.w > 0 && size.h > 0) fit(model.value, act.value) })
if (!readonly) {
  watch(loadCount, () => nextTick(() => fit(model.value, act.value)))
  watch(tab, () => nextTick(() => ensureVisible(model.value, act.value)))
}
defineExpose({ fit: () => fit(model.value, act.value) })

// ---- interaction: pan, pinch, wheel zoom, drag stations, double-click to add -----------

type Drag =
  | { type: 'pan'; startX: number; startY: number; cx: number; cy: number; stationId?: number }
  | { type: 'station'; id: number; offX: number; offY: number; moved: boolean }

let drag: Drag | null = null
const panning = ref(false)
const touches = new Map<number, { x: number; y: number }>() // active touch pointers
let pinch: { dist: number; scale: number; wx: number; wy: number } | null = null

const snap = (v: number, fine: boolean) => { const step = fine ? 0.01 : 1; return Math.round(v / step) * step }

function eventPoint(ev: PointerEvent | MouseEvent | WheelEvent) {
  const r = canvas.value!.getBoundingClientRect()
  return { x: ev.clientX - r.left, y: ev.clientY - r.top }
}

// the station under the pointer: the nearest within a finger's reach (16 px), so a
// dot always wins over a neighbour's reach; none while they're plain markers
function stationAt(ev: MouseEvent) {
  if (markers.value) return null
  const pt = eventPoint(ev)
  const x = (pt.x - pan.value.x) / zoom.value, y = (pt.y - pan.value.y) / zoom.value
  let best: number | null = null, bestD = 16
  for (const { s, p } of onScreen.value) {
    const d = Math.hypot(p.x - x, p.y - y)
    if (d <= bestD) { best = s.id; bestD = d }
  }
  return best
}
const findStation = (id: number) => model.value?.stations.find(s => s.id === id)

// (re)anchor the pinch to the current first two fingers
function rebasePinch() {
  const [a, b] = touches.values()
  const mid = screenToWorld((a.x + b.x) / 2, (a.y + b.y) / 2)
  pinch = { dist: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1), scale: view.scale, wx: mid.x, wy: mid.y }
}

function onPointerDown(ev: PointerEvent) {
  if (ev.pointerType === 'touch') {
    touches.set(ev.pointerId, eventPoint(ev))
    if (touches.size >= 2) {
      // a second finger turns any drag into a pinch; a half-dragged station stays put
      dragged.value = null
      drag = null
      panning.value = false
      rebasePinch()
      canvas.value!.setPointerCapture(ev.pointerId)
      return
    }
  }
  if (ev.button !== 0) return
  const pt = eventPoint(ev)
  const id = stationAt(ev)
  const station = id !== null && canEdit.value && !readonly ? findStation(id) : undefined
  if (measure.on && !readonly) { // measuring: drags pan, a click (on pointer up) sets a point
    drag = { type: 'pan', startX: pt.x, startY: pt.y, cx: view.cx, cy: view.cy, stationId: station?.id }
  } else if (station && selection.value === station.id) { // only the selected station moves, so a pan can't
    const w = screenToWorld(pt.x, pt.y)
    drag = { type: 'station', id: station.id, offX: station.x - w.x, offY: station.y - w.y, moved: false }
  } else {
    drag = { type: 'pan', startX: pt.x, startY: pt.y, cx: view.cx, cy: view.cy, stationId: station?.id }
    panning.value = true
  }
  canvas.value!.setPointerCapture(ev.pointerId)
}

function onPointerMove(ev: PointerEvent) {
  if (ev.pointerType === 'touch' && touches.has(ev.pointerId)) touches.set(ev.pointerId, eventPoint(ev))
  if (pinch) {
    if (!touches.has(ev.pointerId)) return
    const [a, b] = touches.values()
    view.scale = clampScale(pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist)
    // keep the world point that started under the fingers' midpoint under it
    view.cx = pinch.wx - ((a.x + b.x) / 2 - size.w / 2) / view.scale
    view.cy = pinch.wy + ((a.y + b.y) / 2 - size.h / 2) / view.scale
    return
  }
  const pt = eventPoint(ev)
  const w = screenToWorld(pt.x, pt.y)
  if (!drag) hovered.value = stationAt(ev)
  if (!readonly) try {
    const gps = xyToGPS(w.x, w.y)
    cursorText.value = `x ${w.x.toFixed(1)}  y ${w.y.toFixed(1)}   lat ${gps.lat.toFixed(6)}  lon ${gps.lon.toFixed(6)}`
  } catch {
    cursorText.value = `x ${w.x.toFixed(1)}  y ${w.y.toFixed(1)}`
  }

  if (measure.on && !readonly && measure.from && !measure.to) {
    const id = stationAt(ev)
    measure.hover = id !== null && findStation(id) ? { ...w, stationId: id } : w
  }

  if (drag?.type === 'pan') {
    view.cx = drag.cx - (pt.x - drag.startX) / view.scale
    view.cy = drag.cy + (pt.y - drag.startY) / view.scale
  } else if (drag?.type === 'station') {
    const at = dragged.value ?? findStation(drag.id)
    const x = snap(w.x + drag.offX, ev.shiftKey), y = snap(w.y + drag.offY, ev.shiftKey)
    if (at && (x !== at.x || y !== at.y)) {
      drag.moved = true
      dragged.value = { id: drag.id, x, y }
    }
  }
}

// returns true if the lifted pointer belonged to an active pinch
function liftPointer(ev: PointerEvent) {
  if (ev.pointerType !== 'touch' || !touches.delete(ev.pointerId) || !pinch) return false
  if (touches.size >= 2) {
    rebasePinch()
  } else {
    pinch = null
    if (touches.size === 1) {
      // hand off to a one-finger pan without a jump
      const [pt] = touches.values()
      drag = { type: 'pan', startX: pt.x, startY: pt.y, cx: view.cx, cy: view.cy }
      panning.value = true
    }
  }
  return true
}

function onPointerUp(ev: PointerEvent) {
  if (liftPointer(ev)) return
  if (drag?.type === 'station' && !drag.moved) clickStation(drag.id)
  const d = dragged.value, s = d && findStation(d.id)
  if (s) try { setStationXY(s, d.x, d.y) } catch { /* latitude at a pole */ }
  dragged.value = null
  const pt = eventPoint(ev)
  if (drag?.type === 'pan' && Math.hypot(pt.x - drag.startX, pt.y - drag.startY) < 4) { // a click, not a pan
    if (measure.on && !readonly) measureClick({ ...screenToWorld(pt.x, pt.y), stationId: drag.stationId })
    else if (drag.stationId !== undefined) clickStation(drag.stationId)
    else if (!readonly) selection.value = null
  }
  drag = null
  panning.value = false
}

function onPointerCancel(ev: PointerEvent) {
  if (liftPointer(ev)) return
  dragged.value = null
  drag = null
  panning.value = false
}

function onWheel(ev: WheelEvent) {
  const pt = eventPoint(ev)
  const before = screenToWorld(pt.x, pt.y)
  view.scale = clampScale(view.scale * Math.pow(1.0015, -ev.deltaY))
  const after = screenToWorld(pt.x, pt.y)
  view.cx += before.x - after.x
  view.cy += before.y - after.y
}

function onDblClick(ev: MouseEvent) {
  if (stationAt(ev) !== null || !canEdit.value || readonly || measure.on) return
  const pt = eventPoint(ev)
  // plain markers can't be pointed at (stationAt is null), but a new station shouldn't land on one
  const x = (pt.x - pan.value.x) / zoom.value, y = (pt.y - pan.value.y) / zoom.value
  if (onScreen.value.some(({ p }) => Math.hypot(p.x - x, p.y - y) * zoom.value <= dotR.value + 3)) return
  const w = screenToWorld(pt.x, pt.y)
  addStation(snap(w.x, ev.shiftKey), snap(w.y, ev.shiftKey))
}

// ---- drawing --------------------------------------------------------------------------

// The theme's colors, resolved through a hidden element inside the map (so the
// Expected tint and color-mix() come out as plain colors a canvas understands).
const probe = useTemplateRef<HTMLSpanElement>('probe')
const TOKENS = ['--map-bg', '--grid', '--grid-axis', '--grid-label', '--foreground', '--muted-foreground', '--signal', '--destructive'] as const
type Colors = Record<(typeof TOKENS)[number], string>
const colors = computed<Colors | null>(() => {
  void themeShown.value, showsExpected.value // re-read when either changes
  const el = probe.value
  if (!el) return null
  return Object.fromEntries(TOKENS.map((token) => {
    el.style.color = `var(${token})`
    return [token, getComputedStyle(el).color]
  })) as Colors
})

function formatMeters(v: number) {
  return Math.abs(v) >= 1000 ? (v / 1000) + ' km' : String(round6(v))
}
const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
}

// the grid's lines and their meter labels, in screen coordinates
function gridLines() {
  const step = gridStep()
  const tl = screenToWorld(0, 0), br = screenToWorld(size.w, size.h)
  const xs = [], ys = []
  for (let i = Math.floor(tl.x / step); i <= Math.ceil(br.x / step); i++) xs.push({ i, at: worldToScreen(i * step, 0).x, label: formatMeters(i * step) })
  for (let i = Math.floor(br.y / step); i <= Math.ceil(tl.y / step); i++) ys.push({ i, at: worldToScreen(0, i * step).y, label: formatMeters(i * step) })
  return { xs, ys }
}

function drawGrid(ctx: CanvasRenderingContext2D, c: Colors, { xs, ys }: ReturnType<typeof gridLines>) {
  for (const { i, at } of xs) {
    ctx.strokeStyle = i === 0 ? c['--grid-axis'] : c['--grid']
    ctx.lineWidth = i === 0 ? 1.5 : 1
    ctx.beginPath(); ctx.moveTo(at, 0); ctx.lineTo(at, size.h); ctx.stroke()
  }
  for (const { i, at } of ys) {
    ctx.strokeStyle = i === 0 ? c['--grid-axis'] : c['--grid']
    ctx.lineWidth = i === 0 ? 1.5 : 1
    ctx.beginPath(); ctx.moveTo(0, at); ctx.lineTo(size.w, at); ctx.stroke()
  }
}

// the meter labels go on top of everything (with a halo), so lines never hide them
function drawGridLabels(ctx: CanvasRenderingContext2D, c: Colors, { xs, ys }: ReturnType<typeof gridLines>) {
  ctx.font = `10.5px ${monoFamily()}`
  let free = -Infinity // long labels ("1430.746 km") are wider than the lines' spacing: skip those that would touch
  for (const { at, label } of xs) {
    if (at + 3 < free) continue
    haloText(ctx, label, at + 3, size.h - 5, c['--grid-label'], c['--map-bg'], 3)
    free = at + 3 + ctx.measureText(label).width + 12
  }
  for (const { at, label } of ys) haloText(ctx, label, 4, at - 4, c['--grid-label'], c['--map-bg'], 3)
}

// text with a halo in the map's background, so it stays readable over lines
function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, halo: string, width: number) {
  ctx.strokeStyle = halo
  ctx.lineWidth = width
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

// reactive, so moving the window to a screen of another density redraws it sharp
const { pixelRatio } = useDevicePixelRatio()

let monoFamilyName = ''
const monoFamily = () => monoFamilyName ||= getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace'

function draw() {
  const el = canvas.value, c = colors.value
  if (!el || !c || size.w === 0 || size.h === 0) return
  const dpr = pixelRatio.value
  const w = Math.round(size.w * dpr), h = Math.round(size.h * dpr)
  if (el.width !== w || el.height !== h) { el.width = w; el.height = h }
  const ctx = el.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = 1
  ctx.setLineDash([])
  ctx.fillStyle = c['--map-bg']
  ctx.fillRect(0, 0, size.w, size.h)
  const grid = gridLines()
  drawGrid(ctx, c, grid)

  // the layer, at its place on screen (and scaled like a picture mid-zoom)
  const z = zoom.value
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * pan.value.x, dpr * pan.value.y)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (ghost.value) {
    ctx.globalAlpha = 0.35
    const gw = ghostLineW.value
    ctx.lineWidth = gw
    ctx.setLineDash([gw * 2, gw * 1.3])
    for (const g of ghostLines.value) {
      ctx.strokeStyle = g.line.color || '#555'
      ctx.stroke(g.path)
    }
    ctx.setLineDash([])
    ctx.strokeStyle = c['--foreground']
    ctx.lineWidth = 1.5
    ctx.font = `italic 400 11px ${family()}`
    ctx.fillStyle = c['--foreground']
    for (const { s, p, x, y, dot } of ghostStations.value) {
      if (inView(dot)) { circle(ctx, p.x, p.y, ghostR.value); ctx.stroke() }
      if (labelIds.value.has(GHOST + s.id)) ctx.fillText(s.name, x, y)
    }
    ctx.globalAlpha = 1
  }

  ctx.setLineDash([6, 5])
  ctx.lineWidth = 1.5
  for (const a of actCircles.value) {
    circle(ctx, a.x, a.y, a.r)
    ctx.globalAlpha = 0.07
    ctx.fillStyle = c['--destructive']
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = c['--destructive']
    ctx.stroke()
  }
  ctx.setLineDash([])

  ctx.globalAlpha = 0.9
  for (const l of lines.value) {
    ctx.strokeStyle = l.line.color || '#555'
    ctx.lineWidth = l.isTarget ? lineW.value + 1.5 : lineW.value
    if (l.isTarget) { ctx.shadowColor = c['--destructive']; ctx.shadowBlur = 6 }
    ctx.stroke(l.path)
    ctx.shadowBlur = 0
  }
  ctx.globalAlpha = 1

  const r = dotR.value
  const editing = !readonly
  for (const { s, p } of onScreen.value) {
    const target = act.value?.ringStationIds.has(s.id) ?? false
    const selected = editing && selection.value === s.id
    if (target) {
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = c['--destructive']
      ctx.lineWidth = 2
      circle(ctx, p.x, p.y, r + 6)
      ctx.stroke()
      ctx.setLineDash([])
    }
    circle(ctx, p.x, p.y, r)
    if (markers.value) { // plain markers: no outline
      ctx.fillStyle = selected ? c['--signal'] : target ? c['--destructive'] : c['--foreground']
      ctx.fill()
      continue
    }
    ctx.fillStyle = selected || hovered.value === s.id ? c['--signal'] : c['--map-bg']
    ctx.fill()
    ctx.strokeStyle = target ? c['--destructive'] : c['--foreground']
    ctx.lineWidth = selected ? 3 : r < 5 ? 1.75 : 2.5
    ctx.stroke()
  }

  // names last, above every dot; the hovered one on top of the others
  const [nameSize, idSize, halo] = compact.value ? [11, 9.5, 3] : [13, 11, 4]
  const nameFont = `700 ${nameSize}px ${family()}`, idFont = `500 ${idSize}px ${family()}`
  for (const { s, p } of labelled.value) {
    const x = p.x + r + 3, y = p.y - r - 1
    ctx.font = nameFont
    haloText(ctx, s.name, x, y, c['--foreground'], c['--map-bg'], halo)
    ctx.font = idFont
    haloText(ctx, `(S${s.id})`, x + textWidth(s.name + ' ', nameFont), y, c['--muted-foreground'], c['--map-bg'], halo)
  }

  const rl = ruler.value
  if (rl) {
    if (rl.pb) {
      ctx.beginPath(); ctx.moveTo(rl.pa.x, rl.pa.y); ctx.lineTo(rl.pb.x, rl.pb.y)
      ctx.strokeStyle = c['--map-bg']; ctx.lineWidth = 6; ctx.stroke() // a halo, for lines of the same color
      ctx.setLineDash([5, 4]); ctx.strokeStyle = c['--signal']; ctx.lineWidth = 2; ctx.stroke()
      ctx.setLineDash([])
    }
    for (const e of rl.pb ? [rl.pa, rl.pb] : [rl.pa]) {
      circle(ctx, e.x, e.y, 4)
      ctx.fillStyle = c['--signal']; ctx.fill()
      ctx.strokeStyle = c['--map-bg']; ctx.lineWidth = 2; ctx.stroke()
    }
    if (rl.mid) {
      ctx.font = `700 12px ${monoFamily()}`
      ctx.textAlign = 'center'
      haloText(ctx, rl.label, rl.mid.x, rl.mid.y - 8, c['--signal'], c['--map-bg'], 4)
      ctx.textAlign = 'start'
    }
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawGridLabels(ctx, c, grid)
}

// paints after Vue's updates, once per change of anything draw() reads
watchEffect(draw, { flush: 'post' })

const cursor = computed(() => panning.value ? 'grabbing'
  : measure.on && !readonly ? 'crosshair'
  : hovered.value === null ? 'grab'
  : !readonly && selection.value === hovered.value ? 'move' : 'pointer')
const tooltip = computed(() => {
  const s = hovered.value === null ? undefined : stations.value.find(({ s }) => s.id === hovered.value)?.s
  return s ? `${s.name} (S${s.id})  x=${round6(s.x)} y=${round6(s.y)}` : undefined
})
</script>

<template>
  <div ref="box" class="map relative size-full touch-none select-none" :class="showsExpected && 'expected'">
    <canvas
      ref="canvas" class="absolute inset-0 block size-full" :style="{ cursor }" :title="tooltip"
      @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp"
      @pointercancel="onPointerCancel" @pointerleave="hovered = null; readonly || (cursorText = '')" @wheel.prevent="onWheel" @dblclick="onDblClick"
    />
    <!-- reads the theme's colors for the canvas -->
    <span ref="probe" class="hidden" aria-hidden="true" />
  </div>
</template>

<style scoped>
/* the colors come from theme tokens (read by draw() through the probe) */
.map { background: var(--map-bg); }
/* the Expected model's map is tinted with the blue that marks "Expected" elsewhere,
   so the two tabs can't be mistaken for each other at a glance */
.map.expected {
  --map-bg: color-mix(in oklch, var(--signal) var(--expected-tint), var(--background));
  --grid: color-mix(in oklch, var(--signal) calc(var(--expected-tint) * 2.5), var(--background));
  --grid-axis: color-mix(in oklch, var(--signal) calc(var(--expected-tint) * 6), var(--background));
}
</style>
