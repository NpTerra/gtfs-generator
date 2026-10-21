<script setup lang="ts">
// Right panel: the GTFS model of the active tab (Arrange or Expected).
import { PlusIcon, XIcon } from '@lucide/vue'
import { computed } from 'vue'
import CalendarCard from '@/components/CalendarCard.vue'
import LineCard from '@/components/LineCard.vue'
import PanelHeader from '@/components/PanelHeader.vue'
import PanelSection from '@/components/PanelSection.vue'
import StationCard from '@/components/StationCard.vue'
import IdInput from '@/components/IdInput.vue'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import {
  addCalendar, addLine, addStation, addTrip, calendarsFor, canEdit, editableModel, remove, tab, tc,
} from '@/composables/useEditor'
import { freeSpot } from '@/composables/useViewport'
import { t } from '@/lib/i18n'

const model = editableModel
const isExpected = computed(() => tab.value === 'expected')
const calendars = computed(() => calendarsFor(model.value))

function addStationHere() {
  const p = freeSpot(model.value.stations)
  addStation(p.x, p.y)
}
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col bg-surface" aria-label="Model">
    <PanelHeader :title="isExpected ? 'Expected model (after the act)' : 'Arrange model'" panel="model" :highlight="isExpected" />

    <p v-if="!canEdit" class="px-3 py-8 text-center text-sm text-muted-foreground">
      {{ t('map.exceptionMsg', { name: tc.expected.exception }) }}
    </p>

    <div v-else class="flex-1 overflow-y-auto pb-6">
      <p v-if="isExpected" class="m-3 mb-1 rounded-lg border border-l-4 border-l-signal bg-field px-3 py-2 text-[13px]">{{ t('pill.expected') }}</p>

      <PanelSection id="stations" title="Stations" :count="model.stations.length">
        <StationCard v-for="s in model.stations" :key="s.id" :station="s" :model="model" />
        <Button variant="outline" size="sm" class="self-start" @click="addStationHere"><PlusIcon /> Add station</Button>
      </PanelSection>

      <PanelSection id="lines" title="Lines" :count="model.lines.length">
        <LineCard v-for="l in model.lines" :key="l.id" :line="l" :model="model" />
        <Button variant="outline" size="sm" class="self-start" @click="addLine(model)"><PlusIcon /> Add line</Button>
      </PanelSection>

      <PanelSection id="calendars" title="Calendars" :count="model.calendars.length">
        <p v-if="isExpected && model.calendars.length === 0" class="text-[13px] text-muted-foreground">{{ t('hint.calendarsInherit') }}</p>
        <CalendarCard v-for="c in model.calendars" :key="c.id" :calendar="c" :model="model" />
        <Button variant="outline" size="sm" class="self-start" @click="addCalendar(model)"><PlusIcon /> Add calendar</Button>
      </PanelSection>

      <PanelSection id="trips" title="Trips" :count="model.trips.length">
        <p class="text-[13px] text-muted-foreground">{{ t('hint.trips') }}</p>
        <!-- id | line | calendar | delete; the two selects wrap under each other when narrow -->
        <div v-for="trip in model.trips" :key="trip.id" class="flex flex-wrap items-center gap-1.5 rounded-xl border bg-card p-2">
          <IdInput :id="trip.id" prefix="T" label="Trip ID" :on-change-id="id => (trip.id = id, true)" />
          <NativeSelect v-model.number="trip.line" class="min-w-[7rem] flex-1" title="Line" aria-label="Line">
            <option v-for="l in model.lines" :key="l.id" :value="l.id">{{ l.name }} (R{{ l.id }})</option>
            <option v-if="!model.lines.some(l => l.id === trip.line)" :value="trip.line">missing R{{ trip.line }}</option>
          </NativeSelect>
          <NativeSelect v-model.number="trip.service" class="min-w-[7rem] flex-1" title="Calendar (service)" aria-label="Calendar">
            <option v-for="c in calendars" :key="c.id" :value="c.id">C{{ c.id }} ({{ c.start }})</option>
            <option v-if="!calendars.some(c => c.id === trip.service)" :value="trip.service">missing C{{ trip.service }}</option>
          </NativeSelect>
          <Button variant="ghost" size="icon-sm" class="ml-auto text-muted-foreground hover:text-destructive" title="Delete trip" aria-label="Delete trip" @click="remove(model.trips, trip)">
            <XIcon />
          </Button>
        </div>
        <Button variant="outline" size="sm" class="self-start" :disabled="model.lines.length === 0" @click="addTrip(model)"><PlusIcon /> Add trip</Button>
      </PanelSection>
    </div>
  </aside>
</template>
