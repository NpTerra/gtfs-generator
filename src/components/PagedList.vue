<script setup lang="ts" generic="T extends { id: number }">
// A Model panel list that stays fast with an imported city: a search field once
// it gets long, and one page of PAGE matches at a time, so the panel never holds
// more than that. The `pinned` items (e.g. the stations selected on the map) are
// always in the list, on top.
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'

const PAGE = 50
const props = defineProps<{ items: T[]; text: (item: T) => string; pinned?: readonly number[]; noun: string }>()

const query = ref('')
const page = ref(0)
watch(query, () => { page.value = 0 })

const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? props.items.filter(i => props.text(i).toLowerCase().includes(q)) : props.items
})
const pages = computed(() => Math.max(1, Math.ceil(matches.value.length / PAGE)))
const first = computed(() => Math.min(page.value, pages.value - 1) * PAGE) // the list can shrink under the page
const shown = computed(() => {
  const slice = matches.value.slice(first.value, first.value + PAGE)
  const pinned = new Set(props.pinned)
  if (!pinned.size) return slice
  for (const i of slice) pinned.delete(i.id)
  return [...props.items.filter(i => pinned.has(i.id)), ...slice]
})
const go = (delta: number) => { page.value = Math.max(0, Math.min(pages.value - 1, first.value / PAGE + delta)) }
</script>

<template>
  <!-- also while a search is on, or a list that shrank below 11 stays filtered with no way to clear it -->
  <div v-if="items.length > 10 || query" class="flex items-center gap-1.5">
    <label class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-field px-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <SearchIcon class="size-4 shrink-0 text-muted-foreground" />
      <input v-model="query" type="search" :placeholder="`Search ${items.length} ${noun}…`" class="h-8 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground">
    </label>
    <template v-if="pages > 1">
      <Button variant="ghost" size="icon-sm" :disabled="first === 0" title="Previous page" aria-label="Previous page" @click="go(-1)"><ChevronLeftIcon /></Button>
      <span class="text-xs whitespace-nowrap text-muted-foreground tabular-nums" aria-live="polite">{{ first + 1 }}–{{ Math.min(first + PAGE, matches.length) }} of {{ matches.length }}</span>
      <Button variant="ghost" size="icon-sm" :disabled="first + PAGE >= matches.length" title="Next page" aria-label="Next page" @click="go(1)"><ChevronRightIcon /></Button>
    </template>
  </div>
  <template v-for="item in shown" :key="item.id">
    <slot :item="item" />
  </template>
  <p v-if="query && matches.length === 0" class="text-[13px] text-muted-foreground">No {{ noun }} match.</p>
</template>
