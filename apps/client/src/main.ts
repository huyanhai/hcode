import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import { i18n } from './i18n/index.js'
import { router } from './router/index.js'
import './styles/index.css'

const app = createApp(App)
app.use(createPinia())
app.use(VueQueryPlugin, { queryClient: new QueryClient() })
app.use(i18n)
app.use(router)


void router.isReady().then(() => app.mount('#app'))
