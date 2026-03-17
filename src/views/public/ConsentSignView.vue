<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { consentPublicApi } from '../../utils/api'

const route = useRoute()
const token = route.params.token

const loading = ref(true)
const error = ref('')
const patientName = ref('')
const agreed = ref(false)
const signatureName = ref('')
const signing = ref(false)
const signed = ref(false)
const signedAt = ref('')

onMounted(async () => {
  try {
    const info = await consentPublicApi.getInfo(token)
    patientName.value = info.patientName
    signedAt.value = info.consentSignedAt || ''
    if (info.consentSigned) {
      signed.value = true
    }
  } catch (e) {
    error.value = e.message || '无法加载同意书信息'
  } finally {
    loading.value = false
  }
})

async function handleSign() {
  if (!agreed.value) return
  if (!signatureName.value.trim()) return
  signing.value = true
  try {
    const result = await consentPublicApi.sign(token, signatureName.value.trim())
    signed.value = true
    signedAt.value = result.consentSignedAt
  } catch (e) {
    error.value = e.message || '签署失败'
  } finally {
    signing.value = false
  }
}
</script>

<template>
  <div class="consent-page">
    <div class="consent-card">
      <div class="consent-header">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#2d6a4f" stroke-width="2">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <h1>中医诊所综合管理系统</h1>
        <p class="subtitle">TCM Clinic Management System</p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="consent-loading">
        <div class="spinner"></div>
        <p>正在加载...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="consent-error">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#e74c3c" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <h2>无法处理请求</h2>
        <p>{{ error }}</p>
      </div>

      <!-- Already signed -->
      <div v-else-if="signed" class="consent-success">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#2d6a4f" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <h2>同意书已签署</h2>
        <p v-if="signedAt">签署时间：{{ signedAt }}</p>
        <p>感谢您的配合，您可以关闭此页面。</p>
      </div>

      <!-- Consent Form -->
      <div v-else class="consent-form">
        <h2>知情同意书</h2>
        <p class="patient-info">病人姓名：<strong>{{ patientName }}</strong></p>

        <div class="consent-content">
          <h3>诊疗知情同意书</h3>
          <div class="consent-text">
            <p>尊敬的患者：</p>
            <p>欢迎您来到本诊所就诊。在接受中医诊疗服务之前，请您仔细阅读以下内容：</p>
            <ol>
              <li><strong>诊疗范围：</strong>本诊所提供中医诊疗服务，包括但不限于中医问诊、辨证论治、针灸治疗、中药处方等。</li>
              <li><strong>风险告知：</strong>任何医疗行为均存在一定风险。针灸治疗可能出现局部疼痛、淤血、晕针等反应；中药可能因个人体质差异产生不同反应。</li>
              <li><strong>隐私保护：</strong>您的个人信息和诊疗记录将严格保密，仅用于诊疗目的。未经您的同意，不会向第三方披露。</li>
              <li><strong>配合义务：</strong>请如实告知您的病史、过敏史、正在使用的药物等信息，以便医师准确诊断和制定治疗方案。</li>
              <li><strong>费用说明：</strong>诊疗费用将在治疗前告知，包含诊疗费、药材费及相关税费。</li>
              <li><strong>知情权：</strong>您有权了解治疗方案、预期效果及可能的风险，如有疑问请随时向主治医师咨询。</li>
            </ol>
          </div>
        </div>

        <div class="consent-actions">
          <label class="agree-checkbox">
            <input type="checkbox" v-model="agreed" />
            <span>我已仔细阅读并理解以上内容，同意接受诊疗服务</span>
          </label>

          <div class="signature-area">
            <label>签名确认 / Signature：</label>
            <input
              type="text"
              v-model="signatureName"
              placeholder="请输入您的姓名"
              :disabled="!agreed"
              class="signature-input"
            />
          </div>

          <button
            class="sign-button"
            :disabled="!agreed || !signatureName.trim() || signing"
            @click="handleSign"
          >
            {{ signing ? '签署中...' : '确认签署' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.consent-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #f0f7f4 0%, #e8f5e9 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

.consent-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.1);
  max-width: 680px;
  width: 100%;
  overflow: hidden;
}

.consent-header {
  background: linear-gradient(135deg, #2d6a4f 0%, #40916c 100%);
  color: #fff;
  text-align: center;
  padding: 32px 24px;
}
.consent-header .logo-icon { margin-bottom: 12px; }
.consent-header .logo-icon svg { stroke: #fff; }
.consent-header h1 { font-size: 22px; margin: 0 0 4px; }
.consent-header .subtitle { font-size: 13px; opacity: 0.8; margin: 0; }

.consent-loading, .consent-error, .consent-success {
  text-align: center;
  padding: 48px 24px;
}

.spinner {
  width: 36px; height: 36px;
  border: 3px solid #e0e0e0;
  border-top-color: #2d6a4f;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.consent-error h2 { color: #e74c3c; margin: 16px 0 8px; }
.consent-error p { color: #666; }

.consent-success h2 { color: #2d6a4f; margin: 16px 0 8px; }
.consent-success p { color: #666; margin: 4px 0; }

.consent-form { padding: 24px 32px 32px; }
.consent-form h2 { font-size: 20px; color: #1b4332; margin: 0 0 12px; text-align: center; }
.patient-info { text-align: center; color: #555; margin-bottom: 20px; font-size: 15px; }

.consent-content { background: #f8faf9; border: 1px solid #e0e8e4; border-radius: 10px; padding: 20px 24px; margin-bottom: 24px; max-height: 320px; overflow-y: auto; }
.consent-content h3 { font-size: 16px; color: #1b4332; margin: 0 0 12px; text-align: center; }
.consent-text p { margin: 8px 0; line-height: 1.7; color: #444; font-size: 14px; }
.consent-text ol { padding-left: 20px; }
.consent-text li { margin: 8px 0; line-height: 1.7; color: #444; font-size: 14px; }

.consent-actions { display: flex; flex-direction: column; gap: 16px; }

.agree-checkbox {
  display: flex; align-items: flex-start; gap: 8px; cursor: pointer; font-size: 14px; color: #333;
}
.agree-checkbox input { margin-top: 3px; accent-color: #2d6a4f; width: 18px; height: 18px; }

.signature-area label { display: block; font-size: 14px; color: #555; margin-bottom: 6px; font-weight: 600; }
.signature-input {
  width: 100%; padding: 10px 14px; border: 2px solid #d0d8d4; border-radius: 8px;
  font-size: 16px; font-family: 'Courier New', monospace; transition: border-color 0.2s;
  box-sizing: border-box;
}
.signature-input:focus { outline: none; border-color: #2d6a4f; }
.signature-input:disabled { background: #f5f5f5; }

.sign-button {
  width: 100%; padding: 14px; background: #2d6a4f; color: #fff; border: none;
  border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer;
  transition: background 0.2s;
}
.sign-button:hover:not(:disabled) { background: #1b4332; }
.sign-button:disabled { background: #b0c4b8; cursor: not-allowed; }
</style>
