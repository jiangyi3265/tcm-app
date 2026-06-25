import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus, { ElMessage } from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import en from 'element-plus/dist/locale/en.mjs'

import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { applyBootstrapToLocalStorage, bootstrapApi } from './utils/api'
import { getStoredItem } from './utils/storage'
import { initAppVersionWatcher } from './utils/appVersion'

async function preloadBootstrapData() {
  const token = getStoredItem('tcm_token')
  if (!token) return
  try {
    const payload = await bootstrapApi.fetch()
    applyBootstrapToLocalStorage(payload)
  } catch (error) {
    // ignore preload failure and fallback to local cache
  }
}

await preloadBootstrapData()
initAppVersionWatcher()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
const elLocale = i18n.global.locale.value === 'zh-CN' ? zhCn : en
app.use(ElementPlus, { locale: elLocale })
app.use(i18n)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// Global error handler for uncaught component/runtime errors.
app.config.errorHandler = (err, vm, info) => {
  // Ignore Element Plus cancel / close actions.
  if (err === 'cancel' || err === 'close') return
  console.error('[Global Error Handler]', err, info)
  const message = err instanceof Error ? err.message : String(err)
  if (message) {
    ElMessage.error(message)
  }
}

app.mount('#app')
