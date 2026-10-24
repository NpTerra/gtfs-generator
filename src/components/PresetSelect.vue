<script setup lang="ts">
// A select with a search box (shadcn combobox look) over the known values,
// with "Custom…" on top for anything else (e.g. a method or exception this
// editor doesn't know yet). Picking Custom takes the search text as the value
// and shows a text input for it, unless `noInput` (the act has its textarea;
// the parent gets a `custom` event to focus it).
import { CheckIcon, ChevronsUpDownIcon, PencilIcon, SearchIcon } from '@lucide/vue'
import {
  ComboboxAnchor, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxPortal,
  ComboboxRoot, ComboboxTrigger, ComboboxViewport,
} from 'reka-ui'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { Input } from '@/components/ui/input'

const props = defineProps<{ options: string[]; title?: string; noInput?: boolean }>()
const model = defineModel<string>({ required: true })
const emit = defineEmits<{ custom: [] }>()

const CUSTOM = '\0custom'
const query = ref('')
const typed = computed(() => query.value.trim())
const shown = computed(() => props.options.filter(o => o.toLowerCase().includes(typed.value.toLowerCase())))
const isCustom = computed(() => !props.options.includes(model.value))

const input = useTemplateRef<{ $el: HTMLInputElement }>('input')
const selected = computed({
  get: () => isCustom.value ? CUSTOM : model.value,
  set: (v: string) => {
    if (v !== CUSTOM) return void (model.value = v)
    // re-picking Custom with nothing typed keeps the custom value
    if (typed.value || !isCustom.value) model.value = typed.value
    emit('custom')
    nextTick(() => input.value?.$el.focus())
  },
})

// Custom stays on top, but Enter should pick the first match, not the search text
const root = useTemplateRef<{ highlightItem?: (v: string) => void }>('root')
watch(typed, () => setTimeout(() => {
  if (typed.value && shown.value.length) root.value?.highlightItem?.(shown.value[0])
}))

const item = 'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none ' +
  'data-highlighted:bg-accent data-highlighted:text-accent-foreground'
</script>

<template>
  <ComboboxRoot ref="root" v-model="selected" ignore-filter :reset-search-term-on-blur="false" @update:open="query = ''">
    <ComboboxAnchor as-child>
      <ComboboxTrigger
        :title="title"
        class="relative flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-field py-1 pr-8 pl-2.5 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span class="truncate" :class="{ 'font-mono': !isCustom }">{{ isCustom ? 'Custom…' : model }}</span>
        <ChevronsUpDownIcon class="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxPortal>
      <ComboboxContent
        position="popper" :side-offset="4"
        class="z-50 w-(--reka-combobox-trigger-width) min-w-48 overflow-hidden rounded-lg bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      >
        <div class="mb-1 flex items-center gap-2 rounded-md bg-muted px-2.5">
          <SearchIcon class="size-4 shrink-0 text-muted-foreground" />
          <ComboboxInput
            v-model="query" auto-focus :display-value="() => ''"
            placeholder="Search or type a name…"
            class="h-8 w-full min-w-0 bg-transparent font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted-foreground"
          />
        </div>
        <ComboboxViewport class="max-h-64 overflow-y-auto">
          <ComboboxItem :value="CUSTOM" :class="item">
            <CheckIcon v-if="isCustom" class="size-4 shrink-0" />
            <PencilIcon v-else class="size-4 shrink-0 text-muted-foreground" />
            <span class="truncate">
              <template v-if="typed && !options.includes(typed)">Custom: <span class="font-mono">{{ typed }}</span></template>
              <template v-else>Custom…</template>
            </span>
          </ComboboxItem>
          <ComboboxItem v-for="o in shown" :key="o" :value="o" :class="item">
            <CheckIcon class="size-4 shrink-0" :class="{ invisible: o !== model }" />
            <span class="truncate font-mono">{{ o }}</span>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
  <Input v-if="isCustom && !noInput" ref="input" v-model="model" class="font-mono" placeholder="NAME" />
</template>
