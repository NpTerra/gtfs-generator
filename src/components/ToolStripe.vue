<script setup lang="ts">
// IntelliJ-style tool-window stripe on the window edge. It only appears while
// one of its tool windows is hidden, as the way to bring it back; with every
// panel open it takes no space at all.
import { computed, type Component } from 'vue'
import { panels, type PanelName } from '@/composables/usePanels'

const props = defineProps<{ items: { panel: PanelName; label: string; icon: Component }[] }>()
const hidden = computed(() => props.items.filter(t => !panels[t.panel]))
</script>

<template>
  <nav v-if="hidden.length" class="flex w-8 shrink-0 flex-col items-center gap-1 max-md:hidden" aria-label="Hidden tool windows">
    <button
      v-for="t in hidden" :key="t.panel" type="button"
      class="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      :title="`Show ${t.label}`" :aria-label="`Show ${t.label}`"
      @click="panels[t.panel] = true"
    >
      <component :is="t.icon" class="size-4.5" />
    </button>
  </nav>
</template>
