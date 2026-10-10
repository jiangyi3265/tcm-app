import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus, { ElMessage } from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import en from 'element-plus/dist/locale/en.mjs'

import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { initAppVersionWatcher } from './utils/appVersion'
import { registerAppIcons } from './icons'

initAppVersionWatcher()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
const elLocale = i18n.global.locale.value === 'zh-CN' ? zhCn : en
app.use(ElementPlus, { locale: elLocale })
app.use(i18n)

registerAppIcons(app)

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
