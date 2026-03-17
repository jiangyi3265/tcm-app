<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { auditLogsApi } from '../../utils/api'
import { formatDateTime } from '../../utils/dateUtils'
import { ROLE_LABELS, ROLE_COLORS } from '../../utils/permissions'

const { t } = useI18n()

const loading = ref(false)
const logs = ref([])
const filterType = ref('')
const filterDays = ref(30)
const searchQuery = ref('')

const ACTION_LABELS = computed(() => ({
  CREATE: t('audit.actionCreate'),
  UPDATE: t('audit.actionUpdate'),
  DELETE: t('audit.actionDelete'),
  TOGGLE: t('audit.actionToggle'),
  LOGIN: t('audit.actionLogin'),
  LOGOUT: t('audit.actionLogout'),
  PASSWORD_CHANGE: t('audit.actionPasswordChange'),
  PASSWORD_RESET: t('audit.actionPasswordReset'),
  COMPLETE: t('audit.actionComplete'),
  PAID: t('audit.actionPaid'),
  DISPENSE: t('audit.actionDispense'),
  STATUS_CHANGE: t('audit.actionStatusChange'),
  GENERATE_INTAKE_LINK: t('audit.actionGenerateIntakeLink'),
  ADJUST_STOCK: t('audit.actionAdjustStock'),
  SOFT_DELETE: t('audit.actionSoftDelete'),
  RESTORE: t('audit.actionRestore'),
  MERGE: t('audit.actionMerge'),
  CONSENT: t('audit.actionConsent'),
  SEND_CONSENT: t('audit.actionSendConsent'),
  UPLOAD_FILE: t('audit.actionUploadFile'),
  DELETE_FILE: t('audit.actionDeleteFile'),
}))

const ACTION_COLORS = {
  CREATE: 'success',
  UPDATE: '',
  DELETE: 'danger',
  TOGGLE: 'warning',
  LOGIN: 'info',
  LOGOUT: 'info',
  PASSWORD_CHANGE: 'warning',
  PASSWORD_RESET: 'warning',
  COMPLETE: 'success',
  PAID: 'success',
  DISPENSE: 'success',
  STATUS_CHANGE: 'warning',
  GENERATE_INTAKE_LINK: 'info',
  ADJUST_STOCK: 'warning',
  SOFT_DELETE: 'danger',
  RESTORE: 'success',
  MERGE: 'warning',
  CONSENT: 'success',
  SEND_CONSENT: 'info',
  UPLOAD_FILE: 'info',
  DELETE_FILE: 'danger',
}

const TARGET_LABELS = computed(() => ({
  user: t('audit.targetUser'),
  patient: t('audit.targetPatient'),
  consultation: t('audit.targetConsultation'),
  appointment: t('audit.targetAppointment'),
  inventory: t('audit.targetInventory'),
  formula: t('audit.targetFormula'),
  supplier: t('audit.targetSupplier'),
  acupoint: t('audit.targetAcupoint'),
  settings: t('audit.targetSettings'),
  branch: t('audit.targetBranch'),
  herb: t('audit.targetHerb'),
  meridian: t('audit.targetMeridian'),
  template: t('audit.targetTemplate'),
  file: t('audit.targetFile'),
}))

const EXTRA_ROLE_LABELS = computed(() => ({
  public: t('audit.rolePublic'),
  system: t('audit.roleSystem'),
}))

const EXTRA_ROLE_COLORS = {
  public: 'info',
  system: 'info',
}

const filteredLogs = computed(() => {
  let result = logs.value
  if (filterType.value) {
    result = result.filter(l => l.targetType === filterType.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(l =>
      (l.userName || '').toLowerCase().includes(q) ||
      (l.targetName || '').toLowerCase().includes(q) ||
      (l.details || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q)
    )
  }
  return result
})

async function loadLogs() {
  try {
    loading.value = true
    const data = await auditLogsApi.recent(filterDays.value)
    logs.value = Array.isArray(data) ? data : []
  } catch (e) {
    logs.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadLogs()
})

function getRoleLabel(role) {
  return EXTRA_ROLE_LABELS.value[role] || ROLE_LABELS[role] || role
}

function getRoleColor(role) {
  return EXTRA_ROLE_COLORS[role] || ROLE_COLORS[role] || 'info'
}
</script>

<template>
  <div class="audit-view">
    <h2 class="page-title">
      <el-icon style="margin-right:8px"><Document /></el-icon>
      {{ t('audit.title') }}
    </h2>

    <div class="audit-toolbar">
      <el-input v-model="searchQuery" :placeholder="t('audit.searchPlaceholder')" clearable style="width:280px">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-model="filterType" clearable :placeholder="t('audit.filterModule')" style="width:140px">
        <el-option v-for="(label, key) in TARGET_LABELS" :key="key" :label="label" :value="key" />
      </el-select>
      <el-select v-model="filterDays" @change="loadLogs" style="width:130px">
        <el-option :label="t('audit.last7Days')" :value="7" />
        <el-option :label="t('audit.last30Days')" :value="30" />
        <el-option :label="t('audit.last90Days')" :value="90" />
        <el-option :label="t('audit.last1Year')" :value="365" />
      </el-select>
      <el-button @click="loadLogs" :loading="loading">
        <el-icon><Refresh /></el-icon> {{ t('audit.refresh') }}
      </el-button>
    </div>

    <el-card class="log-card">
      <div v-if="loading" style="text-align:center;padding:40px">
        <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        <div style="margin-top:8px;color:#999">{{ t('audit.loading') }}</div>
      </div>
      <div v-else-if="filteredLogs.length === 0" style="text-align:center;padding:40px;color:#999">
        {{ t('audit.noLogs') }}
      </div>
      <div v-else class="log-timeline">
        <div v-for="log in filteredLogs" :key="log.id" class="log-entry">
          <div class="log-dot" :class="ACTION_COLORS[log.action] || 'info'"></div>
          <div class="log-content">
            <div class="log-header">
              <div class="log-user">
                <el-avatar :size="24" style="background:#2d6a4f;font-size:11px">{{ (log.userName || '?').charAt(0) }}</el-avatar>
                <span class="log-username">{{ log.userName || t('audit.system') }}</span>
                <el-tag v-if="log.userRole" size="small" :type="getRoleColor(log.userRole)">{{ getRoleLabel(log.userRole) }}</el-tag>
              </div>
              <span class="log-time">{{ formatDateTime(log.createdAt) }}</span>
            </div>
            <div class="log-body">
              <el-tag size="small" :type="ACTION_COLORS[log.action] || 'info'" style="margin-right:6px">
                {{ ACTION_LABELS[log.action] || log.action }}
              </el-tag>
              <span class="log-target-type">{{ TARGET_LABELS[log.targetType] || log.targetType }}</span>
              <span v-if="log.targetName" class="log-target-name">「{{ log.targetName }}」</span>
            </div>
            <div v-if="log.details" class="log-details">{{ log.details }}</div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.audit-view { max-width: 1000px; }

.page-title {
  font-size: 20px; font-weight: 700; color: #1b4332;
  display: flex; align-items: center; margin-bottom: 20px;
}

.audit-toolbar {
  display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center;
}

.log-card { border-radius: 12px; }

.log-timeline { display: flex; flex-direction: column; }

.log-entry {
  display: flex; gap: 14px; padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}
.log-entry:hover { background: #fafafa; }
.log-entry:last-child { border-bottom: none; }

.log-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: #ccc; margin-top: 8px; flex-shrink: 0;
}
.log-dot.success { background: #10b981; }
.log-dot.warning { background: #f59e0b; }
.log-dot.danger { background: #ef4444; }
.log-dot.info { background: #60a5fa; }

.log-content { flex: 1; min-width: 0; }

.log-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;
}

.log-user { display: flex; align-items: center; gap: 6px; }
.log-username { font-size: 13px; font-weight: 600; color: #333; }
.log-time { font-size: 12px; color: #aaa; white-space: nowrap; }

.log-body { font-size: 13px; color: #555; margin-bottom: 2px; }
.log-target-type { color: #888; margin-right: 4px; }
.log-target-name { font-weight: 600; color: #1b4332; }

.log-details {
  font-size: 12px; color: #999; margin-top: 4px;
  padding: 6px 10px; background: #f9f9f9; border-radius: 6px;
  word-break: break-all;
}
</style>
