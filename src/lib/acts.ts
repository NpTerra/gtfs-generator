// act.txt methods: their parameters (drive the Act form) and their visual aids
// on the map.
//
// HOW TO ADD A NEW METHOD: add one entry to METHODS. The key is the first line
// of act.txt (matched in UPPERCASE); `params` describes the ';'-separated
// second line; `draw` (optional) marks things on the map through `overlay`.
import type { Model } from './model'

export type ParamKind = 'station' | 'line' | 'number' | 'text'
export interface ParamSpec { label: string; kind: ParamKind; repeat?: boolean }

export interface Overlay {
  circleAround(stationName: string | undefined, radiusMeters: number): void
  markStation(stationName: string | undefined): void
  highlightLine(lineName: string | undefined): void
}

interface MethodSpec {
  params: ParamSpec[]
  draw?(ctx: { params: string[]; rest: string[]; model: Model; overlay: Overlay }): void
}

export const METHODS: Record<string, MethodSpec> = {
  CLOSE_AREA: {
    params: [
      { label: 'station', kind: 'station' },
      { label: 'radius (m)', kind: 'number' },
    ],
    draw({ params, rest, overlay }) {
      overlay.circleAround(params[0], parseFloat(params[1]))
      for (const name of rest.flatMap(line => line.split(';')))
        overlay.highlightLine(name)
    },
  },

  DIVERT_LINE: {
    params: [
      { label: 'line', kind: 'line' },
      { label: 'new route (stations)', kind: 'station', repeat: true },
    ],
    draw({ params, overlay }) {
      overlay.highlightLine(params[0])
      for (const name of params.slice(1))
        overlay.markStation(name)
    },
  },
}

export interface Act { method: string; params: string[]; rest: string[] }

// blank lines are skipped; within the parameter line the split is positional,
// so an empty field keeps its place: "CLOSE_AREA\n;10"
export function split(act: string): Act {
  const lines = String(act ?? '').split('\n').map(s => s.trim()).filter(s => s !== '')
  return {
    method: lines[0] ?? '',
    params: lines.length > 1 ? lines[1].split(';').map(s => s.trim()) : [],
    rest: lines.slice(2),
  }
}

export function join({ method, params, rest }: Act): string {
  const p = [...params]
  while (p.length > 0 && p[p.length - 1] === '') p.pop()
  // all-empty params before more lines: ";" keeps the line from being blank (and skipped)
  return [method, ...(p.length > 0 || rest.length > 0 ? [p.join(';') || ';'] : []), ...rest].join('\n')
}

// the act's parameter values grouped per declared param
export function fields(act: Act): { param: ParamSpec; values: string[] }[] {
  const spec = METHODS[act.method.toUpperCase()]
  return (spec?.params ?? []).map((param, i) => ({
    param,
    values: param.repeat ? act.params.slice(i) : [act.params[i] ?? ''],
  }))
}

// Act parameters that don't resolve in the model, as i18n keys. Reported as
// warnings only: invalid-argument tests use such values on purpose.
export function checkAct(actText: string, model: Model): { key: string; params: Record<string, unknown> }[] {
  const out: { key: string; params: Record<string, unknown> }[] = []
  const stations = new Set(model.stations.map(s => s.name))
  const lines = new Set(model.lines.flatMap(l => [l.shortName, l.name]).map(n => String(n).toLowerCase()))
  for (const { param, values } of fields(split(actText))) {
    for (const v of values) {
      if (v === '') out.push({ key: 'v.actEmpty', params: { label: param.label } })
      else if (param.kind === 'station' && !stations.has(v)) out.push({ key: 'v.actNoStation', params: { name: v } })
      else if (param.kind === 'line' && !lines.has(v.toLowerCase())) out.push({ key: 'v.actNoLine', params: { name: v } })
      else if (param.kind === 'number' && !Number.isFinite(Number(v)))
        out.push({ key: 'v.actNotNumber', params: { label: param.label, value: v } })
    }
  }
  return out
}

export interface ActInfo { circles: { x: number; y: number; r: number }[]; ringStationIds: Set<number>; lineNames: Set<string> }

// What the map draws for the act: circles, ringed stations, highlighted lines (lowercased names).
export function computeAct(model: Model, actText: string): ActInfo {
  const info: ActInfo = { circles: [], ringStationIds: new Set(), lineNames: new Set() }
  const act = split(actText)
  const spec = METHODS[act.method.toUpperCase()]
  if (!spec?.draw) return info

  const overlay: Overlay = {
    circleAround(stationName, radiusMeters) {
      if (!stationName || !Number.isFinite(radiusMeters) || radiusMeters <= 0) return
      for (const s of model.stations)
        if (s.name === stationName) info.circles.push({ x: s.x, y: s.y, r: radiusMeters })
    },
    markStation(stationName) {
      if (!stationName) return
      for (const s of model.stations)
        if (s.name === stationName) info.ringStationIds.add(s.id)
    },
    highlightLine(lineName) {
      const name = String(lineName ?? '').trim().toLowerCase()
      if (name) info.lineNames.add(name)
    },
  }

  try {
    spec.draw({ params: act.params, rest: act.rest, model, overlay })
  } catch { /* a visual aid must never break rendering */ }
  return info
}
