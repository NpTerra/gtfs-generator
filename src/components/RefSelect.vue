<script setup lang="ts" generic="T extends { id: number }">
// Picks one of `options` by id, e.g. a stop's station or a trip's line. Unlike a
// native select, the list only exists while it is open, so a line with 500 stops
// over 1000 stations doesn't put half a million <option>s on the page. Closed, it is
// a plain button: thousands of comboboxes with their watchers took tens of seconds.
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from '@lucide/vue'
import {
  ComboboxAnchor, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxPortal,
  ComboboxRoot, ComboboxTrigger, ComboboxViewport,
} from 'reka-ui'
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ options: T[]; label: (o: T) => string; prefix: string; size?: 'sm'; class?: string }>()
const model = defineModel<number>({ required: true })

const SHOWN = 100
const query = ref('')
const open = ref(false)
const button = useTemplateRef<HTMLButtonElement>('button')
function setOpen(on: boolean) {
  open.value = on
  query.value = ''
  // the combobox's trigger is gone; give focus back unless it went somewhere else
  if (!on) nextTick(() => document.activeElement === document.body && button.value?.focus())
}
const triggerClass = computed(() => cn(
  'relative flex w-full min-w-0 items-center rounded-lg border border-input bg-field pr-8 pl-2.5 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
  props.size === 'sm' ? 'h-7' : 'h-8'))
const current = computed(() => props.options.find(o => o.id === model.value))
const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? props.options.filter(o => props.label(o).toLowerCase().includes(q)) : props.options
})

const item = 'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none ' +
  'data-highlighted:bg-accent data-highlighted:text-accent-foreground'
</script>

<template>
  <!-- closed and open alike: a wrapper with the layout classes around the button, so opening never resizes it -->
  <div v-if="!open" :class="props.class">
    <button ref="button" type="button" v-bind="$attrs" aria-haspopup="listbox" :class="triggerClass" @click="setOpen(true)">
      <span v-if="current" class="truncate">{{ label(current) }}</span>
      <span v-else class="truncate text-destructive">missing {{ prefix }}{{ model }}</span>
      <ChevronsUpDownIcon class="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </button>
  </div>
  <ComboboxRoot v-else :class="props.class" v-model="model" :open="true" ignore-filter :reset-search-term-on-blur="false" @update:open="setOpen">
    <ComboboxAnchor as-child>
      <ComboboxTrigger tabindex="0" v-bind="$attrs" :class="triggerClass">
        <span v-if="current" class="truncate">{{ label(current) }}</span>
        <span v-else class="truncate text-destructive">missing {{ prefix }}{{ model }}</span>
        <ChevronsUpDownIcon class="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        position="popper" :side-offset="4"
        class="z-50 w-(--reka-combobox-trigger-width) min-w-56 overflow-hidden rounded-lg bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      >
        <div class="mb-1 flex items-center gap-2 rounded-md bg-muted px-2.5">
          <SearchIcon class="size-4 shrink-0 text-muted-foreground" />
          <ComboboxInput
            v-model="query" auto-focus :display-value="() => ''" placeholder="Search…"
            class="h-8 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ComboboxViewport class="max-h-64 overflow-y-auto">
          <ComboboxItem v-for="o in matches.slice(0, SHOWN)" :key="o.id" :value="o.id" :class="item">
            <CheckIcon class="size-4 shrink-0" :class="{ invisible: o.id !== model }" />
            <span class="truncate">{{ label(o) }}</span>
          </ComboboxItem>
          <p v-if="matches.length > SHOWN" class="px-2 py-1.5 text-xs text-muted-foreground">
            {{ matches.length - SHOWN }} more, type to narrow down
          </p>
          <p v-else-if="matches.length === 0" class="px-2 py-1.5 text-sm text-muted-foreground">No match</p>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
