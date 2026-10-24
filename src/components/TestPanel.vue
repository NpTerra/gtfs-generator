<script setup lang="ts">
// Left panel: everything about the test case itself (not the GTFS models).
import { ArrowRightIcon, CopyIcon } from '@lucide/vue'
import ActEditor from '@/components/ActEditor.vue'
import FormField from '@/components/FormField.vue'
import PanelHeader from '@/components/PanelHeader.vue'
import PanelSection from '@/components/PanelSection.vue'
import PresetSelect from '@/components/PresetSelect.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { confirmDialog } from '@/composables/useConfirm'
import { setTab, tc } from '@/composables/useEditor'
import { t } from '@/lib/i18n'
import { cloneModel, isPhoneMissing, KNOWN_EXCEPTIONS } from '@/lib/model'

async function copyArrange() {
  if (tc.value.expected.model.stations.length > 0 && !await confirmDialog(t('dlg.copyArrange'))) return
  tc.value.expected.model = cloneModel(tc.value.arrange)
}
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col bg-surface" aria-label="Test case">
    <PanelHeader title="Test case" panel="test" />
    <div class="@container flex-1 overflow-y-auto pb-6">
      <PanelSection id="test" title="Test">
        <FormField label="Name" :hint="t('hint.testName')">
          <Input v-model="tc.name" />
        </FormField>
        <FormField label="Description (comment.txt)" :hint="t('hint.description')">
          <Textarea v-model="tc.description" rows="4" class="text-[15px] leading-relaxed md:text-[15px]" />
        </FormField>
        <FormField label="Act (act.txt)" :hint="t('hint.act')">
          <ActEditor />
        </FormField>
      </PanelSection>

      <PanelSection id="expected" title="Expected result">
        <RadioGroup v-model="tc.expected.type" class="gap-2.5">
          <div class="flex items-center gap-2">
            <RadioGroupItem id="exp-model" value="model" />
            <Label for="exp-model">resulting model <span class="text-muted-foreground">(assert.zip)</span></Label>
          </div>
          <div class="flex items-center gap-2">
            <RadioGroupItem id="exp-exception" value="exception" />
            <Label for="exp-exception">exception <span class="text-muted-foreground">(assert.txt)</span></Label>
          </div>
        </RadioGroup>
        <FormField v-if="tc.expected.type === 'exception'" label="Exception name" :hint="t('hint.exception')">
          <PresetSelect v-model="tc.expected.exception" :options="KNOWN_EXCEPTIONS" title="Exception name (assert.txt)" />
        </FormField>
        <div v-else class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" title="Overwrite the Expected model with a copy of the Arrange model" @click="copyArrange">
            <CopyIcon /> Copy Arrange → Expected
          </Button>
          <Button variant="outline" size="sm" @click="setTab('expected')">
            Edit expected model <ArrowRightIcon />
          </Button>
        </div>
      </PanelSection>

      <PanelSection id="agency" title="Agency">
        <FormField label="Name"><Input v-model="tc.agency.name" /></FormField>
        <FormField label="URL"><Input v-model="tc.agency.url" /></FormField>
        <div class="grid grid-cols-2 gap-2 @max-[16rem]:grid-cols-1">
          <FormField label="Timezone"><Input v-model="tc.agency.timezone" /></FormField>
          <FormField label="Language"><Input v-model="tc.agency.language" /></FormField>
        </div>
        <FormField label="Phone" :hint="isPhoneMissing(tc.agency) ? t('hint.phone') : undefined" warn>
          <Input v-model="tc.agency.phone" data-field="agency-phone" />
        </FormField>
      </PanelSection>
    </div>
  </aside>
</template>
