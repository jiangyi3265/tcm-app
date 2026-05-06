<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useConsultationsStore } from '../../stores/consultations'
import { usePatientsStore } from '../../stores/patients'
import { useAuthStore } from '../../stores/auth'
import { useAppointmentsStore } from '../../stores/appointments'
import { canAccessPatientRecords, filterAccessibleConsultations } from '../../utils/permissions'
import { formatDate } from '../../utils/dateUtils'

const { t } = useI18n()

const router = useRouter()
const consultationsStore = useConsultationsStore()
const patientsStore = usePatientsStore()
const authStore = useAuthStore()
const appointmentsStore = useAppointmentsStore()

const searchQuery = ref('')
const statusFilter = ref('all')

const STATUS_TYPES = {
  draft: 'info',
  completed: 'warning',
  paid: 'success',
}

const CURRENCY_SYMBOLS = {
  CAD: '$',
  USD: '$',
}

const patientConsultationsMap = computed(() => {
  const grouped = new Map()
  consultationsStore.consultations.forEach((consultation) => {
    if (consultation.deletedAt) return
    const list = grouped.get(consultation.patientId) || []
    list.push(consultation)
    grouped.set(consultation.patientId, list)
  })
  return grouped
})

function getPatientName(patientId) {
  return patientsStore.getPatient(patientId)?.name || '-'
}

function getPractitionerName(practitionerId) {
  if (!practitionerId) return '-'
  const matched = authStore.users.find((user) => String(user.id) === String(practitionerId))
  return matched?.name || practitionerId
}

function formatAmount(row) {
  const amount = Number(row.totalAmount || 0)
  if (amount <= 0) return '-'
  const symbol = CURRENCY_SYMBOLS[row.currency] || `${row.currency || 'CAD'} `
  return `${symbol}${amount.toFixed(2)}`
}

const visibleConsultations = computed(() =>
  filterAccessibleConsultations(
    authStore.roles,
    consultationsStore.consultations,
    { currentUser: authStore.currentUser },
  )
    .filter((consultation) => !consultation.deletedAt)
    .filter((consultation) => {
      const patient = patientsStore.getPatient(consultation.patientId)
      if (!patient) return false
      return canAccessPatientRecords(
        authStore.roles,
        authStore.userId,
        patient,
        patientConsultationsMap.value.get(consultation.patientId) || [],
        {
          currentUser: authStore.currentUser,
          appointments: appointmentsStore.getPatientAppointments(consultation.patientId),
        },
      )
    })
    .map((consultation) => ({
      ...consultation,
      patientName: getPatientName(consultation.patientId),
      practitionerName: getPractitionerName(consultation.practitionerId),
    }))
    .sort((a, b) => {
      const dateDiff = new Date(b.date || 0) - new Date(a.date || 0)
      if (dateDiff !== 0) return dateDiff
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    }),
)

const filteredConsultations = computed(() => {
  const query = String(searchQuery.value || '').trim().toLowerCase()

  return visibleConsultations.value.filter((consultation) => {
    if (statusFilter.value !== 'all' && consultation.status !== statusFilter.value) return false
    if (!query) return true

    return [
      consultation.patientName,
      consultation.consultationId,
      consultation.chiefComplaint,
      consultation.chiefComplaintDescription,
      consultation.practitionerName,
      consultation.date,
    ].some((value) => String(value || '').toLowerCase().includes(query))
  })
})

function openConsultation(row) {
  if (!row?.patientId || !row?.id) return
  router.push(`/patients/${row.patientId}/consultations/${row.id}`)
}
</script>

<template>
  <div class="consultation-list-page">
    <div class="page-toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="searchQuery"
          :placeholder="t('consultationList.searchPlaceholder')"
          clearable
          style="width: 320px"
          :prefix-icon="'Search'"
        />
        <el-select v-model="statusFilter" :placeholder="t('consultationList.statusPlaceholder')" style="width: 140px">
          <el-option :label="t('common.all')" value="all" />
          <el-option :label="t('consultStatus.draft')" value="draft" />
          <el-option :label="t('consultStatus.completed')" value="completed" />
          <el-option :label="t('consultStatus.paid')" value="paid" />
        </el-select>
      </div>
      <div class="toolbar-count">{{ t('consultationList.totalCount', { count: filteredConsultations.length }) }}</div>
    </div>

    <el-card class="list-card">
      <template #header>
        <div class="card-header">
          <span>{{ t('consultationList.title') }}</span>
        </div>
      </template>

      <el-table
        :data="filteredConsultations"
        row-key="id"
        stripe
        style="cursor: pointer"
        :empty-text="t('consultationList.empty')"
        @row-click="openConsultation"
      >
        <el-table-column :label="t('common.date')" width="120">
          <template #default="{ row }">
            <span class="date-cell">{{ formatDate(row.date) }}</span>
          </template>
        </el-table-column>

        <el-table-column :label="t('common.status')" width="100">
          <template #default="{ row }">
            <el-tag :type="STATUS_TYPES[row.status] || 'info'" size="small">
              {{ t('consultStatus.' + row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column :label="t('consultationList.patient')" min-width="160">
          <template #default="{ row }">
            <div class="patient-cell">
              <div class="patient-name">{{ row.patientName }}</div>
              <div class="consult-id">{{ row.consultationId || row.id }}</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column :label="t('consultationList.chiefComplaint')" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.chiefComplaint || '-' }}</template>
        </el-table-column>

        <el-table-column :label="t('consultationList.practitioner')" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.practitionerName }}</template>
        </el-table-column>

        <el-table-column :label="t('common.amount')" width="110" align="right">
          <template #default="{ row }">
            <span class="amount-cell">{{ formatAmount(row) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.consultation-list-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-count {
  font-size: 13px;
  color: #666;
}

.list-card {
  border-radius: 10px;
}

.card-header {
  font-size: 14px;
  font-weight: 700;
  color: #1b4332;
}

.date-cell {
  font-weight: 600;
  color: #2d6a4f;
}

.patient-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.patient-name {
  font-weight: 600;
  color: #222;
}

.consult-id {
  font-size: 12px;
  color: #888;
}

.amount-cell {
  font-weight: 600;
  color: #444;
}
</style>
