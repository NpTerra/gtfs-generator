<script setup lang="ts">
// Pick routes from a GTFS feed to replace the Arrange or Expected model with, or for a new test case.
// State and the import itself live in composables/useGtfsImport.ts.
import { SearchIcon } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { applyGtfsImport, gtfsImport } from '@/composables/useGtfsImport'
import { inkFor } from '@/lib/utils'

const TYPES: Record<number, string> = {
  0: 'Tram', 1: 'Metro', 2: 'Rail', 3: 'Bus', 4: 'Ferry', 5: 'Cable tram', 6: 'Aerial lift', 7: 'Funicular', 11: 'Trolleybus', 12: 'Monorail',
}

const query = ref('')
watch(() => gtfsImport.open, open => { if (open) query.value = '' })

const routes = computed(() => gtfsImport.feed?.routes ?? [])
const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? routes.value.filter(r => `${r.shortName} ${r.longName}`.toLowerCase().includes(q)) : routes.value
})
const targetName = computed(() => gtfsImport.target === 'expected' ? 'Expected' : 'Arrange')

function toggle(key: string, on: boolean) {
  if (on) gtfsImport.selected.add(key)
  else gtfsImport.selected.delete(key)
}
const selectVisible = (on: boolean) => visible.value.forEach(r => toggle(r.key, on))
</script>

<template>
  <Dialog v-model:open="gtfsImport.open">
    <DialogContent class="flex max-h-[85dvh] flex-col gap-3 sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Import routes from GTFS</DialogTitle>
        <DialogDescription v-if="gtfsImport.target === 'new'">
          From {{ gtfsImport.fileName }}. The picked routes become the Arrange model of a new test case (and a copy of them its Expected model).
        </DialogDescription>
        <DialogDescription v-else>
          From {{ gtfsImport.fileName }}. The picked routes replace the {{ targetName }} model;
          the agency and its phone number stay as they are.
        </DialogDescription>
      </DialogHeader>

      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="query" class="pl-8" placeholder="Search routes" aria-label="Search routes" />
        </div>
        <Button variant="outline" size="sm" @click="selectVisible(true)">Select {{ query ? 'shown' : 'all' }}</Button>
        <Button variant="ghost" size="sm" @click="selectVisible(false)">Clear</Button>
      </div>

      <ul class="min-h-0 flex-1 overflow-y-auto rounded-xl border" aria-label="Routes">
        <li v-for="r in visible" :key="r.key" class="border-b last:border-b-0">
          <label class="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-muted">
            <Checkbox :model-value="gtfsImport.selected.has(r.key)" @update:model-value="v => toggle(r.key, v === true)" />
            <span class="grid h-5 min-w-7 shrink-0 place-items-center rounded px-1 text-xs font-bold" :style="{ background: r.color, color: inkFor(r.color) }">
              {{ r.shortName || '?' }}
            </span>
            <span class="min-w-0 flex-1 truncate">{{ r.longName || r.shortName }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{{ TYPES[r.type] ?? `Type ${r.type}` }}, {{ r.stopCount }} stops</span>
          </label>
        </li>
        <li v-if="visible.length === 0" class="px-3 py-6 text-center text-muted-foreground">No routes match "{{ query }}".</li>
      </ul>

      <div class="flex items-start gap-2">
        <Checkbox id="one-trip" v-model="gtfsImport.oneTripPerLine" class="mt-0.5" />
        <div class="grid gap-0.5">
          <Label for="one-trip">One trip per line</Label>
          <p class="text-xs text-muted-foreground">
            Real feeds run hundreds of trips per route. Every kept trip gets all of its line's stop times in the generated files, so one is usually enough for a test.
          </p>
        </div>
      </div>

      <DialogFooter class="items-center gap-2 sm:justify-between">
        <span class="text-muted-foreground">{{ gtfsImport.selected.size }} of {{ routes.length }} routes picked</span>
        <div class="flex gap-2">
          <Button variant="outline" @click="gtfsImport.open = false">Cancel</Button>
          <Button :disabled="gtfsImport.selected.size === 0" @click="applyGtfsImport">
            {{ gtfsImport.target === 'new' ? 'Create test case' : `Replace ${targetName} model` }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
