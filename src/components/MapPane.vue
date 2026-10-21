<script setup lang="ts">
// The center of the layout: toolbar (tabs, map tools, panel toggles) + map.
import {
  MaximizeIcon, PlusIcon, Redo2Icon, Undo2Icon,
} from '@lucide/vue'
import { ref } from 'vue'
import MapView from '@/components/MapView.vue'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  addStation, canEdit, canRedo, canUndo, editableModel, pickLine, pickLineId, redo, setTab, tab, tc, undo,
} from '@/composables/useEditor'
import { freeSpot } from '@/composables/useViewport'
import { t } from '@/lib/i18n'

const map = ref<InstanceType<typeof MapView>>()

function addStationHere() {
  const p = freeSpot(editableModel.value.stations)
  addStation(p.x, p.y)
}
</script>

<template>
  <main class="@container flex h-full min-h-0 flex-col bg-background">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b px-2 py-1">
      <div class="flex items-center gap-1.5">
        <Tabs :model-value="tab" @update:model-value="v => setTab(v as 'arrange' | 'expected')">
          <TabsList>
            <TabsTrigger value="arrange">Arrange</TabsTrigger>
            <TabsTrigger value="expected">Expected</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div class="flex flex-wrap items-center gap-1">
        <Button variant="outline" size="sm" :disabled="!canEdit" title="Add a station in the middle of the map" @click="addStationHere">
          <PlusIcon /> <span class="hidden @2xl:inline">Station</span>
        </Button>
        <Button variant="outline" size="icon-sm" :disabled="!canUndo" title="Undo (Ctrl+Z)" aria-label="Undo" @click="undo"><Undo2Icon /></Button>
        <Button variant="outline" size="icon-sm" :disabled="!canRedo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" @click="redo"><Redo2Icon /></Button>
        <Button variant="outline" size="sm" title="Zoom to fit all stations" @click="map?.fit()">
          <MaximizeIcon /> <span class="hidden @2xl:inline">Fit view</span>
        </Button>
      </div>
    </div>

    <div class="relative min-h-0 flex-1">
      <MapView ref="map" />

      <div
        v-if="!canEdit"
        class="absolute inset-0 flex items-center justify-center bg-background/90 p-8 text-center text-muted-foreground"
      >
        {{ t('map.exceptionMsg', { name: tc.expected.exception }) }}
      </div>

      <div
        v-if="pickLine"
        class="absolute top-2.5 left-1/2 flex max-w-[calc(100%-20px)] -translate-x-1/2 items-center gap-3 rounded-2xl border bg-popover py-1.5 pr-1.5 pl-3 text-popover-foreground shadow-lg"
      >
        <span>{{ t('map.picking', { name: pickLine.name }) }}</span>
        <Button size="sm" @click="pickLineId = null">Done</Button>
      </div>

    </div>
  </main>
</template>
