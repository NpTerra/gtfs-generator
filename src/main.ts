import { createApp } from 'vue'
import './style.css'
import { initStorage } from '@/lib/storage'

// the stored projects are in memory before the app (and useProject's start) loads
await initStorage()
const { default: App } = await import('./App.vue')
createApp(App).mount('#app')
