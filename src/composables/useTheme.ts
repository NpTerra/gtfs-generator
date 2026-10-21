// Light / dark / follow-the-system. useColorMode remembers the choice and puts
// a "light" or "dark" class on <html>, which switches the Radix scales.
import { useColorMode } from '@vueuse/core'

export type ThemeChoice = 'light' | 'dark' | 'auto'

const mode = useColorMode({ storageKey: 'gtfs-editor-theme' })

// what the user picked ('auto' = follow the system)
export const themeChoice = mode.store
