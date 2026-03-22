<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { intakePublicApi } from '../../utils/api'

const route = useRoute()
const token = route.params.token

const loading = ref(true)
const error = ref('')
const appointmentInfo = ref(null)
const submitting = ref(false)
const submitted = ref(false)

const form = ref({
  chiefComplaint: '',
  chiefComplaintDuration: '',
  chiefComplaintDescription: '',
  allergies: '',
  currentMedications: '',
  pastMedicalHistory: '',
  familyHistory: '',
  lifestyle: '',
  additionalNotes: '',
})

const durationOptions = [
  '1天内', '1-3天', '3-7天', '1-2周', '2-4周',
  '1-3个月', '3-6个月', '6个月-1年', '1年以上',
]

onMounted(async () => {
  try {
    const info = await intakePublicApi.getInfo(token)
    appointmentInfo.value = info
    if (info.intakeSubmitted) {
      submitted.value = true
    }
  } catch (e) {
    error.value = e.message || '无法加载表单信息'
  } finally {
    loading.value = false
  }
})

async function handleSubmit() {
  if (!form.value.chiefComplaint.trim()) {
    error.value = '请填写主要症状/就诊原因'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    await intakePublicApi.submit(token, form.value)
    submitted.value = true
  } catch (e) {
    error.value = e.message || '提交失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="intake-page">
    <div class="intake-card">
      <div class="intake-header">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#fff" stroke-width="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <line x1="9" y1="12" x2="15" y2="12"/>
            <line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
        </div>
        <h1>就诊问诊表</h1>
        <p class="subtitle">Pre-Visit Intake Form</p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="intake-status">
        <div class="spinner"></div>
        <p>正在加载...</p>
      </div>

      <!-- Error (no appointment) -->
      <div v-else-if="error && !appointmentInfo" class="intake-status error">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#e74c3c" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <h2>无法处理请求</h2>
        <p>{{ error }}</p>
      </div>

      <!-- Already submitted -->
      <div v-else-if="submitted" class="intake-status success">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#2d6a4f" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <h2>表单已提交</h2>
        <p>感谢您的配合！您填写的信息将在就诊时供医师参考。</p>
        <p>您可以关闭此页面。</p>
      </div>

      <!-- Intake Form -->
      <div v-else class="intake-form">
        <div class="appt-info" v-if="appointmentInfo">
          <span>病人：<strong>{{ appointmentInfo.patientName }}</strong></span>
          <span>预约时间：<strong>{{ appointmentInfo.startTime?.replace('T', ' ')?.slice(0, 16) }}</strong></span>
        </div>

        <div v-if="error" class="form-error">{{ error }}</div>

        <div class="form-section">
          <h3>主要症状 / 就诊原因 *</h3>
          <input type="text" v-model="form.chiefComplaint" placeholder="请描述您的主要不适症状" class="form-input" />
        </div>

        <div class="form-section">
          <h3>症状持续时间</h3>
          <div class="duration-grid">
            <label v-for="opt in durationOptions" :key="opt" class="duration-option"
              :class="{ active: form.chiefComplaintDuration === opt }">
              <input type="radio" :value="opt" v-model="form.chiefComplaintDuration" />
              <span>{{ opt }}</span>
            </label>
          </div>
        </div>

        <div class="form-section">
          <h3>症状详述</h3>
          <textarea v-model="form.chiefComplaintDescription" rows="3"
            placeholder="请详细描述症状出现的情况、加重/减轻因素等" class="form-textarea"></textarea>
        </div>

        <div class="form-section">
          <h3>过敏史</h3>
          <input type="text" v-model="form.allergies" placeholder="药物、食物过敏等（无则填'无'）" class="form-input" />
        </div>

        <div class="form-section">
          <h3>现用药物</h3>
          <input type="text" v-model="form.currentMedications" placeholder="正在服用的药物、保健品等（无则填'无'）" class="form-input" />
        </div>

        <div class="form-section">
          <h3>既往病史</h3>
          <textarea v-model="form.pastMedicalHistory" rows="2"
            placeholder="过去的重大疾病、手术、住院经历等" class="form-textarea"></textarea>
        </div>

        <div class="form-section">
          <h3>家族病史</h3>
          <input type="text" v-model="form.familyHistory" placeholder="直系亲属的重大疾病" class="form-input" />
        </div>

        <div class="form-section">
          <h3>生活习惯</h3>
          <textarea v-model="form.lifestyle" rows="2"
            placeholder="饮食偏好、运动频率、睡眠情况、烟酒等" class="form-textarea"></textarea>
        </div>

        <div class="form-section">
          <h3>其他补充说明</h3>
          <textarea v-model="form.additionalNotes" rows="2"
            placeholder="其他希望医师了解的情况" class="form-textarea"></textarea>
        </div>

        <button class="submit-button" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? '提交中...' : '提交问诊表' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.intake-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #f0f4f8 0%, #e8ecf1 100%);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

.intake-card {
  background: #fff; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.1);
  max-width: 640px; width: 100%; overflow: hidden; margin-top: 20px;
}

.intake-header {
  background: linear-gradient(135deg, #34495e 0%, #4a6fa5 100%);
  color: #fff; text-align: center; padding: 28px 24px;
}
.intake-header h1 { font-size: 22px; margin: 8px 0 4px; }
.intake-header .subtitle { font-size: 13px; opacity: 0.8; margin: 0; }

.intake-status { text-align: center; padding: 48px 24px; }
.intake-status.error h2 { color: #e74c3c; margin: 16px 0 8px; }
.intake-status.error p { color: #666; }
.intake-status.success h2 { color: #2d6a4f; margin: 16px 0 8px; }
.intake-status.success p { color: #666; margin: 4px 0; }

.spinner {
  width: 36px; height: 36px; border: 3px solid #e0e0e0; border-top-color: #4a6fa5;
  border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.intake-form { padding: 20px 28px 28px; }

.appt-info {
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
  background: #f8f9fa; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;
  font-size: 14px; color: #555;
}

.form-error {
  background: #fef0f0; color: #e74c3c; padding: 10px 14px; border-radius: 8px;
  margin-bottom: 16px; font-size: 14px;
}

.form-section { margin-bottom: 18px; }
.form-section h3 { font-size: 14px; color: #333; margin: 0 0 6px; font-weight: 600; }

.form-input, .form-textarea {
  width: 100%; padding: 10px 12px; border: 1.5px solid #d5d9dd; border-radius: 8px;
  font-size: 14px; transition: border-color 0.2s; box-sizing: border-box;
  font-family: inherit;
}
.form-input:focus, .form-textarea:focus { outline: none; border-color: #4a6fa5; }
.form-textarea { resize: vertical; }

.duration-grid {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.duration-option {
  display: flex; align-items: center; cursor: pointer;
  padding: 6px 12px; border: 1.5px solid #d5d9dd; border-radius: 20px;
  font-size: 13px; color: #555; transition: all 0.2s;
}
.duration-option.active { border-color: #4a6fa5; background: #eef2f7; color: #4a6fa5; font-weight: 600; }
.duration-option input { display: none; }

.submit-button {
  width: 100%; padding: 14px; background: #4a6fa5; color: #fff; border: none;
  border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s;
  margin-top: 8px;
}
.submit-button:hover:not(:disabled) { background: #34495e; }
.submit-button:disabled { background: #a0b4c8; cursor: not-allowed; }
</style>
