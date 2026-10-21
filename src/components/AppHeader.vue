<script setup lang="ts">
// IntelliJ-style main toolbar: the project widget (test name + file actions)
// on the left, the main action and window settings on the right.
import { ChevronDownIcon, CircleXIcon, DownloadIcon, PlusIcon, SaveIcon, TriangleAlertIcon, UploadIcon } from '@lucide/vue'
import { computed, ref } from 'vue'
import ThemeMenu from '@/components/ThemeMenu.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import LanguageMenu from '@/components/LanguageMenu.vue'
import { errorCount, problems, tc } from '@/composables/useEditor'
import { examples, exportJson, generate, importFile, loadExample, newTestCase } from '@/composables/useFileActions'
import { showPanel } from '@/composables/usePanels'

const fileInput = ref<HTMLInputElement>()
const warningCount = computed(() => problems.value.length - errorCount.value)

function onFilePicked() {
  const file = fileInput.value?.files?.[0]
  if (file) importFile(file)
  fileInput.value!.value = ''
}
</script>

<template>
  <header class="flex h-10 shrink-0 items-center justify-between gap-2 px-2">
    <div class="flex min-w-0 items-center gap-1">
      <!-- project widget, as in IntelliJ: the test name opens the file actions -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" class="min-w-0 gap-2 px-1.5 font-semibold" title="Test case: new, import, export, examples" aria-label="Test case menu">
            <span class="grid size-5 shrink-0 place-items-center rounded-[5px] bg-gradient-to-br from-[#3871e1] to-[#9f6cf5] text-[10px] font-bold text-white">GT</span>
            <span class="truncate">{{ tc.name || 'Untitled test' }}</span>
            <ChevronDownIcon class="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-60">
          <DropdownMenuItem @select="newTestCase"><PlusIcon /> New test case</DropdownMenuItem>
          <DropdownMenuItem @select="fileInput?.click()"><UploadIcon /> Import…</DropdownMenuItem>
          <DropdownMenuItem @select="exportJson"><SaveIcon /> Export JSON</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel class="text-xs font-semibold text-muted-foreground">Load example</DropdownMenuLabel>
          <DropdownMenuItem v-for="ex in examples" :key="ex.file" @select="loadExample(ex)">{{ ex.name }}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref="fileInput" type="file" accept=".json,.zip" hidden @change="onFilePicked">
    </div>

    <div class="flex items-center gap-1.5">
      <Button
        size="sm" title="Download the submission files (act.txt, comment.txt, arrange.zip, assert.*)"
        @click="generate"
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
