<script setup lang="ts">
// IntelliJ-style Project tool window: the open project's test cases as
// <name>.json files. Click opens one; right-click or ⋯ for the file actions;
// F2 / Shift+F6 renames, Delete deletes. Dropping files here imports them.
import {
  CopyIcon, DownloadIcon, EllipsisIcon, EllipsisVerticalIcon, FileJsonIcon, FolderIcon, FolderInputIcon,
  FolderOpenIcon, HistoryIcon, PackageIcon, PencilIcon, PlusIcon, SaveIcon, Trash2Icon, UploadIcon,
} from '@lucide/vue'
import { computed, ref } from 'vue'
import PanelHeader from '@/components/PanelHeader.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { activeId } from '@/composables/useEditor'
import { exportAll, exportJson, generateAll, importFiles, pickAndImport } from '@/composables/useFileActions'
import {
  copyToProject, currentProject, deleteFile, duplicateFile, fileTestCase, files, newFile, openFile, projects, renameFile, restore, trash,
} from '@/composables/useProject'
import { fileWeight } from '@/lib/model'

const menuFor = ref<string | null>(null) // file whose action menu is open
const otherProjects = computed(() => projects.value.filter(p => p.id !== currentProject.value?.id))

function onKey(ev: KeyboardEvent, id: string) {
  if (ev.key === 'F2' || (ev.key === 'F6' && ev.shiftKey)) renameFile(id)
  else if (ev.key === 'Delete' || ev.key === 'Backspace') deleteFile(id)
  else return
  ev.preventDefault()
  ev.stopPropagation() // not the editor's shortcuts (Delete would also remove the selected station)
}

// the file icon's color says how heavy a test case is (traffic light)
const WEIGHT_COLOR = { light: 'text-ok', heavy: 'text-warn', huge: 'text-destructive' }
const sizeOf = (chars: number) => chars < 1000 ? `${chars} B` : chars < 1e6 ? `${(chars / 1000).toFixed(1)} kB` : `${(chars / 1e6).toFixed(1)} MB`
const fileTitle = (f: { name: string; errors: number; chars: number }) =>
  `${f.name}.json, ${sizeOf(f.chars)}${f.errors ? `: ${f.errors} error(s)` : ''}`

const timeOf = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function exportFile(id: string) {
  const file = fileTestCase(id)
  if (file) exportJson(file)
}

// enter/leave also fire for every child crossed, so count them
const dragDepth = ref(0)
const dropping = computed(() => dragDepth.value > 0)
function onDrop(ev: DragEvent) {
  dragDepth.value = 0
  if (ev.dataTransfer?.files.length) importFiles([...ev.dataTransfer.files])
}
</script>

<template>
  <aside
    class="flex h-full min-h-0 flex-col bg-surface max-md:h-auto" aria-label="Project"
    :class="dropping && 'ring-2 ring-ring ring-inset'"
    @dragenter.prevent="dragDepth++" @dragover.prevent @dragleave="dragDepth = Math.max(0, dragDepth - 1)" @drop.prevent="onDrop"
  >
    <PanelHeader title="Project" panel="project">
      <template #actions>
        <Button variant="ghost" size="icon-sm" class="text-muted-foreground" title="New test case" aria-label="New test case" @click="newFile">
          <PlusIcon />
        </Button>
        <Button
          variant="ghost" size="icon-sm" class="text-muted-foreground" aria-label="Import"
          title="Import test cases: .json files, submission zips, or zips of several (you can also drop files here)" @click="pickAndImport"
        >
          <UploadIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon-sm" class="text-muted-foreground" title="More project actions" aria-label="More project actions">
              <EllipsisVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-64">
            <DropdownMenuItem @select="generateAll"><DownloadIcon /> Generate all</DropdownMenuItem>
            <DropdownMenuItem @select="exportAll"><PackageIcon /> Export all as JSON</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger :disabled="!trash.length"><HistoryIcon /> Recently deleted</DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="w-72">
                <DropdownMenuItem v-for="e in trash" :key="e.at + e.name" :title="`Restore ${e.kind === 'project' ? 'the project' : e.name + '.json'}`" @select="restore(e)">
                  <component :is="e.kind === 'project' ? FolderIcon : FileJsonIcon" />
                  <span class="truncate">{{ e.kind === 'project' ? e.name : e.name + '.json' }}</span>
                  <span class="ml-auto shrink-0 text-xs text-muted-foreground">
                    {{ e.kind === 'file' ? e.project.name + ' · ' : '' }}{{ timeOf(e.at) }}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </PanelHeader>

    <div class="flex-1 overflow-y-auto px-1.5 pb-3 text-sm">
      <div id="project-root" class="flex h-7 items-center gap-1.5 px-1.5 font-semibold">
        <FolderOpenIcon class="size-4 shrink-0 text-muted-foreground" />
        <span class="truncate">{{ currentProject?.name }}</span>
        <span class="font-normal text-muted-foreground">{{ files.length }}</span>
      </div>
      <ul aria-labelledby="project-root">
      <li
        v-for="f in files" :key="f.id"
        class="group flex h-7 items-center rounded-md pr-0.5"
        :class="f.id === activeId ? 'bg-selection' : 'hover:bg-muted'"
        @contextmenu.prevent="menuFor = f.id"
      >
        <button
          type="button" class="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md pl-6 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :title="fileTitle(f)" :aria-current="f.id === activeId || undefined"
          @click="openFile(f.id)" @keydown="onKey($event, f.id)"
        >
          <FileJsonIcon class="size-4 shrink-0" :class="WEIGHT_COLOR[fileWeight(f.chars)]" />
          <span class="truncate" :class="f.errors > 0 && 'text-destructive underline decoration-destructive decoration-wavy underline-offset-3'">
            {{ f.name }}<span class="text-muted-foreground">.json</span>
          </span>
        </button>
        <DropdownMenu :open="menuFor === f.id" @update:open="open => (menuFor = open ? f.id : null)">
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost" size="icon-sm" class="size-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
              :title="`Actions for ${f.name}.json`" :aria-label="`Actions for ${f.name}.json`"
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-56">
            <DropdownMenuItem :disabled="f.unreadable" @select="renameFile(f.id)"><PencilIcon /> Rename… <DropdownMenuShortcut>⇧F6</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem :disabled="f.unreadable" @select="duplicateFile(f.id)"><CopyIcon /> Duplicate</DropdownMenuItem>
            <DropdownMenuSub v-if="otherProjects.length">
              <DropdownMenuSubTrigger :disabled="f.unreadable"><FolderInputIcon /> Copy to project</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem v-for="p in otherProjects" :key="p.id" @select="copyToProject(f.id, p)">{{ p.name }}</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem :disabled="f.unreadable" @select="exportFile(f.id)"><SaveIcon /> Export JSON</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" @select="deleteFile(f.id)"><Trash2Icon /> Delete <DropdownMenuShortcut>Del</DropdownMenuShortcut></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
      </ul>
    </div>
  </aside>
</template>
