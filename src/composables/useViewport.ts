// The map's camera (center + zoom) and screen<->world conversion. World
// coordinates are meters with the Y axis up. The main camera is shared, so the
// Model panel can place new stations in the middle of what the map shows.
import { useLocalStorage } from '@vueuse/core'
import { reactive, ref } from 'vue'
import type { ActInfo } from '@/lib/acts'
import type { Model, Station } from '@/lib/model'
import { round6 } from '@/lib/model'

export const SCALE_MIN = 0.0005
export const SCALE_MAX = 400

export const clampScale = (s: number) => Math.max(SCALE_MIN, Math.min(SCALE_MAX, s))

// A camera: center + zoom, and the size of the map it draws into. The editor's
// map uses the main one below; the compare view makes one per map.
export function createViewport() {
  const view = reactive({ cx: 10, cy: 0, scale: 18 }) // world center + px per meter
  const size = reactive({ w: 0, h: 0 }) // map size in px, kept up to date by MapView

  function worldToScreen(x: number, y: number) {
    return { x: (x - view.cx) * view.scale + size.w / 2, y: (view.cy - y) * view.scale + size.h / 2 }
  }

  function screenToWorld(sx: number, sy: number) {
    return { x: (sx - size.w / 2) / view.scale + view.cx, y: view.cy - (sy - size.h / 2) / view.scale }
  }

  // world meters per grid line, keeping lines 55-170 px apart
  function gridStep(): number {
    let step = Math.pow(10, Math.floor(Math.log10(80 / view.scale)))
    for (const mul of [1, 2, 5, 10]) {
      if (step * mul * view.scale >= 55) { step *= mul; break }
    }
    return step
  }

  function fit(model: Model | null, act: ActInfo | null) {
    if (size.w === 0 || size.h === 0) return // not measured yet: would zoom out to the limit
    if (!model || model.stations.length === 0) {
      Object.assign(view, { cx: 10, cy: 0, scale: 18 })
      return
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const s of model.stations) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x)
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y)
    }
    // include act circles so a big CLOSE_AREA radius stays visible
    for (const c of act?.circles ?? []) {
      minX = Math.min(minX, c.x - c.r); maxX = Math.max(maxX, c.x + c.r)
      minY = Math.min(minY, c.y - c.r); maxY = Math.max(maxY, c.y + c.r)
    }
    view.cx = (minX + maxX) / 2
    view.cy = (minY + maxY) / 2
    view.scale = clampScale(Math.min((size.w - 140) / Math.max(maxX - minX, 1), (size.h - 140) / Math.max(maxY - minY, 1)))
  }

  // fits only when none of the model's stations is on screen
  function ensureVisible(model: Model | null, act: ActInfo | null) {
    if (!model || model.stations.length === 0) return
    const anyVisible = model.stations.some(s => {
      const p = worldToScreen(s.x, s.y)
      return p.x >= 0 && p.x <= size.w && p.y >= 0 && p.y <= size.h
    })
    if (!anyVisible) fit(model, act)
  }

  return { view, size, worldToScreen, screenToWorld, gridStep, fit, ensureVisible }
}
export type Viewport = ReturnType<typeof createViewport>

export const mainViewport = createViewport()
export const { view, size, worldToScreen, screenToWorld, gridStep, fit, ensureVisible } = mainViewport

// a grid point near the view center that isn't on top of a station
export function freeSpot(stations: Station[]) {
  const step = gridStep()
  const round = (v: number) => round6(Math.round(v / step) * step)
  let x = round(view.cx)
  const y = round(view.cy)
  while (stations.some(s => Math.hypot(s.x - x, s.y - y) < step / 2))
    x = round6(x + step)
  return { x, y }
}

// whether the Expected tab draws the Arrange model faded underneath (a map toolbar toggle)
export const showArrangeGhost = ref(true)

// the map's selection tool: dragging draws a rectangle or a lasso instead of panning
export const selectTool = ref<'rect' | 'lasso' | null>(null)

// station names on the map: only those that fit (auto), every one, or none
export type LabelMode = 'auto' | 'all' | 'none'
export const labelMode = useLocalStorage<LabelMode>('gtfs-map-labels', 'auto')

// hovering a line names it and highlights it over the faded rest (a map toolbar toggle)
export const lineHover = useLocalStorage('gtfs-map-line-hover', false)

// the map position under the mouse, shown in the status bar
export const cursorText = ref('')
