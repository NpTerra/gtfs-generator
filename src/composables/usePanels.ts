// Which layout panels are visible. App.vue keeps the resizable panels in sync
// with these flags, so any component can show/hide a panel by flipping one.
import { nextTick, reactive } from 'vue'

export type PanelName = 'test' | 'model' | 'problems'

export const panels = reactive<Record<PanelName, boolean>>({ test: true, model: true, problems: true })

// shows a panel and scrolls it into view (phones stack the panels)
export function showPanel(name: PanelName) {
  panels[name] = true
  nextTick(() => document.getElementById('panel-' + name)?.scrollIntoView({ block: 'nearest' }))
}
