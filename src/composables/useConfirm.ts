// A promise-based replacement for window.confirm(), rendered by ConfirmDialog.vue:
//   if (await confirmDialog('Delete it?')) { ... }
import { reactive } from 'vue'

export const confirmState = reactive({
  open: false,
  message: '',
  resolve: null as ((ok: boolean) => void) | null,
})

export function confirmDialog(message: string): Promise<boolean> {
  confirmState.resolve?.(false) // a newer question cancels an unanswered one
  return new Promise(resolve => {
    confirmState.message = message
    confirmState.resolve = resolve
    confirmState.open = true
  })
}

export function answerConfirm(ok: boolean) {
  confirmState.open = false
  confirmState.resolve?.(ok)
  confirmState.resolve = null
}
