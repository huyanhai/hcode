import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n } from './i18n/index.js'
import { router } from './router/index.js'
import { usePreferencesStore } from './stores/preferences.js'
import './styles/main.css'

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.use(router)

const preferences = usePreferencesStore()
watch(() => preferences.locale, (locale) => {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}, { immediate: true })

void router.isReady().then(() => app.mount('#app'))
