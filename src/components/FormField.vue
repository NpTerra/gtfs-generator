<script setup lang="ts">
// Label + control (default slot) + optional hint below it.
import { TriangleAlertIcon } from '@lucide/vue'
import { Label } from '@/components/ui/label'

defineProps<{ label?: string; hint?: string; warn?: boolean }>()
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1.5">
    <Label v-if="label" class="text-[13px] font-semibold">{{ label }}</Label>
    <slot />
    <p v-if="hint && warn" class="flex gap-1.5 text-[13px] leading-snug font-semibold">
      <TriangleAlertIcon class="mt-px size-4 shrink-0 text-warn" /> {{ hint }}
    </p>
    <p v-else-if="hint" class="text-[13px] leading-snug text-muted-foreground">{{ hint }}</p>
  </div>
</template>
