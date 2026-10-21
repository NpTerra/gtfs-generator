<script setup lang="ts">
// Method picker + one field per parameter, all computed from tc.act, so the
// form and the raw act.txt textarea can never disagree.
import { computed } from 'vue'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { tc } from '@/composables/useEditor'
import { fields, join, METHODS, split } from '@/lib/acts'

const act = computed(() => split(tc.value.act))
const known = Object.keys(METHODS)

const method = computed({
  get: () => act.value.method.toUpperCase(),
  // parameters mean something else per method, so start empty
  set: (m: string) => { tc.value.act = join({ method: m, params: [], rest: [] }) },
})

function setParam(index: number, repeat: boolean | undefined, value: string) {
  const now = act.value
  const params = Array.from({ length: index }, (_, k) => now.params[k] ?? '')
  params.push(...(repeat ? value.split(';') : [value]), ...(repeat ? [] : now.params.slice(index + 1)))
  tc.value.act = join({ ...now, params: params.map(s => s.trim()) })
}

const unique = (values: string[]) => [...new Set(values.filter(Boolean))]
const stationNames = computed(() => unique(tc.value.arrange.stations.map(s => s.name)))
const lineNames = computed(() => unique(tc.value.arrange.lines.flatMap(l => [l.shortName, l.name])))
</script>

<template>
  <div class="flex flex-col gap-2">
    <NativeSelect v-model="method" class="w-full font-mono" title="Method (first line of act.txt)">
      <option v-if="!known.includes(method)" :value="method">
        {{ act.method ? `${act.method} (custom)` : 'choose a method…' }}
      </option>
      <option v-for="m in known" :key="m" :value="m">{{ m }}</option>
    </NativeSelect>

    <div v-if="fields(act).length" class="flex flex-wrap gap-2">
      <label
        v-for="({ param, values }, i) in fields(act)" :key="param.label"
        class="flex min-w-0 flex-col gap-1 text-[13px] font-medium text-muted-foreground"
        :class="param.repeat ? 'flex-[2_1_160px]' : 'flex-[1_1_90px]'"
      >
        {{ param.label }}
        <Input
          class="font-mono" :model-value="values.join(';')"
          :list="param.kind === 'station' ? 'act-stations' : param.kind === 'line' ? 'act-lines' : undefined"
          :inputmode="param.kind === 'number' ? 'decimal' : undefined"
          :placeholder="param.repeat ? 'A;B;C' : undefined"
          @update:model-value="v => setParam(i, param.repeat, String(v))"
        />
      </label>
    </div>

    <Textarea v-model="tc.act" class="min-h-16 font-mono" rows="2" title="Raw act.txt" />

    <datalist id="act-stations"><option v-for="n in stationNames" :key="n" :value="n" /></datalist>
    <datalist id="act-lines"><option v-for="n in lineNames" :key="n" :value="n" /></datalist>
  </div>
</template>
