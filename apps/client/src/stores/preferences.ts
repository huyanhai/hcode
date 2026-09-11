import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { isAppLocale, type AppLocale } from '@/i18n'

const localeStorageKey = 'hcode.code-client.locale'

function readLocale(): AppLocale {
  try {
    const saved = localStorage.getItem(localeStorageKey)
    if (isAppLocale(saved)) return saved
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
  return navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US'
}

export const usePreferencesStore = defineStore('preferences', () => {
  const locale = ref<AppLocale>(readLocale())

  watch(locale, (value) => {
    try {
      localStorage.setItem(localeStorageKey, value)
    } catch {
      // Keep the current session usable when preferences cannot be persisted.
    }
  })

  return { locale }
})
