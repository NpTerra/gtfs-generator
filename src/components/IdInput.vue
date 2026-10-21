<script setup lang="ts">
// Numeric ID with its GTFS prefix ("S", "R", "C", "T"). Commits on change
// (not per keystroke) and snaps back when the new ID is rejected.
import PrefixField from '@/components/PrefixField.vue'

const props = defineProps<{ id: number; prefix: string; label: string; onChangeId: (id: number) => boolean }>()

function onChange(e: Event) {
  const input = e.target as HTMLInputElement
  const next = parseInt(input.value, 10)
  if (!Number.isFinite(next) || !props.onChangeId(next)) input.value = String(props.id)
}
</script>

<template>
  <PrefixField :prefix="prefix" :title="`${label} (${prefix}${id} in the generated files)`" class="w-[4.5rem] shrink-0">
    <input type="number" min="0" :value="id" :aria-label="label" class="prefix-input" @change="onChange">
  </PrefixField>
</template>
