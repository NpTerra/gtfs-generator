<script setup lang="ts">
// The single dialog behind confirmDialog() in composables/useConfirm.ts.
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
      <AlertDialogHeader>
        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
        <AlertDialogDescription class="whitespace-pre-line">{{ confirmState.message }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="answerConfirm(false)">Cancel</AlertDialogCancel>
        <Button @click="answerConfirm(true)">Continue</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
