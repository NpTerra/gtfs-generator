<script setup lang="ts">
import { CircleCheckIcon, CircleXIcon, TriangleAlertIcon } from '@lucide/vue'
import { computed } from 'vue'
import PagedList from '@/components/PagedList.vue'
import PanelHeader from '@/components/PanelHeader.vue'
import { problems } from '@/composables/useEditor'
import { t } from '@/lib/i18n'

// errors first; an imported city can have a thousand warnings, so they're searched and paged
const items = computed(() => [...problems.value.filter(p => p.level === 'error'), ...problems.value.filter(p => p.level !== 'error')]
  .map((p, id) => ({ ...p, id })))
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-surface" aria-label="Problems">
    <PanelHeader title="Problems" panel="problems">
      Problems <span class="font-normal text-muted-foreground">{{ problems.length }}</span>
    </PanelHeader>
    <div class="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2 text-sm">
      <p v-if="problems.length === 0" class="flex items-center gap-2">
        <CircleCheckIcon class="size-4 text-ok" /> {{ t('problems.none') }}
      </p>
      <PagedList v-slot="{ item: p }" :items="items" :text="p => `${p.level} ${p.text}`" noun="problems">
        <p class="flex gap-2 py-1 leading-snug">
          <CircleXIcon v-if="p.level === 'error'" class="mt-0.5 size-4 shrink-0 text-destructive" />
          <TriangleAlertIcon v-else class="mt-0.5 size-4 shrink-0 text-warn" />
          {{ p.text }}
        </p>
      </PagedList>
    </div>
  </section>
</template>
