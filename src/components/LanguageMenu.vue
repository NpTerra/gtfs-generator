<script setup lang="ts">
// Language of hints and messages. Shown as a status-bar widget (like IntelliJ's
// encoding/line-separator widgets), or as a compact toolbar button on phones.
import { ChevronDownIcon } from '@lucide/vue'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { lang, setLang, type Lang } from '@/lib/i18n'

defineProps<{ compact?: boolean }>()
const LANGS = { en: 'English', hu: 'Magyar' } as const
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger
      class="flex items-center gap-1 rounded hover:bg-muted hover:text-foreground"
      :class="compact ? 'h-7 px-2 text-xs font-semibold' : 'px-1.5 py-0.5'"
      title="Language of hints and messages" :aria-label="`Language: ${LANGS[lang]}`"
    >
      {{ compact ? lang.toUpperCase() : LANGS[lang] }} <ChevronDownIcon class="size-3" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" :side="compact ? 'bottom' : 'top'" class="w-36">
      <DropdownMenuRadioGroup :model-value="lang" @update:model-value="v => setLang(v as Lang)">
        <DropdownMenuRadioItem v-for="(label, code) in LANGS" :key="code" :value="code">{{ label }}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
