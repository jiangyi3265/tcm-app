<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { publicBookingApi } from '../../utils/api'

const { t, locale } = useI18n()
const route = useRoute()
const token = route.params.token

const loading = ref(true)
const error = ref('')
const cancelling = ref(false)
const cancelled = ref(false)
const appointmentInfo = ref(null)

const formattedStartTime = computed(() => {
  const value = appointmentInfo.value?.startTime
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value).replace('T', ' ').slice(0, 16)
  return parsed.toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US')
})

onMounted(async () => {
  try {
    appointmentInfo.value = await publicBookingApi.manageInfo(token)
    if (appointmentInfo.value?.status === 'cancelled') {
      cancelled.value = true
    }
  } catch (e) {
    error.value = e.message || t('publicManage.loadFailed')
  } finally {
    loading.value = false
  }
})

async function handleCancel() {
  cancelling.value = true
  error.value = ''
  try {
    const result = await publicBookingApi.cancel(token, { source: 'patient_manage_page' })
    appointmentInfo.value = result.appointment || appointmentInfo.value
    cancelled.value = true
  } catch (e) {
    error.value = e.message || t('publicManage.cancelFailed')
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <div class="manage-page">
    <div class="manage-card">
      <div class="manage-header">
        <h1>{{ t('publicManage.pageTitle') }}</h1>
        <p>{{ t('publicManage.pageSubtitle') }}</p>
      </div>

      <div v-if="loading" class="manage-status">
        <div class="spinner"></div>
        <p>{{ t('publicManage.loading') }}</p>
      </div>

      <div v-else-if="error && !appointmentInfo" class="manage-status error">
        <h2>{{ t('publicManage.invalidTitle') }}</h2>
        <p>{{ error }}</p>
      </div>

      <div v-else-if="cancelled" class="manage-status success">
        <h2>{{ t('publicManage.cancelledTitle') }}</h2>
        <p>{{ t('publicManage.cancelledDesc') }}</p>
      </div>

      <div v-else class="manage-body">
        <div class="detail-grid">
          <div class="detail-item">
            <span class="label">{{ t('publicManage.patientLabel') }}</span>
            <strong>{{ appointmentInfo?.patientName || '-' }}</strong>
          </div>
          <div class="detail-item">
            <span class="label">{{ t('publicManage.timeLabel') }}</span>
            <strong>{{ formattedStartTime || '-' }}</strong>
          </div>
          <div class="detail-item">
            <span class="label">{{ t('publicManage.serviceLabel') }}</span>
            <strong>{{ appointmentInfo?.serviceLabel || '-' }}</strong>
          </div>
          <div class="detail-item">
            <span class="label">{{ t('publicManage.practitionerLabel') }}</span>
            <strong>{{ appointmentInfo?.practitionerName || '-' }}</strong>
          </div>
          <div class="detail-item">
            <span class="label">{{ t('publicManage.roomLabel') }}</span>
            <strong>{{ appointmentInfo?.roomName || '-' }}</strong>
          </div>
          <div class="detail-item">
            <span class="label">{{ t('publicManage.addressLabel') }}</span>
            <strong>{{ appointmentInfo?.clinicAddress || '-' }}</strong>
          </div>
        </div>

        <div v-if="error" class="form-error">{{ error }}</div>

        <button
          class="cancel-button"
          :disabled="cancelling || !appointmentInfo?.canCancel"
          @click="handleCancel"
        >
          {{ cancelling ? t('publicManage.cancelling') : t('publicManage.cancelButton') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.manage-page {
  min-height: 100vh;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at top left, rgba(201, 222, 208, 0.86), transparent 34%),
    linear-gradient(180deg, #f5efe6 0%, #f3f7f3 100%);
}

.manage-card {
  width: 100%;
  max-width: 720px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(108, 136, 117, 0.14);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 22px 60px rgba(63, 81, 67, 0.14);
}

.manage-header {
  padding: 30px 28px 24px;
  color: #fff;
  text-align: center;
  background: linear-gradient(135deg, rgba(43, 73, 59, 0.96), rgba(116, 90, 59, 0.92));
}

.manage-header h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.manage-header p {
  margin: 0;
  opacity: 0.86;
}

.manage-status,
.manage-body {
  padding: 28px;
}

.manage-status {
  text-align: center;
}

.manage-status.success h2 {
  color: #2d6a4f;
}

.manage-status.error h2,
.manage-status.error p,
.form-error {
  color: #c54242;
}

.spinner {
  width: 38px;
  height: 38px;
  margin: 0 auto 16px;
  border: 3px solid rgba(76, 120, 94, 0.16);
  border-top-color: #4e7a60;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.detail-item {
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, #f6faf7, #fbf6ee);
  border: 1px solid rgba(124, 145, 130, 0.14);
}

.detail-item .label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: #6a7f70;
}

.form-error {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(248, 224, 224, 0.95);
  border: 1px solid rgba(214, 102, 102, 0.18);
}

.cancel-button {
  width: 100%;
  margin-top: 18px;
  padding: 14px 18px;
  border: none;
  border-radius: 16px;
  background: linear-gradient(135deg, #a14a4a, #ba6c4c);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.cancel-button:disabled {
  opacity: 0.72;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .manage-page {
    padding: 14px;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
