<script setup lang="ts">
// The single dialog behind confirmDialog() and promptDialog() in composables/useConfirm.ts.
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { answerConfirm, confirmState } from '@/composables/useConfirm'

// Cancel and Esc close the dialog, which counts as "no".
// Continue is a plain button: AlertDialogAction would close (= "no") before
// its own click handler could answer "yes".
function onOpenChange(open: boolean) {
  if (!open && confirmState.open) answerConfirm(false)
}

</script>

<template>
  <AlertDialog :open="confirmState.open" @update:open="onOpenChange">
    <AlertDialogContent>
      <AlertDialogHeader v-if="confirmState.input === null">
        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
        <AlertDialogDescription class="whitespace-pre-line">{{ confirmState.message }}</AlertDialogDescription>
      </AlertDialogHeader>
      <!-- a prompt: the question is the title, and the field's label -->
      <AlertDialogHeader v-else>
        <AlertDialogTitle class="text-base font-medium">
          <label for="prompt-input">{{ confirmState.message }}</label>
        </AlertDialogTitle>
        <AlertDialogDescription class="sr-only">Enter confirms, Escape cancels.</AlertDialogDescription>
      </AlertDialogHeader>
      <Input
        v-if="confirmState.input !== null" id="prompt-input" v-model="confirmState.input"
        @focus="($event.target as HTMLInputElement).select()" @keydown.enter.prevent="answerConfirm(true)"
      />
      <AlertDialogFooter>
        <!-- reka focuses an AlertDialogCancel on open; a prompt's plain Cancel leaves focus to the text field -->
        <AlertDialogCancel v-if="confirmState.input === null" @click="answerConfirm(false)">Cancel</AlertDialogCancel>
        <Button v-else variant="outline" @click="answerConfirm(false)">Cancel</Button>
        <Button @click="answerConfirm(true)">{{ confirmState.input === null ? 'Continue' : 'OK' }}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
