<script setup lang="ts">
// A field with a short fixed prefix inside its border: "S │ 3", "x │ 12.5".
// Put a bare <input class="prefix-input"> in the slot.
defineProps<{ prefix: string; title?: string }>()
</script>

<template>
  <label
    class="flex h-8 min-w-0 items-center rounded-lg border border-input bg-field text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring"
    :title="title"
  >
    <span class="self-stretch border-r border-border px-2 leading-7.5 font-semibold text-muted-foreground select-none">{{ prefix }}</span>
    <slot />
  </label>
</template>

<style>
.prefix-input {
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0 0.5rem;
  background: transparent;
  outline: none;
}
</style>
