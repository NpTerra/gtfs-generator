import { createApp } from 'vue'
import './style.css'
import { allowLargeModels } from '@/lib/model'
import { initStorage, usesIndexedDb } from '@/lib/storage'

// the stored projects are in memory before the app (and useProject's start) loads
await initStorage()
if (usesIndexedDb()) allowLargeModels()
const { default: App } = await import('./App.vue')
createApp(App).mount('#app')
