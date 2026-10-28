<script setup lang="ts">
import { XIcon } from '@lucide/vue'
import { computed } from 'vue'
import IdInput from '@/components/IdInput.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { changeCalendarId, remove } from '@/composables/useEditor'
import type { Calendar, Model } from '@/lib/model'

const props = defineProps<{ calendar: Calendar; model: Model }>()
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

// availability is [1,0,1,...]; the toggle group wants the list of selected days
const days = computed({
  get: () => DAYS.filter((_, i) => props.calendar.availability[i]),
  set: (selected: string[]) => { props.calendar.availability = DAYS.map(d => selected.includes(d) ? 1 : 0) },
})
</script>

<template>
  <div class="@container flex flex-col gap-1.5 rounded-xl border bg-card p-2 lazy-card">
    <div class="flex items-center gap-1.5">
      <IdInput :id="calendar.id" prefix="C" label="Calendar ID" :on-change-id="id => changeCalendarId(model, calendar, id)" />
      <div class="grid min-w-0 flex-1 grid-cols-2 gap-1.5 @max-[19rem]:grid-cols-1">
        <Input v-model="calendar.start" type="date" class="min-w-0" title="Start date" aria-label="Start date" />
        <Input v-model="calendar.end" type="date" class="min-w-0" title="End date" aria-label="End date" />
      </div>
      <Button variant="ghost" size="icon-sm" class="text-muted-foreground hover:text-destructive" title="Delete calendar" aria-label="Delete calendar" @click="remove(model.calendars, calendar)">
        <XIcon />
      </Button>
    </div>
    <ToggleGroup v-model="days" type="multiple" variant="outline" size="sm" class="w-full" aria-label="Days of service">
      <ToggleGroupItem v-for="d in DAYS" :key="d" :value="d" class="min-w-0 flex-1 px-0 text-xs font-bold">{{ d }}</ToggleGroupItem>
    </ToggleGroup>
  </div>
</template>
