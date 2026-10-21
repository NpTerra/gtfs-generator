<script setup lang="ts">
import { CircleCheckIcon, CircleXIcon, TriangleAlertIcon } from '@lucide/vue'
import PanelHeader from '@/components/PanelHeader.vue'
import { problems } from '@/composables/useEditor'
import { t } from '@/lib/i18n'
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-surface" aria-label="Problems">
    <PanelHeader title="Problems" panel="problems">
      Problems <span class="font-normal text-muted-foreground">{{ problems.length }}</span>
    </PanelHeader>
    <div class="flex-1 overflow-y-auto px-3 py-2 text-sm">
      <p v-if="problems.length === 0" class="flex items-center gap-2">
        <CircleCheckIcon class="size-4 text-ok" /> {{ t('problems.none') }}
      </p>
      <p v-for="(p, i) in problems" :key="i" class="flex gap-2 py-1 leading-snug">
        <CircleXIcon v-if="p.level === 'error'" class="mt-0.5 size-4 shrink-0 text-destructive" />
        <TriangleAlertIcon v-else class="mt-0.5 size-4 shrink-0 text-warn" />
        {{ p.text }}
      </p>
    </div>
  </section>
</template>
