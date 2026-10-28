// Promise-based replacements for window.confirm() and window.prompt(),
// rendered by ConfirmDialog.vue:
//   if (await confirmDialog('Delete it?')) { ... }
//   const name = await promptDialog('Rename to:', 'old') // null: cancelled
import { reactive } from 'vue'

export const confirmState = reactive({
  open: false,
  message: '',
  input: null as string | null, // the prompt's text; null for a yes/no question
  resolve: null as ((answer: string | null) => void) | null,
})

function ask(message: string, input: string | null): Promise<string | null> {
  confirmState.resolve?.(null) // a newer question cancels an unanswered one
  return new Promise(resolve => Object.assign(confirmState, { message, input, resolve, open: true }))
}

export const confirmDialog = (message: string) => ask(message, null).then(answer => answer !== null)
export const promptDialog = (message: string, initial: string) => ask(message, initial)

// ok: Continue (the prompt's text, or '' for a question); otherwise cancelled
export function answerConfirm(ok: boolean) {
  confirmState.open = false
  confirmState.resolve?.(ok ? confirmState.input ?? '' : null)
  confirmState.resolve = null
}
