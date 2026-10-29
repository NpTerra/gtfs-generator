<script setup lang="ts">
// The center of the layout: toolbar (tabs, map tools) + map.
import {
  Columns2Icon, LassoIcon, LayersIcon, MaximizeIcon, PlusIcon, Redo2Icon, RouteIcon, RulerIcon, SquareDashedMousePointerIcon, TagIcon, Undo2Icon,
} from '@lucide/vue'
import { ref } from 'vue'
import CompareDialog from '@/components/CompareDialog.vue'
import MapView from '@/components/MapView.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  addStation, canEdit, canRedo, canUndo, editableModel, pickLine, pickLineId, redo, setTab, tab, tc, undo,
} from '@/composables/useEditor'
import { measure, measured, toggleMeasure } from '@/composables/useMeasure'
import { freeSpot, labelMode, lineHover, selectTool, showArrangeGhost, type LabelMode } from '@/composables/useViewport'
import { t } from '@/lib/i18n'

const map = ref<InstanceType<typeof MapView>>()
const comparing = ref(false)

const num = (v: number, digits: number) => Number.isFinite(v) ? String(Number(v.toFixed(digits))) : '–'

// one map tool at a time: a selection tool turns the ruler off (and the ruler turns it off)
function toggleTool(tool: 'rect' | 'lasso') {
  selectTool.value = selectTool.value === tool ? null : tool
  if (selectTool.value && measure.on) toggleMeasure()
}

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
            <TabsTrigger value="expected" class="data-[state=active]:text-link">Expected</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div class="flex flex-wrap items-center gap-1">
        <Button
          v-if="tab === 'expected'" variant="outline" size="icon-sm" :disabled="!canEdit" :aria-pressed="showArrangeGhost"
          :class="showArrangeGhost && 'border-signal bg-signal/10 text-link'"
          title="Show the Arrange model faded underneath" aria-label="Show Arrange underneath" @click="showArrangeGhost = !showArrangeGhost"
        >
          <LayersIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="icon-sm" :title="`Station names: ${labelMode}`" aria-label="Station names">
              <TagIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-64">
            <DropdownMenuLabel class="text-xs font-semibold text-muted-foreground">Station names</DropdownMenuLabel>
            <DropdownMenuRadioGroup :model-value="labelMode" @update:model-value="v => (labelMode = v as LabelMode)">
              <DropdownMenuRadioItem value="auto">Auto <span class="ml-auto text-xs text-muted-foreground">those that fit</span></DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="none">None <span class="ml-auto text-xs text-muted-foreground">hover shows one</span></DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline" size="icon-sm" :aria-pressed="lineHover" :class="lineHover && 'border-signal bg-signal/10 text-link'"
          title="Line names on hover: highlights the line under the pointer" aria-label="Line names on hover" @click="lineHover = !lineHover"
        >
          <RouteIcon />
        </Button>
        <Button variant="outline" size="icon-sm" title="Compare Arrange and Expected side by side" aria-label="Compare side by side" @click="comparing = true">
          <Columns2Icon />
        </Button>
        <Button variant="outline" size="sm" :disabled="!canEdit" title="Add a station in the middle of the map" @click="addStationHere">
          <PlusIcon /> <span class="hidden @2xl:inline">Station</span>
        </Button>
        <Button
          variant="outline" size="icon-sm" :disabled="!canEdit" :aria-pressed="selectTool === 'rect'"
          :class="selectTool === 'rect' && 'border-signal bg-signal/10 text-link'"
          title="Rectangle select: drag over stations to select them (Shift adds; Shift + drag works without this too)" aria-label="Rectangle select"
          @click="toggleTool('rect')"
        >
          <SquareDashedMousePointerIcon />
        </Button>
        <Button
          variant="outline" size="icon-sm" :disabled="!canEdit" :aria-pressed="selectTool === 'lasso'"
          :class="selectTool === 'lasso' && 'border-signal bg-signal/10 text-link'"
          title="Lasso select: draw around stations to select them (Shift adds)" aria-label="Lasso select"
          @click="toggleTool('lasso')"
        >
          <LassoIcon />
        </Button>
        <Button
          variant="outline" size="icon-sm" :disabled="!canEdit" :aria-pressed="measure.on"
          :class="measure.on && 'border-signal bg-signal/10 text-link'"
          title="Measure: click two stations or points to see their distance and coordinates (Esc to stop)" aria-label="Measure"
          @click="toggleMeasure"
        >
          <RulerIcon />
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
        v-if="measure.on && canEdit"
        class="absolute top-2.5 left-2.5 max-w-[calc(100%-20px)] rounded-xl border bg-popover px-3 py-2 text-[13px] text-popover-foreground shadow-lg"
        aria-live="polite"
      >
        <p v-if="!measured.a" class="text-muted-foreground">{{ t('map.measureStart') }}</p>
        <template v-else>
          <table class="font-mono text-xs">
            <tbody>
              <tr v-for="[label, p] in [['From', measured.a], ['To', measured.b]] as const" :key="label">
                <th class="pr-2 text-left font-sans font-semibold">{{ label }}</th>
                <td v-if="p" class="pr-3 font-sans">{{ p.label }}</td>
                <td v-if="p" class="pr-3">x {{ num(p.x, 3) }} y {{ num(p.y, 3) }}</td>
                <td v-if="p">lat {{ num(p.lat, 7) }} lon {{ num(p.lon, 7) }}</td>
                <td v-if="!p" colspan="3" class="font-sans text-muted-foreground">{{ t('map.measureNext') }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="measured.b" class="mt-1.5 font-semibold">
            {{ num(measured.distance, 6) }} m
            <span class="font-normal text-muted-foreground">(Δx {{ num(measured.dx, 6) }}, Δy {{ num(measured.dy, 6) }})</span>
          </p>
        </template>
      </div>

      <div
        v-if="pickLine"
        class="absolute top-2.5 left-1/2 flex max-w-[calc(100%-20px)] -translate-x-1/2 items-center gap-3 rounded-2xl border bg-popover py-1.5 pr-1.5 pl-3 text-popover-foreground shadow-lg"
      >
        <span>{{ t('map.picking', { name: pickLine.name }) }}</span>
        <Button size="sm" @click="pickLineId = null">Done</Button>
      </div>

    </div>
    <CompareDialog v-model:open="comparing" />
  </main>
</template>
