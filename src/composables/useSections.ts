// Which collapsible PanelSections are open, shared so code can open one
// (e.g. Generate opening Agency to point at the missing phone number).
import { reactive } from 'vue'

export const openSections = reactive(new Set(['test', 'expected', 'stations', 'lines']))
