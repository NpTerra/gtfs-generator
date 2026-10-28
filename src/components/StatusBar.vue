<script setup lang="ts">
// IntelliJ-style status bar: where you are (or, over the map, how to use it)
// on the left; cursor position, problems and language widgets on the right.
import { ChevronRightIcon, CircleXIcon, TriangleAlertIcon } from '@lucide/vue'
import { computed } from 'vue'
import { editableModel, errorCount, problems, selection, tab, tc } from '@/composables/useEditor'
import { panels, showPanel } from '@/composables/usePanels'
import { currentProject } from '@/composables/useProject'
import { cursorText } from '@/composables/useViewport'
import LanguageMenu from '@/components/LanguageMenu.vue'
import { t } from '@/lib/i18n'

const warningCount = computed(() => problems.value.length - errorCount.value)
const crumbs = computed(() => [
  currentProject.value?.name,
  tc.value.name + '.json',
  tab.value === 'expected' ? 'Expected model' : 'Arrange model',
  editableModel.value.stations.find(s => s.id === selection.value)?.name,
].filter(Boolean))
</script>

<template>
  <footer class="flex h-7 shrink-0 items-center justify-between gap-4 px-3 text-xs text-muted-foreground max-md:hidden">
    <p v-if="cursorText" class="min-w-0 truncate">{{ t('map.hint') }}</p>
    <nav v-else class="flex min-w-0 items-center gap-1 truncate" aria-label="Breadcrumb">
      <template v-for="(c, i) in crumbs" :key="i">
        <ChevronRightIcon v-if="i > 0" class="size-3 shrink-0" />
        <span class="truncate" :class="i === crumbs.length - 1 && 'text-foreground'">{{ c }}</span>
      </template>
    </nav>
    <div class="flex shrink-0 items-center gap-3">
      <span class="font-mono">{{ cursorText }}</span>
      <button
        type="button" class="flex items-center gap-2 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
        :aria-label="`${errorCount} errors, ${warningCount} warnings`" :aria-pressed="panels.problems"
        :title="panels.problems ? 'Hide problems' : 'Show problems'"
        @click="panels.problems ? (panels.problems = false) : showPanel('problems')"
      >
        <span class="flex items-center gap-1"><CircleXIcon class="size-3.5 text-destructive" />{{ errorCount }}</span>
        <span class="flex items-center gap-1"><TriangleAlertIcon class="size-3.5 text-warn" />{{ warningCount }}</span>
      </button>
      <LanguageMenu />
    </div>
  </footer>
</template>
