// The map's measure tool: click two points (stations or anywhere) to see their
// distance and both ends' XY and GPS coordinates. A point on a station
// follows it when the station moves.
import { computed, reactive } from 'vue'
import { xyToGPS } from '@/lib/geo'
import { editableModel, pickLineId } from './useEditor'
import { selectTool } from './useViewport'

export interface MeasurePoint { x: number; y: number; stationId?: number }

export const measure = reactive({
  on: false,
  from: null as MeasurePoint | null,
  to: null as MeasurePoint | null,
  hover: null as MeasurePoint | null, // the pointer, while choosing the second point
})

export function toggleMeasure() {
  measure.on = !measure.on
  measure.from = measure.to = measure.hover = null
  if (measure.on) { // a click can't both pick a stop (or start a selection) and measure
    pickLineId.value = null
    selectTool.value = null
  }
}

// Esc: first drops the points, then leaves the tool; false if it was off
export function escapeMeasure(): boolean {
  if (!measure.on) return false
  if (measure.from) measure.from = measure.to = null
  else measure.on = false
  return true
}

// a third click starts a new measurement
export function measureClick(p: MeasurePoint) {
  if (!measure.from || measure.to) {
    measure.from = p
    measure.to = measure.hover = null // the old end must not stand in until the pointer moves
  } else {
    measure.to = p
  }
}

function resolve(p: MeasurePoint | null) {
  if (!p) return null
  const station = p.stationId === undefined ? undefined : editableModel.value.stations.find(s => s.id === p.stationId)
  if (station) return { x: station.x, y: station.y, lat: station.lat, lon: station.lon, label: `${station.name} (S${station.id})` }
  try {
    return { x: p.x, y: p.y, ...xyToGPS(p.x, p.y), label: '' }
  } catch {
    return { x: p.x, y: p.y, lat: NaN, lon: NaN, label: '' } // beyond a pole
  }
}

// both ends (the second one follows the pointer until clicked) and the distance in meters
export const measured = computed(() => {
  const a = resolve(measure.from)
  const b = resolve(measure.to ?? measure.hover)
  if (!a || !b) return { a, b: null, dx: 0, dy: 0, distance: 0 }
  const dx = b.x - a.x, dy = b.y - a.y
  return { a, b, dx, dy, distance: Math.hypot(dx, dy) }
})
