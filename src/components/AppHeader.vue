<script setup lang="ts">
// IntelliJ-style main toolbar: the project widget (switch, create, rename,
// delete projects) on the left, the main action and window settings on the right.
import {
  CheckIcon, ChevronDownIcon, CircleXIcon, DownloadIcon, FolderPlusIcon, PencilIcon, RotateCcwIcon, Trash2Icon, TriangleAlertIcon,
} from '@lucide/vue'
import { computed } from 'vue'
import ThemeMenu from '@/components/ThemeMenu.vue'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import LanguageMenu from '@/components/LanguageMenu.vue'
import { activeProject, errorCount, output, problems, type Output } from '@/composables/useEditor'
import { generate } from '@/composables/useFileActions'
import { showPanel } from '@/composables/usePanels'
import {
  currentProject, deleteProject, EXAMPLES, newProject, openProject, projects, renameProject,
} from '@/composables/useProject'
import { projectColors } from '@/lib/utils'

const warningCount = computed(() => problems.value.length - errorCount.value)

// IntelliJ's project icon: the name's initials on a color picked from the name
function initials(name: string) {
  const words = name.trim().split(/[\s_-]+/).filter(Boolean)
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase()
}
function badgeStyle(name: string) {
  const [from, to] = projectColors(name)
  return { background: `linear-gradient(135deg, ${from}, ${to})` }
}
</script>

<template>
  <header class="flex h-10 shrink-0 items-center justify-between gap-2 px-2">
    <div class="flex min-w-0 items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" class="min-w-0 gap-2 px-1.5 font-semibold" title="Projects: switch, new, rename, delete" :aria-label="`Project: ${currentProject?.name ?? ''}`">
            <span class="grid size-5 shrink-0 place-items-center rounded-[5px] text-[10px] font-bold text-white" aria-hidden="true" :style="badgeStyle(currentProject?.name ?? '')">
              {{ initials(currentProject?.name ?? '') }}
            </span>
            <span class="truncate">{{ currentProject?.name }}</span>
            <ChevronDownIcon class="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-64">
          <DropdownMenuLabel class="text-xs font-semibold text-muted-foreground">Projects</DropdownMenuLabel>
          <DropdownMenuItem v-for="p in projects" :key="p.id" @select="openProject(p.id)">
            <span class="grid size-5 shrink-0 place-items-center rounded-[5px] text-[10px] font-bold text-white" aria-hidden="true" :style="badgeStyle(p.name)">{{ initials(p.name) }}</span>
            <span class="truncate">{{ p.name }}</span>
            <template v-if="p.id === activeProject"><CheckIcon class="ml-auto" /><span class="sr-only">(open)</span></template>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem @select="newProject"><FolderPlusIcon /> New project…</DropdownMenuItem>
          <DropdownMenuItem @select="renameProject"><PencilIcon /> Rename project…</DropdownMenuItem>
          <DropdownMenuItem v-if="activeProject === EXAMPLES" @select="deleteProject"><RotateCcwIcon /> Reset Example Models…</DropdownMenuItem>
          <DropdownMenuItem v-else variant="destructive" @select="deleteProject"><Trash2Icon /> Delete project…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

<div class="flex items-center gap-1.5">
      <!-- what Generate writes; the panels show only what that format has a place for -->
      <ToggleGroup
        type="single" variant="outline" size="sm" :model-value="output" aria-label="Map format"
        @update:model-value="v => v && (output = v as Output)"
      >
        <ToggleGroupItem value="gtfs" class="px-2 text-xs font-bold" title="GTFS feeds: arrange.zip, assert.zip (stop times, trips, calendars, agency)">GTFS</ToggleGroupItem>
        <ToggleGroupItem value="tmx" class="px-2 text-xs font-bold" title="Maps for the course's Transport Map Editor: arrange.tmx, assert.tmx (stops, lines and their order only)">TMX</ToggleGroupItem>
        <ToggleGroupItem value="plain" class="px-2 text-xs font-bold" title="What's inside the .tmx maps, unencrypted, to look at: arrange-tmx/ and assert-tmx/ folders (CSVs, manifest, history). The course takes .tmx, not these">Plain</ToggleGroupItem>
      </ToggleGroup>
      <Button
        size="sm"
        :title="`Download the submission files (act.txt, comment.txt, ${{ gtfs: 'arrange.zip, assert.zip', tmx: 'arrange.tmx, assert.tmx', plain: 'arrange-tmx/, assert-tmx/' }[output]} or assert.txt)`"
        @click="generate()"
      >
        <DownloadIcon /> Generate
      </Button>
      <!-- phones have no status bar, so the language widget moves up here -->
      <div class="md:hidden"><LanguageMenu compact /></div>
      <ThemeMenu />
      <!-- phones have no status bar, so its problems widget moves up here -->
      <Button
        v-if="errorCount || warningCount" variant="ghost" size="sm" class="md:hidden"
        :aria-label="`${errorCount} errors, ${warningCount} warnings`" @click="showPanel('problems')"
      >
        <CircleXIcon v-if="errorCount" class="text-destructive" /><TriangleAlertIcon v-else class="text-warn" />
        {{ errorCount || warningCount }}
      </Button>
    </div>
  </header>
</template>
