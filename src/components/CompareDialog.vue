<script setup lang="ts">
// Arrange and Expected side by side, each with its own camera: drag, scroll or
// pinch one without moving the other, or sync them. Read-only.
import { Link2Icon, MaximizeIcon } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import MapView from '@/components/MapView.vue'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { tc } from '@/composables/useEditor'
import { createViewport } from '@/composables/useViewport'
import { t } from '@/lib/i18n'

const open = defineModel<boolean>('open', { required: true })

const arrangeView = createViewport()
const expectedView = createViewport()
const maps = ref<Record<string, InstanceType<typeof MapView> | null>>({})

// synced: each camera follows the other (same center and zoom); turning it on
// brings Expected to Arrange's view. Copying equal values back triggers nothing.
const synced = ref(false)
watch(synced, on => { if (on) Object.assign(expectedView.view, arrangeView.view) })
watch(() => ({ ...arrangeView.view }), v => { if (synced.value) Object.assign(expectedView.view, v) })
watch(() => ({ ...expectedView.view }), v => { if (synced.value) Object.assign(arrangeView.view, v) })
const sides = computed(() => [
  { key: 'arrange', title: 'Arrange', model: tc.value.arrange, viewport: arrangeView },
  { key: 'expected', title: 'Expected', model: tc.value.expected.type === 'model' ? tc.value.expected.model : null, viewport: expectedView },
])
</script>

<template>
  <Dialog v-model:open="open">
    <!-- The panel resize bars behind the dialog listen on the whole page (and only see
         that something covers them when it's HTML, not SVG): keep the mouse to us -->
    <DialogContent
      class="flex h-[85dvh] flex-col gap-3 sm:max-w-[min(95vw,1600px)]"
      @mousedown.stop @mousemove.stop @touchstart.stop @touchmove.stop
    >
      <DialogHeader class="flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2 pr-8">
        <div class="flex flex-col gap-1.5">
          <DialogTitle>Arrange and Expected side by side</DialogTitle>
          <DialogDescription>
            {{ synced ? 'Both maps move together' : 'Each map pans and zooms on its own' }}: drag, scroll or pinch. Edit in the main view.
          </DialogDescription>
        </div>
        <Button
          variant="outline" size="sm" :aria-pressed="synced" :class="synced && 'border-signal bg-signal/10 text-link'"
          title="Move and zoom both maps together" @click="synced = !synced"
        >
          <Link2Icon /> Sync views
        </Button>
      </DialogHeader>
      <div class="grid min-h-0 flex-1 grid-rows-2 gap-3 md:grid-cols-2 md:grid-rows-1">
        <section v-for="side in sides" :key="side.key" class="flex min-h-0 flex-col overflow-hidden rounded-xl border" :aria-label="side.title">
          <div class="flex h-9 shrink-0 items-center justify-between border-b pr-1 pl-3 font-semibold" :class="side.key === 'expected' && 'text-link'">
            {{ side.title }}
            <Button
              v-if="side.model" variant="ghost" size="icon-sm" class="text-muted-foreground"
              :title="`Zoom ${side.title} to fit all stations`" :aria-label="`Fit ${side.title}`" @click="maps[side.key]?.fit()"
            >
              <MaximizeIcon />
            </Button>
          </div>
          <div class="relative min-h-0 flex-1">
            <MapView v-if="side.model" :ref="el => (maps[side.key] = el as InstanceType<typeof MapView> | null)" :model="side.model" :viewport="side.viewport" />
            <p v-else class="grid h-full place-items-center p-6 text-center text-muted-foreground">
              {{ t('map.exceptionMsg', { name: tc.expected.exception }) }}
            </p>
          </div>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>
