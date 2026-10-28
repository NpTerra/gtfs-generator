<script setup lang="ts">
// Status-bar storage widget (like IntelliJ's memory indicator): what this site
// stores, per project, and asking the browser to keep it when the disk runs low.
import { DatabaseIcon, ShieldCheckIcon } from '@lucide/vue'
import { useIntervalFn } from '@vueuse/core'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { projects } from '@/composables/useProject'
import { t } from '@/lib/i18n'
import * as storage from '@/lib/storage'

const usage = ref(0)
const quota = ref(0) // 0: unknown
const persisted = ref(true) // stays true without the Storage API: nothing to offer
const sizes = ref<{ name: string; size: number }[]>([])

const bytes = (n: number) => {
  const units = ['B', 'kB', 'MB', 'GB', 'TB']
  let i = 0
  for (; n >= 1000 && i < units.length - 1; i++) n /= 1000
  return `${i ? n.toFixed(1) : n} ${units[i]}`
}
const chars = (n: number) => `${(n / 1e6).toFixed(2)}M`

async function refresh() {
  sizes.value = projects.value.map(p => ({ name: p.name, size: storage.projectChars(p.id) }))
  const est = storage.usesIndexedDb() ? await navigator.storage?.estimate().catch(() => undefined) : undefined
  usage.value = est?.usage ?? storage.totalChars()
  quota.value = est ? est.quota ?? 0 : storage.usesIndexedDb() ? 0 : storage.LOCAL_STORAGE_LIMIT
  persisted.value = await navigator.storage?.persisted().catch(() => true) ?? true
}
useIntervalFn(refresh, 10_000, { immediateCallback: true })

const label = computed(() => storage.usesIndexedDb() ? bytes(usage.value) : `${chars(usage.value)} chars`)
const summary = computed(() => !storage.usesIndexedDb()
  ? `${chars(usage.value)} of ${chars(quota.value)} characters of localStorage used (IndexedDB is unavailable)`
  : quota.value ? `${bytes(usage.value)} of ${bytes(quota.value)} used by this site` : `${bytes(usage.value)} used by this site`)
const title = computed(() => [summary.value, ...sizes.value.map(p => `${p.name}: ${bytes(p.size)}`), t('hint.storage')].join('\n'))

async function persist() {
  const ok = await navigator.storage.persist().catch(() => false)
  persisted.value = ok
  if (ok) toast.success(t('toast.persisted'))
  else toast(t('toast.persistDenied'))
}
</script>

<template>
  <DropdownMenu @update:open="open => open && refresh()">
    <DropdownMenuTrigger
      class="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
      :title="title" :aria-label="`Storage: ${summary}`"
    >
      <DatabaseIcon class="size-3.5" />{{ label }}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" side="top" class="w-72">
      <DropdownMenuLabel class="text-foreground">{{ summary }}</DropdownMenuLabel>
      <div v-for="p in sizes" :key="p.name" class="flex justify-between gap-3 px-1.5 py-0.5 text-xs">
        <span class="truncate">{{ p.name }}</span><span class="shrink-0 font-mono text-muted-foreground">{{ bytes(p.size) }}</span>
      </div>
      <p class="px-1.5 py-1 text-xs text-muted-foreground">{{ t('hint.storage') }}</p>
      <template v-if="!persisted">
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="persist"><ShieldCheckIcon /> Keep my data when the disk runs low</DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
