<script setup lang="ts">
import { MonitorIcon, MoonIcon, SunIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { themeChoice, type ThemeChoice } from '@/composables/useTheme'

const OPTIONS = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'auto', label: 'Match system', icon: MonitorIcon },
] as const

const current = () => OPTIONS.find(o => o.value === themeChoice.value) ?? OPTIONS[2]
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" :title="`Color theme: ${current().label}`" :aria-label="`Color theme: ${current().label}`">
        <component :is="current().icon" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-44">
      <DropdownMenuRadioGroup :model-value="themeChoice" @update:model-value="v => themeChoice = v as ThemeChoice">
        <DropdownMenuRadioItem v-for="o in OPTIONS" :key="o.value" :value="o.value">
          <component :is="o.icon" /> {{ o.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
