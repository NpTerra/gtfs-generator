<script setup lang="ts">
// A collapsible section ("Stations (3)") inside a panel. Open/closed state is
// remembered per section id (composables/useSections.ts) while the page is open.
import { ChevronRightIcon } from '@lucide/vue'
import { computed } from 'vue'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { openSections } from '@/composables/useSections'

const props = defineProps<{ id: string; title: string; count?: number }>()

const open = computed({
  get: () => openSections.has(props.id),
  set: (value) => { if (value) openSections.add(props.id); else openSections.delete(props.id) },
})
</script>

<template>
  <Collapsible v-model:open="open" class="border-b">
    <CollapsibleTrigger class="flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-sm font-semibold hover:bg-surface-strong">
      <ChevronRightIcon class="size-4 shrink-0 text-muted-foreground transition-transform" :class="open && 'rotate-90'" />
      {{ title }}
      <span v-if="count !== undefined" class="font-normal text-muted-foreground">{{ count }}</span>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="flex flex-col gap-3 px-3 pt-1 pb-4">
        <slot />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
