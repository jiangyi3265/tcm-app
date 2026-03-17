<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { setLocale, getLocale } from '../i18n'
import { useAuthStore } from '../stores/auth'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const form = reactive({ email: '', password: '' })
const loading = ref(false)

const currentLang = computed(() => getLocale())

function toggleLang() {
  const next = currentLang.value === 'zh-CN' ? 'en' : 'zh-CN'
  setLocale(next)
  window.location.reload()
}

async function handleLogin() {
  if (!form.email || !form.password) {
    return ElMessage.warning(t('login.loginWarning'))
  }
  loading.value = true
  try {
    const result = await authStore.login(form.email, form.password)
    if (result.success) {
      ElMessage.success(t('login.loginSuccess'))
      router.push('/dashboard')
    } else {
      ElMessage.error(result.message)
    }
  } finally {
    loading.value = false
  }
}

const demoAccounts = [
  { label: '管理员', email: 'admin@clinic.com', color: '#e63946' },
  { label: '医生 Li', email: 'doctor@clinic.com', color: '#2d6a4f' },
  { label: '医生 Wang', email: 'doctor2@clinic.com', color: '#40916c' },
  { label: '学徒', email: 'apprentice@clinic.com', color: '#e9c46a' },
  { label: '药剂师', email: 'pharmacist@clinic.com', color: '#264653' },
  { label: '收银员', email: 'cashier@clinic.com', color: '#f4a261' },
]

function fillDemo(account) {
  form.email = account.email
  form.password = 'admin123'
}
</script>

<template>
  <div class="login-page">
    <div class="lang-switch-wrapper" style="position: absolute; top: 20px; right: 20px; z-index: 10;">
      <el-button round size="default" @click="toggleLang" style="background: rgba(255,255,255,0.2); color: white; border: none; backdrop-filter: blur(4px);">
        <el-icon style="margin-right: 4px;"><Setting /></el-icon>
        {{ currentLang === 'zh-CN' ? 'English' : '中文' }}
      </el-button>
    </div>

    <div class="login-bg">
      <div class="login-decor" />
    </div>

    <div class="login-card">
      <div class="login-header">
        <div class="login-logo">
          <el-icon style="font-size: 48px; color: #2d6a4f"><FirstAidKit /></el-icon>
        </div>
        <h1 class="login-title">{{ t('login.title') }}</h1>
        <p class="login-subtitle">{{ t('login.subtitle') }}</p>
      </div>

      <el-form :model="form" @submit.prevent="handleLogin" class="login-form">
        <el-form-item>
          <el-input
            v-model="form.email"
            :placeholder="t('login.emailPlaceholder')"
            size="large"
            :prefix-icon="'Message'"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            :placeholder="t('login.passwordPlaceholder')"
            size="large"
            :prefix-icon="'Lock'"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          :loading="loading"
          @click="handleLogin"
          style="width: 100%; background: #2d6a4f; border-color: #2d6a4f"
        >
          {{ t('login.loginButton') }}
        </el-button>
      </el-form>

      <div class="demo-accounts">
        <div class="demo-title">{{ t('login.demoAccounts') }}</div>
        <div class="demo-btns">
          <button
            v-for="acc in demoAccounts"
            :key="acc.email"
            class="demo-btn"
            :style="{ '--accent': acc.color }"
            @click="fillDemo(acc)"
          >
            <span class="demo-dot" :style="{ background: acc.color }"></span>
            {{ acc.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1b4332 0%, #2d6a4f 50%, #40916c 100%);
  position: relative;
  overflow: hidden;
}

.login-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.login-decor {
  position: absolute;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.03);
  top: -200px;
  right: -100px;
}

.login-card {
  background: #fff;
  border-radius: 16px;
  padding: 48px 40px;
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 1;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-logo {
  margin-bottom: 12px;
}

.login-title {
  font-size: 22px;
  font-weight: 700;
  color: #1b4332;
  margin-bottom: 6px;
}

.login-subtitle {
  font-size: 12px;
  color: #888;
  letter-spacing: 1px;
}

.login-form {
  margin-bottom: 16px;
}

.demo-accounts {
  border-top: 1px solid #f0f0f0;
  padding-top: 16px;
}

.demo-title {
  font-size: 12px;
  color: #aaa;
  text-align: center;
  margin-bottom: 10px;
  letter-spacing: 0.5px;
}

.demo-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.demo-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 1px solid #e8e8e8;
  border-radius: 20px;
  background: #fafafa;
  font-size: 12px;
  color: #555;
  cursor: pointer;
  transition: all 0.2s;
}

.demo-btn:hover {
  border-color: var(--accent, #2d6a4f);
  background: #fff;
  color: var(--accent, #2d6a4f);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  transform: translateY(-1px);
}

.demo-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
