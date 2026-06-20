import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import en from './en'
import { getStoredItem, writeStoredItem } from '../utils/storage'

const LANG_KEY = 'tcm_lang'

function getDefaultLocale() {
  const saved = getStoredItem(LANG_KEY)
  if (saved) return saved
  const browserLang = navigator.language || navigator.userLanguage
  return browserLang.startsWith('zh') ? 'zh-CN' : 'en'
}

const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    en,
  },
})

export function setLocale(locale) {
  i18n.global.locale.value = locale
  writeStoredItem(LANG_KEY, locale)
  document.querySelector('html').setAttribute('lang', locale === 'zh-CN' ? 'zh' : 'en')
}

export function getLocale() {
  return i18n.global.locale.value
}

export default i18n
