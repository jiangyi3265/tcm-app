<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { consentPublicApi } from '../../utils/api'

const route = useRoute()
const { locale } = useI18n()
const token = route.params.token

const loading = ref(true)
const pageError = ref('')
const submitError = ref('')
const patientName = ref('')
const documentTitle = ref('')
const documentVersion = ref('')
const sections = ref([])
const agreements = ref({})
const signatureName = ref('')
const signing = ref(false)
const signed = ref(false)
const signedAt = ref('')
const clinicName = ref('')
const clinicAddress = ref('')
const clinicPhone = ref('')

const isZh = computed(() => locale.value === 'zh-CN')

const text = computed(() => (isZh.value
  ? {
      appTitle: documentTitle.value || ((clinicName.value || 'OTCM') + ' 知情同意书'),
      appSubtitle: '请逐段阅读并确认后再签署',
      loading: '正在加载同意书...',
      invalidTitle: '无法处理请求',
      signedTitle: '知情同意书已签署',
      signedDesc: '感谢您的配合，系统已完成归档，您现在可以关闭页面。',
      signedAt: '签署时间',
      formTitle: '请阅读以下内容',
      patientLabel: '病人姓名',
      versionLabel: '版本',
      sectionAgree: '我已阅读并同意。',
      sectionHint: '所有段落都需要勾选“我已阅读并同意”后，才能完成签署。',
      signatureTitle: '签名确认',
      signatureLabel: '请输入您的姓名作为电子签名',
      signaturePlaceholder: '请输入签署人姓名',
      signaturePreview: '签名预览',
      signButton: '确认签署并归档',
      signing: '签署中...',
      emptySignature: '请输入签署姓名',
      sectionMissing: '请逐段阅读并同意所有内容后再签署',
    }
  : {
      appTitle: documentTitle.value || ((clinicName.value || 'OTCM') + ' Informed Consent'),
      appSubtitle: 'Please review each section and confirm before signing',
      loading: 'Loading consent form...',
      invalidTitle: 'Unable to process this request',
      signedTitle: 'Consent form signed',
      signedDesc: 'Thank you. The signed document has been archived and you may close this page now.',
      signedAt: 'Signed at',
      formTitle: 'Please review the following sections',
      patientLabel: 'Patient',
      versionLabel: 'Version',
      sectionAgree: 'I have read carefully and agree.',
      sectionHint: 'All sections must be acknowledged before you can sign.',
      signatureTitle: 'Signature confirmation',
      signatureLabel: 'Type your name as your electronic signature',
      signaturePlaceholder: 'Enter your full name',
      signaturePreview: 'Signature preview',
      signButton: 'Sign and archive',
      signing: 'Signing...',
      emptySignature: 'Please enter your signature name',
      sectionMissing: 'Please review and agree to every section before signing',
    }))

const allAgreed = computed(() => sections.value.length > 0
  && sections.value.every((section) => agreements.value[section.key] === true))

const formattedSignedAt = computed(() => {
  if (!signedAt.value) return ''
  const parsed = new Date(signedAt.value)
  if (Number.isNaN(parsed.getTime())) return signedAt.value
  return parsed.toLocaleString(isZh.value ? 'zh-CN' : 'en-US')
})

onMounted(async () => {
  try {
    const info = await consentPublicApi.getInfo(token)
    patientName.value = info.patientName || ''
    documentTitle.value = info.consentTitle || ''
    documentVersion.value = info.consentVersion || ''
    sections.value = Array.isArray(info.sections) ? info.sections : []
    agreements.value = Object.fromEntries(sections.value.map((section) => [section.key, false]))
    clinicName.value = info.clinicName || ''
    clinicAddress.value = info.clinicAddress || ''
    clinicPhone.value = info.clinicPhone || ''
    if (info.consentSigned) {
      signed.value = true
      signedAt.value = info.consentSignedAt || ''
    }
  } catch (e) {
    pageError.value = e.message || text.value.invalidTitle
  } finally {
    loading.value = false
  }
})

async function handleSign() {
  if (!signatureName.value.trim()) {
    submitError.value = text.value.emptySignature
    return
  }
  if (!allAgreed.value) {
    submitError.value = text.value.sectionMissing
    return
  }

  signing.value = true
  submitError.value = ''
  try {
    const result = await consentPublicApi.sign(token, signatureName.value.trim(), agreements.value)
    signed.value = true
    signedAt.value = result.consentSignedAt || ''
  } catch (e) {
    submitError.value = e.message || text.value.invalidTitle
  } finally {
    signing.value = false
  }
}
</script>

<template>
  <div class="consent-page">
    <div class="consent-card">
      <div class="consent-header">
        <div class="header-badge">{{ clinicName || 'OTCM' }}</div>
        <h1>{{ text.appTitle }}</h1>
        <p>{{ text.appSubtitle }}</p>
        <p v-if="clinicAddress || clinicPhone" class="clinic-contact">
          <span v-if="clinicAddress">{{ clinicAddress }}</span>
          <span v-if="clinicAddress && clinicPhone"> · </span>
          <span v-if="clinicPhone">{{ clinicPhone }}</span>
        </p>
      </div>

      <div v-if="loading" class="state-box">
        <div class="spinner"></div>
        <p>{{ text.loading }}</p>
      </div>

      <div v-else-if="pageError && !signed" class="state-box error">
        <h2>{{ text.invalidTitle }}</h2>
        <p>{{ pageError }}</p>
      </div>

      <div v-else-if="signed" class="state-box success">
        <h2>{{ text.signedTitle }}</h2>
        <p v-if="formattedSignedAt">{{ text.signedAt }}: {{ formattedSignedAt }}</p>
        <p>{{ text.signedDesc }}</p>
      </div>

      <div v-else class="consent-body">
        <div class="meta-card">
          <div><span class="meta-label">{{ text.patientLabel }}</span><strong>{{ patientName || '-' }}</strong></div>
          <div v-if="documentVersion"><span class="meta-label">{{ text.versionLabel }}</span><strong>{{ documentVersion }}</strong></div>
        </div>

        <div class="body-title">
          <h2>{{ text.formTitle }}</h2>
          <p>{{ text.sectionHint }}</p>
        </div>

        <div class="section-list">
          <article v-for="(section, index) in sections" :key="section.key" class="section-card">
            <div class="section-title">
              <span class="section-index">{{ index + 1 }}</span>
              <div>
                <h3>{{ section.title }}</h3>
              </div>
            </div>
            <div class="section-content">
              <p v-for="(paragraph, paragraphIndex) in section.paragraphs || []" :key="`${section.key}-${paragraphIndex}`">
                {{ paragraph }}
              </p>
            </div>
            <label class="section-agree">
              <input v-model="agreements[section.key]" type="checkbox" @change="submitError = ''" />
              <span>{{ text.sectionAgree }}</span>
            </label>
          </article>
        </div>

        <div class="signature-card">
          <h3>{{ text.signatureTitle }}</h3>
          <label class="signature-label">{{ text.signatureLabel }}</label>
          <input
            v-model="signatureName"
            class="signature-input"
            type="text"
            :placeholder="text.signaturePlaceholder"
            @input="submitError = ''"
          />
          <div class="signature-preview-card">
            <span class="meta-label">{{ text.signaturePreview }}</span>
            <div class="signature-preview">{{ signatureName || '—' }}</div>
          </div>
        </div>

        <div v-if="submitError" class="submit-error" role="alert">{{ submitError }}</div>

        <button class="submit-button" :disabled="signing || !allAgreed || !signatureName.trim()" @click="handleSign">
          {{ signing ? text.signing : text.signButton }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.consent-page {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(200, 226, 213, 0.86), transparent 34%),
    linear-gradient(180deg, #f4efe7 0%, #edf4ef 100%);
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

.consent-card {
  width: min(980px, 100%);
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 24px;
  border: 1px solid rgba(86, 117, 98, 0.14);
  box-shadow: 0 24px 64px rgba(55, 78, 62, 0.14);
  overflow: hidden;
}

.consent-header {
  padding: 32px 28px;
  text-align: center;
  color: #fff;
  background: linear-gradient(135deg, rgba(41, 70, 58, 0.96), rgba(99, 124, 95, 0.94), rgba(170, 114, 69, 0.92));
}

.header-badge {
  width: 70px;
  height: 70px;
  margin: 0 auto 14px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.consent-header h1 {
  margin: 0 0 8px;
  font-size: 30px;
}

.consent-header p {
  margin: 0;
  opacity: 0.9;
}

.clinic-contact {
  font-size: 12px;
  opacity: 0.8;
  margin-top: 4px !important;
}

.state-box {
  padding: 56px 28px;
  text-align: center;
}

.state-box.success h2 {
  color: #2d6a4f;
}

.state-box.error h2,
.state-box.error p,
.submit-error {
  color: #bf4040;
}

.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 18px;
  border: 3px solid rgba(76, 120, 94, 0.18);
  border-top-color: #4e7a60;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.consent-body {
  padding: 26px 28px 34px;
}

.meta-card,
.signature-card,
.section-card {
  border-radius: 18px;
  border: 1px solid rgba(100, 129, 111, 0.16);
  background: linear-gradient(135deg, #f8fbf8, #fcf7ef);
}

.meta-card {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 24px;
  padding: 16px 18px;
  margin-bottom: 18px;
}

.meta-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: #68806f;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.body-title {
  margin-bottom: 16px;
}

.body-title h2 {
  margin: 0 0 8px;
  color: #1f3e31;
}

.body-title p {
  margin: 0;
  color: #62786a;
}

.section-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-card {
  padding: 18px 20px;
}

.section-title {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.section-index {
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #335b49;
  color: #fff;
  font-weight: 700;
}

.section-title h3 {
  margin: 4px 0 0;
  color: #1f3e31;
  font-size: 18px;
}

.section-content p {
  margin: 0 0 10px;
  line-height: 1.75;
  color: #38473f;
  white-space: pre-wrap;
}

.section-agree {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  margin-top: 8px;
  font-weight: 600;
  color: #274437;
}

.section-agree input {
  width: 18px;
  height: 18px;
  accent-color: #2d6a4f;
}

.signature-card {
  margin-top: 18px;
  padding: 20px;
}

.signature-card h3 {
  margin: 0 0 12px;
  color: #1f3e31;
}

.signature-label {
  display: block;
  margin-bottom: 8px;
  color: #51655a;
  font-weight: 600;
}

.signature-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(106, 133, 116, 0.25);
  background: #fff;
  font-size: 16px;
  box-sizing: border-box;
}

.signature-preview-card {
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px dashed rgba(106, 133, 116, 0.32);
}

.signature-preview {
  margin-top: 8px;
  min-height: 42px;
  display: flex;
  align-items: center;
  font-size: 30px;
  color: #244131;
  font-family: 'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'KaiTi', 'STKaiti', cursive;
}

.submit-error {
  margin-top: 16px;
}

.submit-button {
  width: 100%;
  margin-top: 18px;
  padding: 15px 18px;
  border: none;
  border-radius: 14px;
  background: #2d6a4f;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.submit-button:disabled {
  cursor: not-allowed;
  background: #b2c7ba;
}

@media (max-width: 720px) {
  .consent-page {
    padding: 14px;
  }

  .consent-header h1 {
    font-size: 24px;
  }

  .consent-body {
    padding: 20px 18px 24px;
  }
}
</style>
