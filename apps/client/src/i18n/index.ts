import { createI18n } from 'vue-i18n'
import enUS from './locales/en-US'
import zhCN from './locales/zh-CN'

export const supportedLocales = ['zh-CN', 'en-US'] as const
export type AppLocale = typeof supportedLocales[number]

export function isAppLocale(value: unknown): value is AppLocale {
  return supportedLocales.some((locale) => locale === value)
}

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})
