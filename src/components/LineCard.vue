<script setup lang="ts">
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronRightIcon, MapPinIcon, PlusIcon, XIcon } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import IdInput from '@/components/IdInput.vue'
import RefSelect from '@/components/RefSelect.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { changeLineId, deleteLine, hasRoomForStop, pickLineId } from '@/composables/useEditor'
import { t } from '@/lib/i18n'
import type { Line, Model } from '@/lib/model'
import { appendStop, LIMITS, room } from '@/lib/model'
import { inkFor } from '@/lib/utils'

const props = defineProps<{ line: Line; model: Model }>()

const ROUTE_TYPES: { id: number; label: string }[] = ([
  [0, '0 - Tram / light rail'], [1, '1 - Subway / metro'], [2, '2 - Rail'], [3, '3 - Bus'],
  [4, '4 - Ferry'], [5, '5 - Cable tram'], [6, '6 - Aerial lift'], [7, '7 - Funicular'],
  [11, '11 - Trolleybus'], [12, '12 - Monorail'],
] as const).map(([id, label]) => ({ id, label }))
// a feed's extended type (e.g. 700, bus service) is valid too: listed by its number
const routeTypes = computed(() => ROUTE_TYPES.some(r => r.id === props.line.type)
  ? ROUTE_TYPES
  : [...ROUTE_TYPES, { id: props.line.type, label: String(props.line.type) }])

// long stop lists (imported lines) start folded; picking or adding stops unfolds them.
// The card can be handed another line with the same id (another test case, an import)
const stopsOpen = ref(props.line.stops.length <= 10)
watch(() => props.line, (line) => { stopsOpen.value = line.stops.length <= 10 })
watch(() => pickLineId.value === props.line.id, (picking) => { if (picking) stopsOpen.value = true })

// the route bullet: the short name on the line's color, like a transit sign
const color = computed(() => /^#[0-9a-fA-F]{6}$/.test(props.line.color) ? props.line.color : '#555555')
const bulletText = computed(() => inkFor(color.value))

function move(i: number, delta: number) {
  const stops = props.line.stops
  ;[stops[i], stops[i + delta]] = [stops[i + delta], stops[i]]
}

function addStop() {
  if (!hasRoomForStop(props.model, props.line)) return
  const used = new Set(props.line.stops.map(s => s.stationId))
  const next = props.model.stations.find(s => !used.has(s.id)) ?? props.model.stations[0]
  appendStop(props.line, next.id)
  stopsOpen.value = true
}
</script>

<template>
  <div class="@container flex flex-col gap-2 rounded-xl border bg-card p-2 lazy-card" :class="pickLineId === line.id && 'border-ring bg-selection'">
    <div class="flex items-center gap-1.5">
      <label
        class="relative grid h-8 min-w-8 shrink-0 cursor-pointer place-items-center rounded-lg px-1.5 text-sm font-bold ring-1 ring-black/15 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring"
        :style="{ background: color, color: bulletText }" title="Line color (click to change)"
      >
        {{ line.shortName || '?' }}
        <input
          type="color" :value="color" aria-label="Line color" class="absolute inset-0 size-full cursor-pointer opacity-0"
          @input="e => line.color = (e.target as HTMLInputElement).value.toUpperCase()"
        >
      </label>
      <Input v-model="line.shortName" :maxlength="room(LIMITS.text, line.shortName)" class="w-16 shrink-0" placeholder="Short" aria-label="Short name" title="Short name (route_short_name)" />
      <Input v-model="line.name" :maxlength="room(LIMITS.text, line.name)" class="min-w-0 flex-1" placeholder="Long name" aria-label="Long name" title="Long name (route_long_name)" />
      <Button variant="ghost" size="icon-sm" class="text-muted-foreground hover:text-destructive" title="Delete line" aria-label="Delete line" @click="deleteLine(model, line)">
        <XIcon />
      </Button>
    </div>
    <div class="flex items-center gap-1.5">
      <IdInput :id="line.id" prefix="R" label="Line ID" :on-change-id="id => changeLineId(model, line, id)" />
      <RefSelect v-model="line.type" :options="routeTypes" :label="r => r.label" prefix="type " class="min-w-0 flex-1" title="Route type" aria-label="Route type" />
    </div>

    <p v-if="line.stops.length === 0" class="text-[13px] text-muted-foreground">{{ t('hint.noStops') }}</p>
    <button
      v-else type="button" :aria-expanded="stopsOpen"
      class="flex items-center gap-1 self-start rounded text-xs font-semibold text-muted-foreground hover:text-foreground"
      @click="stopsOpen = !stopsOpen"
    >
      <ChevronRightIcon class="size-3.5 transition-transform" :class="stopsOpen && 'rotate-90'" />
      {{ line.stops.length }} {{ line.stops.length === 1 ? 'stop' : 'stops' }}
    </button>
    <!-- stop rows: station | arrival | departure | actions; narrow cards give the station its own row -->
    <div v-if="line.stops.length && stopsOpen" class="grid grid-cols-[minmax(0,1fr)_4.875rem_4.875rem_auto] items-center gap-1 @max-[22rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <span class="text-xs font-semibold text-muted-foreground @max-[22rem]:hidden">Stops in order</span>
      <span class="text-xs font-semibold text-muted-foreground @max-[22rem]:hidden">Arrival</span>
      <span class="text-xs font-semibold text-muted-foreground @max-[22rem]:hidden">Departure</span>
      <span class="@max-[22rem]:hidden" />
      <template v-for="(stop, i) in line.stops" :key="i">
        <RefSelect
          v-model="stop.stationId" :options="model.stations" :label="s => `${s.name} (S${s.id})`" prefix="S" size="sm"
          class="@max-[22rem]:col-span-3 @max-[22rem]:mt-1" :aria-label="`Stop ${i + 1} station`"
        />
        <Input v-model="stop.arrival" class="h-7 px-1 font-mono text-[13px] md:text-[13px]" placeholder="Arrival" :aria-label="`Stop ${i + 1} arrival`" title="Arrival time (HH:MM:SS, empty = 00:00:00)" />
        <Input v-model="stop.departure" class="h-7 px-1 font-mono text-[13px] md:text-[13px]" placeholder="Departure" :aria-label="`Stop ${i + 1} departure`" title="Departure time (HH:MM:SS, empty = 00:00:00)" />
        <div class="flex">
          <Button variant="ghost" size="icon-xs" title="Move up" aria-label="Move up" :disabled="i === 0" @click="move(i, -1)"><ArrowUpIcon /></Button>
          <Button variant="ghost" size="icon-xs" title="Move down" aria-label="Move down" :disabled="i === line.stops.length - 1" @click="move(i, 1)"><ArrowDownIcon /></Button>
          <Button variant="ghost" size="icon-xs" class="hover:text-destructive" title="Remove stop" aria-label="Remove stop" @click="line.stops.splice(i, 1)"><XIcon /></Button>
        </div>
      </template>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <Button variant="outline" size="sm" :disabled="model.stations.length === 0" @click="addStop"><PlusIcon /> Add stop</Button>
      <Button
        :variant="pickLineId === line.id ? 'signal' : 'outline'" size="sm" :disabled="model.stations.length === 0"
        title="Click stations on the map to append them as stops (Esc to finish)"
        @click="pickLineId = pickLineId === line.id ? null : line.id"
      >
        <template v-if="pickLineId === line.id"><CheckIcon /> Done picking</template>
        <template v-else><MapPinIcon /> Pick stops on map</template>
      </Button>
    </div>
  </div>
</template>
