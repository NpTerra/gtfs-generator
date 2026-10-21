<script setup lang="ts">
// Title bar of a layout panel, with a hide button (not shown on phones).
// `highlight` marks the panel as editing the Expected model.
import { MinusIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { panels, type PanelName } from '@/composables/usePanels'

defineProps<{ title: string; panel: PanelName; highlight?: boolean }>()
</script>

<template>
  <div
    class="flex h-9 shrink-0 items-center justify-between gap-2 pr-1 pl-3 font-semibold"
    :class="highlight && 'text-link'"
  >
    <span class="truncate"><slot>{{ title }}</slot></span>
    <Button
      variant="ghost" size="icon-sm" class="text-muted-foreground max-md:hidden"
      :title="`Hide the ${title} panel`" :aria-label="`Hide the ${title} panel`"
      @click="panels[panel] = false"
    >
      <MinusIcon />
    </Button>
  </div>
</template>
