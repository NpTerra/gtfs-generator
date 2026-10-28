<script setup lang="ts">
// SVG map: grid, faded Arrange model (on the Expected tab), act overlay,
// lines and draggable stations. Everything drawn is computed from the store
// and the viewport, so Vue re-renders it whenever either changes.
import { useElementSize } from '@vueuse/core'
import { computed, nextTick, ref, watch, watchEffect } from 'vue'
import {
  addStation, canEdit, clickStation, editableModel, loadCount, pickLine, selection, tab, tc,
} from '@/composables/useEditor'
import { measure, measureClick, measured } from '@/composables/useMeasure'
import {
  clampScale, cursorText, ensureVisible, fit, gridStep, screenToWorld, size, view, worldToScreen,
} from '@/composables/useViewport'
import { computeAct } from '@/lib/acts'
import { xyToGPS } from '@/lib/geo'
import type { Model } from '@/lib/model'
import { round6, setStationXY } from '@/lib/model'

const svg = ref<SVGSVGElement>()
const { width, height } = useElementSize(svg)
watchEffect(() => { size.w = width.value; size.h = height.value })

const model = computed<Model | null>(() => canEdit.value ? editableModel.value : null)
const ghost = computed(() => tab.value === 'expected' && model.value ? tc.value.arrange : null)
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

const lines = computed(() => {
  if (!model.value) return []
  const m = model.value
  const drawable = m.lines
    .map(line => ({ line, pts: screenPoints(m, line.stops.map(st => st.stationId)) }))
    .filter(d => d.pts.length >= 2)
  return drawable.map(({ line, pts }, idx) => {
    // per-line perpendicular offset so overlapping lines stay visible
    const offset = (idx - (drawable.length - 1) / 2) * 3.5
    let d = ''
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const nx = -(b.y - a.y) / len * offset, ny = (b.x - a.x) / len * offset
      d += `M ${a.x + nx} ${a.y + ny} L ${b.x + nx} ${b.y + ny} `
    }
    const names = act.value?.lineNames
    const isTarget = !!names && (names.has(line.shortName.toLowerCase()) || names.has(line.name.toLowerCase()))
    return { line, d, isTarget }
  })
})

const ghostLines = computed(() => ghost.value
  ? ghost.value.lines
    .map(line => ({ line, pts: screenPoints(ghost.value!, line.stops.map(st => st.stationId)) }))
    .filter(d => d.pts.length >= 2)
    .map(d => ({ ...d, points: d.pts.map(p => `${p.x},${p.y}`).join(' ') }))
  : [])

const stations = computed(() => (model.value?.stations ?? []).map(s => ({ s, p: worldToScreen(s.x, s.y) })))

// the measure tool's line, in screen coordinates, with its label in the middle
const ruler = computed(() => {
  const { a, b, distance } = measured.value
  if (!a) return null
  const pa = worldToScreen(a.x, a.y)
  const pb = b ? worldToScreen(b.x, b.y) : null
  return { pa, pb, mid: pb && { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, label: formatDistance(distance) }
})
function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${Number(m.toFixed(3))} m`
}
const ghostStations = computed(() => (ghost.value?.stations ?? []).map(s => ({ s, p: worldToScreen(s.x, s.y) })))

// ---- camera: fit on load, keep visible on tab switch ----------------------------------

// the first fit has to wait until the svg has been measured
watch(() => size.w > 0 && size.h > 0, (measured) => { if (measured) fit(model.value, act.value) }, { once: true })
watch(loadCount, () => nextTick(() => fit(model.value, act.value)))
watch(tab, () => nextTick(() => ensureVisible(model.value, act.value)))
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
  const station = id !== null && canEdit.value ? findStation(id) : undefined
  if (measure.on) { // measuring: drags pan, a click (on pointer up) sets a point
    drag = { type: 'pan', startX: pt.x, startY: pt.y, cx: view.cx, cy: view.cy, stationId: station?.id }
  } else if (station) {
    const w = screenToWorld(pt.x, pt.y)
    drag = { type: 'station', id: station.id, origX: station.x, origY: station.y, offX: station.x - w.x, offY: station.y - w.y, moved: false }
  } else {
    drag = { type: 'pan', startX: pt.x, startY: pt.y, cx: view.cx, cy: view.cy }
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
  try {
    const gps = xyToGPS(w.x, w.y)
    cursorText.value = `x ${w.x.toFixed(1)}  y ${w.y.toFixed(1)}   lat ${gps.lat.toFixed(6)}  lon ${gps.lon.toFixed(6)}`
  } catch {
    cursorText.value = `x ${w.x.toFixed(1)}  y ${w.y.toFixed(1)}`
  }

  if (measure.on && measure.from && !measure.to) {
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
  if (drag?.type === 'pan' && measure.on) {
    const pt = eventPoint(ev)
    if (Math.hypot(pt.x - drag.startX, pt.y - drag.startY) < 4) measureClick({ ...screenToWorld(pt.x, pt.y), stationId: drag.stationId })
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
  if (stationAt(ev) !== null || !canEdit.value || measure.on) return
  const pt = eventPoint(ev)
  const w = screenToWorld(pt.x, pt.y)
  addStation(snap(w.x, ev.shiftKey), snap(w.y, ev.shiftKey))
}
</script>

<template>
  <svg
    ref="svg" class="map block size-full touch-none select-none"
    :class="[panning ? 'cursor-grabbing' : measure.on ? 'cursor-crosshair' : 'cursor-grab', tab === 'expected' && 'expected']"
    @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp"
    @pointercancel="onPointerCancel" @pointerleave="cursorText = ''" @wheel.prevent="onWheel" @dblclick="onDblClick"
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
      <polyline v-for="g in ghostLines" :key="g.line.id" :points="g.points" :stroke="g.line.color || '#555'" class="ghost-line" />
      <template v-for="{ s, p } in ghostStations" :key="s.id">
        <circle :cx="p.x" :cy="p.y" r="5" class="ghost-station" />
        <text :x="p.x + 8" :y="p.y + 14" class="ghost-label">{{ s.name }}</text>
      </template>
    </g>

    <g>
      <circle v-for="(c, i) in act?.circles" :key="i" :cx="worldToScreen(c.x, c.y).x" :cy="worldToScreen(c.x, c.y).y" :r="c.r * view.scale" class="act-circle" />
    </g>

    <g>
      <path
        v-for="l in lines" :key="l.line.id" :d="l.d" :stroke="l.line.color || '#555'" :stroke-width="l.isTarget ? 5 : 3.5"
        class="line-path" :class="l.isTarget && 'act-target'" opacity="0.9"
      >
        <title>{{ l.line.name }} (R{{ l.line.id }})</title>
      </path>
    </g>

    <g>
      <!-- finger-sized hit areas, all below the dots so a dot always wins over a neighbour's -->
      <circle v-for="{ s, p } in stations" :key="'hit' + s.id" :cx="p.x" :cy="p.y" r="16" class="station-hit" :data-station-id="s.id" />
      <template v-for="{ s, p } in stations" :key="s.id">
        <circle v-if="act?.ringStationIds.has(s.id)" :cx="p.x" :cy="p.y" r="13" class="act-ring" />
        <circle
          :cx="p.x" :cy="p.y" r="7" :data-station-id="s.id" class="station-dot"
          :class="{ selected: selection === s.id, 'act-target': act?.ringStationIds.has(s.id), picking: pickLine }"
        >
          <title>{{ s.name }} (S{{ s.id }})  x={{ round6(s.x) }} y={{ round6(s.y) }}</title>
        </circle>
        <text :x="p.x + 10" :y="p.y - 8" class="station-label">{{ s.name }} <tspan class="station-id">(S{{ s.id }})</tspan></text>
      </template>
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
.cursor-crosshair .station-hit, .cursor-crosshair .station-dot { cursor: crosshair; }
.station-dot { fill: var(--map-bg); stroke: var(--foreground); stroke-width: 2.5; cursor: pointer; }
.station-dot:hover, .station-dot.picking:hover { fill: var(--signal); }
.station-dot.selected { fill: var(--signal); stroke: var(--foreground); stroke-width: 3; }
.station-dot.act-target { stroke: var(--destructive); }
.station-label {
  fill: var(--foreground); font-size: 13px; font-weight: 700; pointer-events: none;
  paint-order: stroke; stroke: var(--map-bg); stroke-width: 4px;
}
.station-id { fill: var(--muted-foreground); font-weight: 500; font-size: 11px; }
</style>
