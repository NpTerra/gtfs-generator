<script setup lang="ts">
// SVG map: grid, faded Arrange model (on the Expected tab), act overlay,
// lines and draggable stations. Everything drawn is computed from the store
// and the viewport, so Vue re-renders it whenever either changes.
// Given a `model` (and its own `viewport`), it only shows that model:
// pan and zoom, no editing (the compare view).
import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'
import {
  addStation, canEdit, clickStation, editableModel, loadCount, pickLine, selection, tab, tc,
} from '@/composables/useEditor'
import { measure, measureClick, measured } from '@/composables/useMeasure'
import { clampScale, cursorText, labelMode, mainViewport, showArrangeGhost, type Viewport } from '@/composables/useViewport'
import { type Box, placeLabels } from '@/lib/labels'
import { computeAct } from '@/lib/acts'
import { xyToGPS } from '@/lib/geo'
import type { Model } from '@/lib/model'
import { round6, setStationXY } from '@/lib/model'

const props = withDefaults(defineProps<{ viewport?: Viewport; model?: Model | null }>(), { viewport: () => mainViewport })
const readonly = props.model !== undefined
const { view, size, worldToScreen, screenToWorld, gridStep, fit, ensureVisible } = props.viewport

const svg = ref<SVGSVGElement>()
// the layout size: useElementSize measures an svg with getBoundingClientRect,
// which a dialog's zoom-in animation shrinks
useResizeObserver(svg, ([entry]) => {
  size.w = entry.contentRect.width
  size.h = entry.contentRect.height
})

const model = computed<Model | null>(() => readonly ? props.model ?? null : canEdit.value ? editableModel.value : null)
// tinted as Expected: the editor map on the Expected tab, a compare map showing that model
const showsExpected = computed(() => readonly ? props.model === tc.value.expected.model : tab.value === 'expected')
const ghost = computed(() => !readonly && showArrangeGhost.value && tab.value === 'expected' && model.value ? tc.value.arrange : null)
const act = computed(() => model.value ? computeAct(model.value, tc.value.act) : null)

// ---- what to draw ------------------------------------------------------------------

function formatMeters(v: number) {
  return Math.abs(v) >= 1000 ? (v / 1000) + ' km' : String(round6(v))
}

const grid = computed(() => {
  const step = gridStep()
  const tl = screenToWorld(0, 0) // min x, max y
  const br = screenToWorld(size.w, size.h) // max x, min y
  const xs = [], ys = []
  for (let i = Math.floor(tl.x / step); i <= Math.ceil(br.x / step); i++)
    xs.push({ i, pos: worldToScreen(i * step, 0).x, label: formatMeters(i * step) })
  for (let i = Math.floor(br.y / step); i <= Math.ceil(tl.y / step); i++)
    ys.push({ i, pos: worldToScreen(0, i * step).y, label: formatMeters(i * step) })
  return { xs, ys }
})

function screenPoints(m: Model, stopIds: number[]) {
  const byId = new Map(m.stations.map(s => [s.id, s]))
  return stopIds.map(id => byId.get(id)).filter(s => s !== undefined).map(s => worldToScreen(s.x, s.y))
}

// Lines sharing a stretch between two stations are drawn side by side, each
// shifted by its rank among the lines on that stretch only (a line alone on a
// stretch stays on it). The shift's side comes from the station pair in id
// order, so it doesn't flip with a line's direction of travel.
// ---- what's in view: only things with no part on screen are skipped -------------------
// The margin is larger than a station's biggest drawn extent (its 16 px click
// area, its act ring), so nothing pops into existence at the edges.
const CULL = 32 // px
const inView = (b: Box) => b.x2 > -CULL && b.x1 < size.w + CULL && b.y2 > -CULL && b.y1 < size.h + CULL
const around = (p: { x: number; y: number }, r: number): Box => ({ x1: p.x - r, y1: p.y - r, x2: p.x + r, y2: p.y + r })
// a stretch's bounding box, widened by its side shift and line width (glow included)
const stretchInView = (a: { x: number; y: number }, b: { x: number; y: number }, pad: number) =>
  inView({ x1: Math.min(a.x, b.x) - pad, y1: Math.min(a.y, b.y) - pad, x2: Math.max(a.x, b.x) + pad, y2: Math.max(a.y, b.y) + pad })

const pairKey = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`
// the drawable lines with their stations, and which lines share each stretch;
// only changes with the model, not on every pan frame
const network = computed(() => {
  if (!model.value) return null
  const byId = new Map(model.value.stations.map(s => [s.id, s]))
  const drawable = model.value.lines.map(line => ({
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
      const a = worldToScreen(stops[i].x, stops[i].y), b = worldToScreen(stops[i + 1].x, stops[i + 1].y)
      if (!stretchInView(a, b, Math.abs(offset) + 8)) continue
      const [lo, hi] = stops[i].id < stops[i + 1].id ? [a, b] : [b, a]
      const len = Math.hypot(hi.x - lo.x, hi.y - lo.y) || 1
      const nx = -(hi.y - lo.y) / len * offset, ny = (hi.x - lo.x) / len * offset
      d += `M ${a.x + nx} ${a.y + ny} L ${b.x + nx} ${b.y + ny} `
    }
    const names = act.value?.lineNames
    const isTarget = !!names && (names.has(line.shortName.toLowerCase()) || names.has(line.name.toLowerCase()))
    return { line, d, isTarget }
  }).filter(l => l.d)
})

const ghostLines = computed(() => ghost.value
  ? ghost.value.lines
    .map(line => ({ line, pts: screenPoints(ghost.value!, line.stops.map(st => st.stationId)) }))
    .map(({ line, pts }) => ({
      line, d: pts.slice(1).map((b, i) => stretchInView(pts[i], b, 4) ? `M ${pts[i].x} ${pts[i].y} L ${b.x} ${b.y} ` : '').join(''),
    }))
    .filter(g => g.d)
  : [])

const stations = computed(() => (model.value?.stations ?? []).map(s => ({ s, p: worldToScreen(s.x, s.y) })))

// ---- crowded maps: smaller dots, and only the names that fit ----------------------------

const onScreen = computed(() => stations.value.filter(({ p }) => inView(around(p, 16)))) // dot, ring or click area
// the average room each station on screen has, in px
// How close stations on screen are: the median distance to the second nearest
// other one, in px (along a line: the next stop; the nearest is often the same
// stop's other platform). A grid of buckets finds it; beyond a bucket's reach
// counts as roomy. An average over the screen's area would be fooled by the
// empty space between lines.
const nearest = computed(() => {
  const CELL = 40
  const pts = onScreen.value.map(({ p }) => p)
  const grid = new Map<string, { x: number; y: number }[]>()
  const key = (x: number, y: number) => Math.floor(x / CELL) + ':' + Math.floor(y / CELL)
  for (const p of pts) {
    const list = grid.get(key(p.x, p.y))
    if (list) list.push(p); else grid.set(key(p.x, p.y), [p])
  }
  const dists = pts.map((p) => {
    let first = CELL, second = CELL
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const q of grid.get(key(p.x + dx * CELL, p.y + dy * CELL)) ?? []) {
          if (q === p) continue
          const d = Math.hypot(q.x - p.x, q.y - p.y)
          if (d < first) [first, second] = [d, first]
          else if (d < second) second = d
        }
    return second
  }).sort((a, b) => a - b)
  return dists.length > 1 ? dists[dists.length >> 1] : CELL
})
const dotR = computed(() => Math.max(1.5, Math.min(7, nearest.value / 5)))
// packed too tight to point at one: plain markers, no clicking, hovering or dragging (zoom in for that)
const markers = computed(() => dotR.value < 3)
const lineW = computed(() => Math.max(1, Math.min(3.5, dotR.value / 2)))
const compact = computed(() => nearest.value < 30) // smaller label text too
const hovered = ref<number | null>(null) // its name is shown even where it doesn't fit

let measureCtx: CanvasRenderingContext2D | null = null
let fontFamily = ''
const family = () => fontFamily ||= getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'sans-serif'
const widths = new Map<string, number>()
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

// the faded Arrange stations on the Expected tab: smaller, names below in italics
const GHOST = 1e9 // their label ids, apart from the model's station ids
const ghostR = computed(() => Math.min(5, dotR.value))
const ghostStations = computed(() => (ghost.value?.stations ?? []).map(s => {
  const p = worldToScreen(s.x, s.y), r = ghostR.value
  const x = p.x + r + 3, y = p.y + r + 9
  const w = textWidth(s.name, `italic 400 11px ${family()}`)
  return { s, p, x, y, box: { x1: x - 2, y1: y - 11, x2: x + w + 2, y2: y + 3 }, dot: around(p, r + 1) }
}).filter(g => inView(g.box) || inView(g.dot)))

// the ids of the names drawn (faded ones as GHOST + id); the faded ones come last
const labelIds = computed<Set<number>>(() => {
  if (labelMode.value === 'none') return new Set()
  const all = [
    ...labelBoxes.value.map(({ s, box, dot }) => ({
      id: s.id, box, dot,
      priority: !readonly && selection.value === s.id ? 3 : act.value?.ringStationIds.has(s.id) ? 2 : 1,
    })),
    ...ghostStations.value.map(({ s, box }) => ({ id: GHOST + s.id, box, priority: 0 })), // faded dots block no names
  ]
  if (labelMode.value === 'all') return new Set(all.filter(l => inView(l.box)).map(l => l.id))
  return placeLabels(all)
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
  const pa = worldToScreen(a.x, a.y)
  const pb = b ? worldToScreen(b.x, b.y) : null
  return { pa, pb, mid: pb && { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, label: formatDistance(distance) }
})
function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${Number(m.toFixed(3))} m`
}
const actCircles = computed(() => (act.value?.circles ?? [])
  .map(c => ({ ...worldToScreen(c.x, c.y), r: c.r * view.scale }))
  .filter(c => inView(around(c, c.r + 2))))

// ---- camera: fit on load, keep visible on tab switch ----------------------------------

// the first fit has to wait until the svg has been measured
watch(() => size.w > 0 && size.h > 0, (measured) => { if (measured) fit(model.value, act.value) }, { once: true })
if (!readonly) {
  watch(loadCount, () => nextTick(() => fit(model.value, act.value)))
  watch(tab, () => nextTick(() => ensureVisible(model.value, act.value)))
}
defineExpose({ fit: () => fit(model.value, act.value) })

// ---- interaction: pan, pinch, wheel zoom, drag stations, double-click to add -----------

type Drag =
  | { type: 'pan'; startX: number; startY: number; cx: number; cy: number; stationId?: number }
  | { type: 'station'; id: number; origX: number; origY: number; offX: number; offY: number; moved: boolean }

let drag: Drag | null = null
const panning = ref(false)
const touches = new Map<number, { x: number; y: number }>() // active touch pointers
let pinch: { dist: number; scale: number; wx: number; wy: number } | null = null

const snap = (v: number, fine: boolean) => { const step = fine ? 0.01 : 1; return Math.round(v / step) * step }

function eventPoint(ev: PointerEvent | MouseEvent | WheelEvent) {
  const r = svg.value!.getBoundingClientRect()
  return { x: ev.clientX - r.left, y: ev.clientY - r.top }
}

const stationAt = (ev: Event) => {
  const id = (ev.target as Element).getAttribute?.('data-station-id')
  return id === null ? null : Number(id)
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
      // a second finger turns any drag into a pinch; undo a half-dragged station
      if (drag?.type === 'station' && drag.moved) {
        const s = findStation(drag.id)
        if (s) setStationXY(s, drag.origX, drag.origY)
      }
      drag = null
      panning.value = false
      rebasePinch()
      svg.value!.setPointerCapture(ev.pointerId)
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
    drag = { type: 'station', id: station.id, origX: station.x, origY: station.y, offX: station.x - w.x, offY: station.y - w.y, moved: false }
  } else {
    drag = { type: 'pan', startX: pt.x, startY: pt.y, cx: view.cx, cy: view.cy, stationId: station?.id }
    panning.value = true
  }
  svg.value!.setPointerCapture(ev.pointerId)
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
    const s = findStation(drag.id)
    const nx = snap(w.x + drag.offX, ev.shiftKey), ny = snap(w.y + drag.offY, ev.shiftKey)
    if (s && (nx !== s.x || ny !== s.y)) {
      drag.moved = true
      try { setStationXY(s, nx, ny) } catch { /* latitude at a pole */ }
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
  const w = screenToWorld(pt.x, pt.y)
  addStation(snap(w.x, ev.shiftKey), snap(w.y, ev.shiftKey))
}
</script>

<template>
  <svg
    ref="svg" class="map block size-full touch-none select-none"
    :class="[panning ? 'cursor-grabbing' : measure.on && !readonly ? 'cursor-crosshair' : 'cursor-grab', showsExpected && 'expected']"
    @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp"
    @pointercancel="onPointerCancel" @pointerleave="hovered = null; readonly || (cursorText = '')" @wheel.prevent="onWheel" @dblclick="onDblClick"
  >
    <g>
      <template v-for="g in grid.xs" :key="'x' + g.i">
        <line :x1="g.pos" y1="0" :x2="g.pos" :y2="size.h" :class="g.i === 0 ? 'grid-axis' : 'grid-line'" />
        <text :x="g.pos + 3" :y="size.h - 5" class="grid-label">{{ g.label }}</text>
      </template>
      <template v-for="g in grid.ys" :key="'y' + g.i">
        <line x1="0" :y1="g.pos" :x2="size.w" :y2="g.pos" :class="g.i === 0 ? 'grid-axis' : 'grid-line'" />
        <text x="4" :y="g.pos - 4" class="grid-label">{{ g.label }}</text>
      </template>
    </g>

    <g class="ghost">
      <path v-for="g in ghostLines" :key="g.line.id" :d="g.d" :stroke="g.line.color || '#555'" class="ghost-line" />
      <template v-for="{ s, p, x, y, dot } in ghostStations" :key="s.id">
        <circle v-if="inView(dot)" :cx="p.x" :cy="p.y" :r="ghostR" class="ghost-station" />
        <text v-if="labelIds.has(GHOST + s.id)" :x="x" :y="y" class="ghost-label">{{ s.name }}</text>
      </template>
    </g>

    <g>
      <circle v-for="(c, i) in actCircles" :key="i" :cx="c.x" :cy="c.y" :r="c.r" class="act-circle" />
    </g>

    <g>
      <path
        v-for="l in lines" :key="l.line.id" :d="l.d" :stroke="l.line.color || '#555'" :stroke-width="l.isTarget ? lineW + 1.5 : lineW"
        class="line-path" :class="l.isTarget && 'act-target'" opacity="0.9"
      >
        <title>{{ l.line.name }} (R{{ l.line.id }})</title>
      </path>
    </g>

    <g>
      <!-- finger-sized hit areas, all below the dots so a dot always wins over a neighbour's -->
      <template v-if="!markers">
        <circle v-for="{ s, p } in onScreen" :key="'hit' + s.id" :cx="p.x" :cy="p.y" r="16" class="station-hit" :class="!readonly && selection === s.id && 'selected'" :data-station-id="s.id" />
      </template>
      <template v-for="{ s, p } in onScreen" :key="s.id">
        <circle v-if="act?.ringStationIds.has(s.id)" :cx="p.x" :cy="p.y" :r="dotR + 6" class="act-ring" />
        <circle
          :cx="p.x" :cy="p.y" :r="dotR" :data-station-id="markers ? undefined : s.id" class="station-dot"
          :class="{ selected: !readonly && selection === s.id, 'act-target': act?.ringStationIds.has(s.id), picking: !readonly && pickLine, small: dotR < 5, marker: markers }"
        >
          <title>{{ s.name }} (S{{ s.id }})  x={{ round6(s.x) }} y={{ round6(s.y) }}</title>
        </circle>
      </template>
    </g>

    <!-- names in a pass of their own, above every dot; the hovered one last, on top of the others -->
    <g>
      <text v-for="{ s, p } in labelled" :key="s.id" :x="p.x + dotR + 3" :y="p.y - dotR - 1" class="station-label" :class="compact && 'compact'">
        {{ s.name }} <tspan class="station-id">(S{{ s.id }})</tspan>
      </text>
    </g>

    <!-- last, so stations and their names never hide it (it ignores the pointer) -->
    <g v-if="ruler" class="ruler">
      <template v-if="ruler.pb">
        <line :x1="ruler.pa.x" :y1="ruler.pa.y" :x2="ruler.pb.x" :y2="ruler.pb.y" class="ruler-halo" />
        <line :x1="ruler.pa.x" :y1="ruler.pa.y" :x2="ruler.pb.x" :y2="ruler.pb.y" class="ruler-line" />
      </template>
      <circle :cx="ruler.pa.x" :cy="ruler.pa.y" r="4" class="ruler-end" />
      <circle v-if="ruler.pb" :cx="ruler.pb.x" :cy="ruler.pb.y" r="4" class="ruler-end" />
      <text v-if="ruler.mid" :x="ruler.mid.x" :y="ruler.mid.y - 8" text-anchor="middle" class="ruler-label">{{ ruler.label }}</text>
    </g>
  </svg>
</template>

<style scoped>
/* plain CSS is still the simplest way to style SVG; colors come from theme tokens */
.map { background: var(--map-bg); }
/* the Expected model's map is tinted with the blue that marks "Expected" elsewhere,
   so the two tabs can't be mistaken for each other at a glance */
.map.expected {
  --map-bg: color-mix(in oklch, var(--signal) var(--expected-tint), var(--background));
  --grid: color-mix(in oklch, var(--signal) calc(var(--expected-tint) * 2.5), var(--background));
  --grid-axis: color-mix(in oklch, var(--signal) calc(var(--expected-tint) * 6), var(--background));
}
.grid-line { stroke: var(--grid); stroke-width: 1; }
.grid-axis { stroke: var(--grid-axis); stroke-width: 1.5; }
.grid-label { fill: var(--grid-label); font-size: 10.5px; font-family: var(--font-mono); }

.ghost { pointer-events: none; opacity: .35; }
.ghost-line { fill: none; stroke-width: 3; stroke-dasharray: 6 4; stroke-linecap: round; stroke-linejoin: round; }
.ghost-station { fill: none; stroke: var(--foreground); stroke-width: 1.5; }
.ghost-label { fill: var(--foreground); font-size: 11px; font-style: italic; }

.act-circle { fill: color-mix(in oklch, var(--destructive) 7%, transparent); stroke: var(--destructive); stroke-dasharray: 6 5; stroke-width: 1.5; }
.act-ring { fill: none; stroke: var(--destructive); stroke-width: 2; stroke-dasharray: 3 3; }

.line-path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.line-path.act-target { filter: drop-shadow(0 0 3px color-mix(in oklch, var(--destructive) 80%, transparent)); }

.ruler { pointer-events: none; }
/* the halo keeps the ruler readable on top of a line of the same color */
.ruler-halo { stroke: var(--map-bg); stroke-width: 6; stroke-linecap: round; }
.ruler-line { stroke: var(--signal); stroke-width: 2; stroke-dasharray: 5 4; }
.ruler-end { fill: var(--signal); stroke: var(--map-bg); stroke-width: 2; }
.ruler-label {
  fill: var(--signal); font-size: 12px; font-weight: 700; font-family: var(--font-mono);
  paint-order: stroke; stroke: var(--map-bg); stroke-width: 4px;
}

.station-hit { fill: transparent; cursor: pointer; }
.station-hit.selected, .station-dot.selected { cursor: move; }
.cursor-crosshair .station-hit, .cursor-crosshair .station-dot { cursor: crosshair; }
.station-dot { fill: var(--map-bg); stroke: var(--foreground); stroke-width: 2.5; cursor: pointer; }
.station-dot:hover, .station-dot.picking:hover { fill: var(--signal); }
.station-dot.selected { fill: var(--signal); stroke: var(--foreground); stroke-width: 3; }
.station-dot.small { stroke-width: 1.75; }
.station-dot.marker { fill: var(--foreground); stroke: none; pointer-events: none; }
.station-dot.marker.selected { fill: var(--signal); }
.station-dot.marker.act-target { fill: var(--destructive); }
.station-dot.act-target { stroke: var(--destructive); }
.station-label {
  fill: var(--foreground); font-size: 13px; font-weight: 700; pointer-events: none;
  paint-order: stroke; stroke: var(--map-bg); stroke-width: 4px;
}
.station-id { fill: var(--muted-foreground); font-weight: 500; font-size: 11px; }
.station-label.compact { font-size: 11px; stroke-width: 3px; }
.station-label.compact .station-id { font-size: 9.5px; }
</style>
