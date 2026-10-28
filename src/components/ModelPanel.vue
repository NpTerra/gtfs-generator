<script setup lang="ts">
// Right panel: the GTFS model of the active tab (Arrange or Expected).
import { FileInputIcon, PlusIcon, XIcon } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import CalendarCard from '@/components/CalendarCard.vue'
import LineCard from '@/components/LineCard.vue'
import PanelHeader from '@/components/PanelHeader.vue'
import PagedList from '@/components/PagedList.vue'
import PanelSection from '@/components/PanelSection.vue'
import RefSelect from '@/components/RefSelect.vue'
import StationCard from '@/components/StationCard.vue'
import IdInput from '@/components/IdInput.vue'
import { Button } from '@/components/ui/button'
import {
  addCalendar, addLine, addStation, addTrip, calendarsFor, canEdit, editableModel, pickLineId, remove, selection, tab, tc,
} from '@/composables/useEditor'
import { openGtfsImport } from '@/composables/useGtfsImport'
import { freeSpot } from '@/composables/useViewport'
import { t } from '@/lib/i18n'
import type { Line } from '@/lib/model'

const model = editableModel
const isExpected = computed(() => tab.value === 'expected')
const calendars = computed(() => calendarsFor(model.value))
// a line is also found by the stations it stops at (imported lines are often just numbers)
const stationNames = computed(() => new Map(model.value.stations.map(st => [st.id, st.name])))
const lineText = (l: Line) => `${l.shortName} ${l.name} R${l.id} ${l.stops.map(st => stationNames.value.get(st.stationId)).join(' ')}`

const gtfsInput = ref<HTMLInputElement>()
function onGtfsPicked() {
  const file = gtfsInput.value?.files?.[0]
  if (file) openGtfsImport(file)
  gtfsInput.value!.value = ''
}

function addStationHere() {
  const p = freeSpot(model.value.stations)
  addStation(p.x, p.y)
}

// a line, calendar or trip just added stays on top of its list (it's appended, so on a long
// list it would land on the last page; a search could hide it too); a new station is selected
const added = ref<{ lines?: number; calendars?: number; trips?: number }>({})
watch(model, () => { added.value = {} })
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col bg-surface" aria-label="Model">
    <PanelHeader :title="isExpected ? 'Expected model (after the act)' : 'Arrange model'" panel="model" :highlight="isExpected">
      <template #actions>
        <!-- tool-window action, like IntelliJ's header icons: replace this model from a GTFS feed -->
        <Button
          variant="ghost" size="icon-sm" class="text-muted-foreground"
          :title="`Import routes from a GTFS zip into the ${isExpected ? 'Expected' : 'Arrange'} model`"
          aria-label="Import routes from a GTFS zip" @click="gtfsInput?.click()"
        >
          <FileInputIcon />
        </Button>
        <input ref="gtfsInput" type="file" accept=".zip" hidden @change="onGtfsPicked">
      </template>
    </PanelHeader>

    <p v-if="!canEdit" class="px-3 py-8 text-center text-sm text-muted-foreground">
      {{ t('map.exceptionMsg', { name: tc.expected.exception }) }}
    </p>

    <div v-else class="flex-1 overflow-y-auto pb-6">
      <p v-if="isExpected" class="m-3 mb-1 rounded-lg border border-l-4 border-l-signal bg-field px-3 py-2 text-[13px]">{{ t('pill.expected') }}</p>

      <PanelSection id="stations" title="Stations" :count="model.stations.length">
        <PagedList v-slot="{ item }" :items="model.stations" :text="s => `${s.name} S${s.id}`" :pinned="selection" noun="stations">
          <StationCard :station="item" :model="model" />
        </PagedList>
        <Button variant="outline" size="sm" class="self-start" @click="addStationHere"><PlusIcon /> Add station</Button>
      </PanelSection>

      <PanelSection id="lines" title="Lines" :count="model.lines.length">
        <PagedList v-slot="{ item }" :items="model.lines" :text="lineText" :pinned="added.lines ?? pickLineId" noun="lines">
          <LineCard :line="item" :model="model" />
        </PagedList>
        <Button variant="outline" size="sm" class="self-start" @click="added = { lines: addLine(model) }"><PlusIcon /> Add line</Button>
      </PanelSection>

      <PanelSection id="calendars" title="Calendars" :count="model.calendars.length">
        <p v-if="isExpected && model.calendars.length === 0" class="text-[13px] text-muted-foreground">{{ t('hint.calendarsInherit') }}</p>
        <PagedList v-slot="{ item }" :items="model.calendars" :text="c => `C${c.id} ${c.start} ${c.end}`" :pinned="added.calendars" noun="calendars">
          <CalendarCard :calendar="item" :model="model" />
        </PagedList>
        <Button variant="outline" size="sm" class="self-start" @click="added = { calendars: addCalendar(model) }"><PlusIcon /> Add calendar</Button>
      </PanelSection>

      <PanelSection id="trips" title="Trips" :count="model.trips.length">
        <p class="text-[13px] text-muted-foreground">{{ t('hint.trips') }}</p>
        <!-- id | line | calendar | delete; the two selects wrap under each other when narrow -->
        <PagedList v-slot="{ item: trip }" :items="model.trips" :text="tr => `T${tr.id} R${tr.line} C${tr.service} ${model.lines.find(l => l.id === tr.line)?.name ?? ''}`" :pinned="added.trips" noun="trips">
          <div class="flex flex-wrap items-center gap-1.5 rounded-xl border bg-card p-2 lazy-card">
            <IdInput :id="trip.id" prefix="T" label="Trip ID" :on-change-id="id => (trip.id = id, true)" />
            <RefSelect
              v-model="trip.line" :options="model.lines" :label="l => `${l.name} (R${l.id})`" prefix="R"
              class="min-w-[7rem] flex-1" title="Line" aria-label="Line"
            />
            <RefSelect
              v-model="trip.service" :options="calendars" :label="c => `C${c.id} (${c.start})`" prefix="C"
              class="min-w-[7rem] flex-1" title="Calendar (service)" aria-label="Calendar"
            />
            <Button variant="ghost" size="icon-sm" class="ml-auto text-muted-foreground hover:text-destructive" title="Delete trip" aria-label="Delete trip" @click="remove(model.trips, trip)">
              <XIcon />
            </Button>
          </div>
        </PagedList>
        <Button variant="outline" size="sm" class="self-start" :disabled="model.lines.length === 0" @click="added = { trips: addTrip(model) }"><PlusIcon /> Add trip</Button>
      </PanelSection>
    </div>
  </aside>
</template>
