<script setup lang="ts">
// Layout: resizable, collapsible panels around the map on desktop (sizes are
// saved by the panel group), a pinned map with stacked panels on phones.
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { onMounted, ref, watch } from 'vue'
import 'vue-sonner/style.css'
import { ChevronUpIcon, CircleXIcon, ClipboardListIcon, TriangleAlertIcon, WaypointsIcon } from '@lucide/vue'
import AppHeader from '@/components/AppHeader.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import GtfsImportDialog from '@/components/GtfsImportDialog.vue'
import MapPane from '@/components/MapPane.vue'
import ModelPanel from '@/components/ModelPanel.vue'
import ProblemsPanel from '@/components/ProblemsPanel.vue'
import StatusBar from '@/components/StatusBar.vue'
import TestPanel from '@/components/TestPanel.vue'
import ToolStripe from '@/components/ToolStripe.vue'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Toaster } from '@/components/ui/sonner'
import { canEdit, deleteStation, editableModel, errorCount, pickLineId, problems, redo, selection, undo } from '@/composables/useEditor'
import '@/composables/useTheme' // applies the saved light/dark/system theme on load
import { panels, type PanelName } from '@/composables/usePanels'

const isPhone = useMediaQuery('(max-width: 767px)')

// resize handles drawn as the transparent gap between islands; tinted while hovered/dragged
const GAP = 'w-1.5 bg-transparent after:hidden rounded-full data-[orientation=vertical]:h-1.5 data-[orientation=vertical]:w-full data-[state=hover]:bg-ring/25 data-[state=drag]:bg-ring/50'


// ---- panel visibility <-> collapsible panels ----------------------------------------
interface CollapsiblePanel { collapse(): void; expand(): void; isCollapsed: boolean }
const refs: Record<PanelName, ReturnType<typeof ref<CollapsiblePanel>>> = {
  test: ref(), model: ref(), problems: ref(),
}
for (const name of Object.keys(refs) as PanelName[]) {
  watch(() => panels[name], (visible) => {
    const panel = refs[name].value
    if (!panel || panel.isCollapsed === !visible) return
    if (visible) panel.expand(); else panel.collapse()
  })
}
// a panel restored collapsed from the saved layout starts hidden
onMounted(() => {
  for (const name of Object.keys(refs) as PanelName[])
    if (refs[name].value?.isCollapsed) panels[name] = false
})

// ---- keyboard shortcuts (inside form fields the browser's own undo etc. win) ----------
useEventListener(document, 'keydown', (ev: KeyboardEvent) => {
  if ((ev.target as Element).closest?.('input, textarea, select, [role="dialog"]')) return
  const key = ev.key.toLowerCase()
  if ((ev.ctrlKey || ev.metaKey) && (key === 'z' || key === 'y')) {
    ev.preventDefault()
    if (key === 'z' && !ev.shiftKey) undo(); else redo()
  } else if (key === 'escape') {
    selection.value = null
    pickLineId.value = null
  } else if ((key === 'delete' || key === 'backspace') && selection.value !== null && canEdit.value) {
    const station = editableModel.value.stations.find(s => s.id === selection.value)
    if (station) { ev.preventDefault(); deleteStation(editableModel.value, station) }
  }
})
</script>

<template>
  <div class="project-tint flex h-dvh flex-col bg-chrome">
    <AppHeader />

    <!-- phones: the map island stays pinned on top, the other islands scroll below it -->
    <div v-if="isPhone" class="min-h-0 flex-1 overflow-y-auto px-1.5">
      <div class="sticky top-0 z-10 h-[50dvh] bg-chrome pb-1.5"><MapPane class="island" /></div>
      <TestPanel id="panel-test" class="island mb-1.5" />
      <ModelPanel id="panel-model" class="island mb-1.5" />
      <ProblemsPanel id="panel-problems" class="island mb-1.5" />
    </div>

    <div v-else class="flex min-h-0 flex-1 px-1.5">
      <ToolStripe :items="[{ panel: 'test', label: 'Test case', icon: ClipboardListIcon }]" />

      <!-- the 6px gaps between islands are the resize handles, as in IntelliJ -->
      <ResizablePanelGroup direction="horizontal" auto-save-id="gtfs-vue-layout" class="min-h-0 flex-1">
        <ResizablePanel
          id="panel-test" :ref="refs.test" :order="1" :default-size="24" :min-size="15" collapsible :collapsed-size="0"
          @collapse="panels.test = false" @expand="panels.test = true"
        >
          <TestPanel class="island" />
        </ResizablePanel>
        <ResizableHandle :class="GAP" />
        <ResizablePanel id="center" :order="2" :min-size="30" class="flex flex-col">
          <ResizablePanelGroup direction="vertical" auto-save-id="gtfs-vue-layout-center" class="min-h-0 flex-1">
            <ResizablePanel id="map" :order="1" :min-size="30">
              <MapPane class="island" />
            </ResizablePanel>
            <ResizableHandle :class="GAP" />
            <ResizablePanel
              id="panel-problems" :ref="refs.problems" :order="2" :default-size="18" :min-size="8" collapsible :collapsed-size="0"
              @collapse="panels.problems = false" @expand="panels.problems = true"
            >
              <ProblemsPanel class="island" />
            </ResizablePanel>
          </ResizablePanelGroup>
          <!-- a collapsed Problems panel stays where it belongs, as a one-line bar -->
          <button
            v-if="!panels.problems" type="button"
            class="island flex h-8 shrink-0 items-center gap-2 px-3 text-left font-semibold hover:bg-muted"
            title="Show Problems" @click="panels.problems = true"
          >
            <ChevronUpIcon class="size-4 text-muted-foreground" /> Problems
            <span class="flex items-center gap-1 font-normal text-muted-foreground">
              <CircleXIcon v-if="errorCount" class="size-3.5 text-destructive" /><TriangleAlertIcon v-else-if="problems.length" class="size-3.5 text-warn" />{{ problems.length }}
            </span>
          </button>
        </ResizablePanel>
        <ResizableHandle :class="GAP" />
        <ResizablePanel
          id="panel-model" :ref="refs.model" :order="3" :default-size="28" :min-size="18" collapsible :collapsed-size="0"
          @collapse="panels.model = false" @expand="panels.model = true"
        >
          <ModelPanel class="island" />
        </ResizablePanel>
      </ResizablePanelGroup>

      <ToolStripe :items="[{ panel: 'model', label: 'Model', icon: WaypointsIcon }]" />
    </div>

    <StatusBar />
    <ConfirmDialog />
    <GtfsImportDialog />
    <Toaster position="bottom-right" rich-colors />
  </div>
</template>

<style>
/* a tool window "island": rounded, on the window background */
.island { border-radius: var(--radius-2xl); overflow: hidden; background: var(--surface); }
</style>
