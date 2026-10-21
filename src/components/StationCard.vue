<script setup lang="ts">
// The station objects come from the shared reactive store, so editing their
// fields directly is how this app updates state (no events needed).
import { XIcon } from '@lucide/vue'
import { computed } from 'vue'
import IdInput from '@/components/IdInput.vue'
import PrefixField from '@/components/PrefixField.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { changeStationId, deleteStation, selection } from '@/composables/useEditor'
import type { CoordMode, Model, Station } from '@/lib/model'
import { round6, setStationGPS, setStationXY } from '@/lib/model'

const props = defineProps<{ station: Station; model: Model }>()
const isGPS = computed(() => props.station.coordMode === 'gps')

// the two coordinate inputs: x/y in meters, or lat/lon in degrees
const coords = computed(() => isGPS.value
  ? [{ label: 'lat', title: 'Latitude (degrees)', value: props.station.lat }, { label: 'lon', title: 'Longitude (degrees)', value: props.station.lon }]
  : [{ label: 'x', title: 'x (meters)', value: props.station.x }, { label: 'y', title: 'y (meters)', value: props.station.y }])

function setCoord(index: number, raw: string) {
  const v = parseFloat(raw)
  if (!Number.isFinite(v)) return
  const s = props.station
  try {
    if (isGPS.value) setStationGPS(s, index === 0 ? v : s.lat, index === 1 ? v : s.lon)
    else setStationXY(s, index === 0 ? v : s.x, index === 1 ? v : s.y)
  } catch { /* latitude at a pole */ }
}
</script>

<template>
  <div
    :id="`station-card-${station.id}`"
    class="@container flex flex-col gap-1.5 rounded-xl border bg-card p-2"
    :class="selection === station.id && 'border-ring bg-selection'"
    @click="selection = station.id"
  >
    <div class="flex items-center gap-1.5">
      <Input v-model="station.name" placeholder="Name" aria-label="Station name" class="min-w-0 flex-1 font-semibold" />
      <IdInput :id="station.id" prefix="S" label="Station ID" :on-change-id="id => changeStationId(model, station, id)" />
      <Button variant="ghost" size="icon-sm" class="text-muted-foreground hover:text-destructive" title="Delete station" aria-label="Delete station" @click.stop="deleteStation(model, station)">
        <XIcon />
      </Button>
    </div>
    <!-- narrow cards put the XY/GPS switch on its own row -->
    <div class="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 @max-[17rem]:grid-cols-2">
      <ToggleGroup
        type="single" variant="outline" size="sm" class="@max-[17rem]:col-span-2" :model-value="station.coordMode"
        @update:model-value="v => v && (station.coordMode = v as CoordMode)"
      >
        <ToggleGroupItem value="xy" class="px-2 text-xs font-bold" title="Edit as map coordinates (meters)">XY</ToggleGroupItem>
        <ToggleGroupItem value="gps" class="px-2 text-xs font-bold" title="Edit as GPS coordinates (degrees)">GPS</ToggleGroupItem>
      </ToggleGroup>
      <PrefixField v-for="(c, i) in coords" :key="c.label" :prefix="c.label" :title="c.title">
        <input
          type="number" step="any" class="prefix-input" :aria-label="c.title" :value="round6(c.value)"
          @input="e => setCoord(i, (e.target as HTMLInputElement).value)"
        >
      </PrefixField>
    </div>
  </div>
</template>
