<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { usePatientsStore } from '../stores/patients'
import { useConsultationsStore } from '../stores/consultations'
import { useAppointmentsStore } from '../stores/appointments'
import { useInventoryStore } from '../stores/inventory'
import { useBranchesStore } from '../stores/branches'
import { formatTime, formatDate, dayjs } from '../utils/dateUtils'
import { getActivePrescriptions, getPaymentRecords, getPaymentStatus, getPrescriptionStatus } from '../utils/prescriptionWorkflow'
import { SERVICE_TYPES } from '../utils/sampleData'

const { t, locale } = useI18n()

const router = useRouter()
const authStore = useAuthStore()
const patientsStore = usePatientsStore()
const consultationsStore = useConsultationsStore()
const appointmentsStore = useAppointmentsStore()
const inventoryStore = useInventoryStore()
const branchesStore = useBranchesStore()

const roles = computed(() => authStore.roles)
const user = computed(() => authStore.currentUser)

const totalPatients = computed(() => patientsStore.activePatients.length)
const todayAppointments = computed(() => {
  const branchId = branchesStore.currentBranchId
  return appointmentsStore.todayAppointments.filter(a => !branchId || a.branchId === branchId || !a.branchId)
})
const pendingPayments = computed(() => {
  const branchId = branchesStore.currentBranchId
  return consultationsStore.pendingPayments.filter(c => !branchId || c.branchId === branchId || !c.branchId).length
})
const lowStockItems = computed(() => inventoryStore.lowStockItems)

const todayApptWithPatient = computed(() =>
  todayAppointments.value.map((appt) => ({
    ...appt,
    patient: patientsStore.getPatient(appt.patientId),
    practitioner: authStore.users.find((u) => u.id === appt.practitionerId),
    serviceLabel: SERVICE_TYPES[appt.serviceType]?.label || appt.serviceType,
  })),
)

// 当前医师的预约（个人日程）
const myTodayAppts = computed(() =>
  todayApptWithPatient.value.filter(a => a.practitionerId === authStore.userId),
)

// 最近的诊疗记录（当前用户）
const recentConsultations = computed(() => {
  const branchId = branchesStore.currentBranchId
  const all = roles.value.includes('admin')
    ? consultationsStore.consultations.filter(c => !c.deletedAt && (!branchId || c.branchId === branchId || !c.branchId))
    : consultationsStore.consultations.filter(c => c.practitionerId === authStore.userId && !c.deletedAt && (!branchId || c.branchId === branchId || !c.branchId))
  return all
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map(c => ({
      ...c,
      patient: patientsStore.getPatient(c.patientId),
    }))
})

// 本周统计
const weekStats = computed(() => {
  const branchId = branchesStore.currentBranchId
  const startOfWeek = dayjs().startOf('week').toISOString()
  const myConsults = consultationsStore.consultations.filter(c =>
    !c.deletedAt && c.date >= startOfWeek.split('T')[0]
    && (roles.value.includes('admin') || c.practitionerId === authStore.userId)
    && (!branchId || c.branchId === branchId || !c.branchId)
  )
  const revenue = myConsults
    .flatMap((consultation) => getPaymentRecords(consultation))
    .filter((record) => String(record.date || '') >= startOfWeek)
    .reduce((sum, record) => sum + Number(record.amount || 0), 0)
  return {
    consultCount: myConsults.length,
    revenue,
  }
})

const pendingPrescriptions = computed(() => {
  const branchId = branchesStore.currentBranchId
  return consultationsStore.consultations
    .filter((consultation) => !consultation.deletedAt && (!branchId || consultation.branchId === branchId || !consultation.branchId))
    .flatMap((consultation) => getActivePrescriptions(consultation)
      .filter((prescription) => getPrescriptionStatus(prescription) === 'pending')
      .map((prescription) => ({
        id: `${consultation.id}:${prescription.id}`,
        consultation,
        patient: patientsStore.getPatient(consultation.patientId),
        formulaName: prescription.formulaName || consultation.formulaName || t('common.customFormula'),
        prescriptionType: prescription.prescriptionType || consultation.prescriptionType || 'raw_herbs',
      })))
})
const currentWeekday = computed(() =>
  new Intl.DateTimeFormat(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', { weekday: 'long' }).format(new Date()),
)

function goToPatient(patientId) {
  router.push(`/patients/${patientId}`)
}

function goToPatientConsultation(patientId) {
  // 点击病人姓名直接进入consultation file
  const patientConsults = consultationsStore.getPatientConsultations(patientId)
  if (patientConsults.length > 0) {
    const latest = patientConsults[0]
    router.push(`/patients/${patientId}/consultations/${latest.id}`)
  } else {
    // 没有诊疗记录，创建新的
    router.push(`/patients/${patientId}/consultations/new`)
  }
}

function goToConsultation(c) {
  router.push(`/patients/${c.patientId}/consultations/${c.id}`)
}

const STATUS_MAP = {
  booked: { type: 'info' },
  confirmed: { type: 'success' },
  completed: { type: '' },
  cancelled: { type: 'danger' },
  blocked: { type: 'info' },
}

function getConsultStatusType(consultation) {
  if (getPaymentStatus(consultation) === 'paid') return 'success'
  if (consultation.status === 'completed') return 'warning'
  return 'info'
}
</script>

<template>
  <div class="dashboard">
    <div class="welcome-bar">
      <div>
        <h2 class="welcome-title">{{ t('dashboard.welcome', { name: user?.name }) }}</h2>
        <p class="welcome-date">
          {{ formatDate(new Date()) }} · {{ currentWeekday }}
          <span v-if="branchesStore.currentBranch" style="margin-left: 8px; color: #2d6a4f; font-weight: 600">
            · {{ branchesStore.currentBranch.name }}
          </span>
        </p>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div v-if="roles.some(r => ['admin', 'practitioner', 'apprentice'].includes(r))" class="stat-card green" @click="$router.push('/patients')">
        <div class="stat-icon"><el-icon><User /></el-icon></div>
        <div class="stat-info">
          <div class="stat-number">{{ totalPatients }}</div>
          <div class="stat-label">{{ t('dashboard.totalPatients') }}</div>
        </div>
      </div>
      <div v-if="roles.some(r => ['admin', 'practitioner', 'apprentice'].includes(r))" class="stat-card blue" @click="$router.push('/appointments')">
        <div class="stat-icon"><el-icon><Calendar /></el-icon></div>
        <div class="stat-info">
          <div class="stat-number">{{ todayAppointments.length }}</div>
          <div class="stat-label">{{ t('dashboard.todayAppointments') }}</div>
        </div>
      </div>
      <div class="stat-card orange" v-if="roles.some(r => ['admin', 'cashier', 'practitioner'].includes(r))">
        <div class="stat-icon"><el-icon><Money /></el-icon></div>
        <div class="stat-info">
          <div class="stat-number">{{ pendingPayments }}</div>
          <div class="stat-label">{{ t('dashboard.pendingPayments') }}</div>
        </div>
      </div>
      <div class="stat-card red" v-if="roles.some(r => ['admin', 'pharmacist', 'practitioner'].includes(r))">
        <div class="stat-icon"><el-icon><Warning /></el-icon></div>
        <div class="stat-info">
          <div class="stat-number">{{ lowStockItems.length }}</div>
          <div class="stat-label">{{ t('dashboard.lowStockAlert') }}</div>
        </div>
      </div>
      <div class="stat-card purple" v-if="roles.some(r => ['admin', 'practitioner'].includes(r))">
        <div class="stat-icon" style="background: #ede9fe; color: #7c3aed"><el-icon><TrendCharts /></el-icon></div>
        <div class="stat-info">
          <div class="stat-number">{{ weekStats.consultCount }}</div>
          <div class="stat-label">{{ t('dashboard.weeklyConsultations') }}</div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- 今日预约 -->
      <el-card class="dash-card" v-if="roles.some(r => ['admin', 'practitioner', 'apprentice'].includes(r))">
        <template #header>
          <div class="card-header">
            <span>{{ t('dashboard.todayAppointmentsCard') }}</span>
            <el-button size="small" text @click="$router.push('/appointments')">{{ t('dashboard.viewAll') }}</el-button>
          </div>
        </template>
        <div v-if="todayApptWithPatient.length === 0" class="empty-state">
          <el-empty :description="t('dashboard.noAppointmentsToday')" :image-size="60" />
        </div>
        <div v-else class="appointment-list">
          <div
            v-for="appt in todayApptWithPatient"
            :key="appt.id"
            class="appt-item"
            @click="appt.patientId ? goToPatient(appt.patientId) : null"
            :style="{ cursor: appt.patientId ? 'pointer' : 'default' }"
          >
            <div class="appt-time">
              <span>{{ formatTime(appt.startTime) }}</span>
              <span class="appt-end">- {{ formatTime(appt.endTime) }}</span>
            </div>
            <div class="appt-info">
              <div class="appt-name">{{ appt.serviceType === 'time_block' ? ('🚫 ' + (appt.notes || '时间占用')) : appt.patient?.name }}</div>
              <div class="appt-service">{{ appt.serviceType === 'time_block' ? appt.practitioner?.name : (appt.serviceLabel + ' · ' + appt.practitioner?.name) }}</div>
            </div>
            <el-tag :type="STATUS_MAP[appt.status]?.type" size="small">
              {{ t('appointmentStatus.' + appt.status) }}
            </el-tag>
          </div>
        </div>
      </el-card>

      <!-- 待发药 -->
      <el-card class="dash-card" v-if="roles.some(r => ['admin', 'pharmacist'].includes(r))">
        <template #header>
          <div class="card-header">
            <span>{{ t('dashboard.pendingPrescriptions') }}</span>
            <el-button size="small" text @click="$router.push('/pharmacy')">{{ t('dashboard.viewAll') }}</el-button>
          </div>
        </template>
        <div v-if="pendingPrescriptions.length === 0" class="empty-state">
          <el-empty :description="t('dashboard.noPendingPrescriptions')" :image-size="60" />
        </div>
        <div v-else>
          <div
            v-for="c in pendingPrescriptions.slice(0, 5)"
            :key="c.id"
            class="prescription-item"
          >
            <div class="rx-info">
              <span class="rx-patient">{{ c.patient?.name }}</span>
              <span class="rx-formula">{{ c.formulaName || t('common.customFormula') }}</span>
            </div>
            <el-tag size="small" :type="c.prescriptionType === 'powder' ? 'warning' : 'success'">
              {{ t('dashboard.prescType.' + (c.prescriptionType === 'powder' ? 'powder' : c.prescriptionType === 'raw_herbs' ? 'raw_herbs' : 'pills')) }}
            </el-tag>
          </div>
        </div>
      </el-card>

      <!-- 库存预警 -->
      <el-card class="dash-card" v-if="roles.some(r => ['admin', 'pharmacist', 'practitioner'].includes(r))">
        <template #header>
          <div class="card-header">
            <span>{{ t('dashboard.inventoryAlert') }}</span>
            <el-button size="small" text @click="$router.push('/inventory')">{{ t('dashboard.manageInventory') }}</el-button>
          </div>
        </template>
        <div v-if="lowStockItems.length === 0" class="empty-state">
          <el-icon style="font-size: 32px; color: #52b788"><CircleCheck /></el-icon>
          <p style="color: #888; font-size: 13px; margin-top: 8px">{{ t('dashboard.stockSufficient') }}</p>
        </div>
        <div v-else>
          <div
            v-for="item in lowStockItems.slice(0, 6)"
            :key="item.id"
            class="stock-item"
          >
            <span class="stock-name">{{ item.name }}</span>
            <span class="stock-qty" :class="{ critical: item.quantity === 0 }">
              {{ item.quantity }} {{ item.unit }}
            </span>
          </div>
        </div>
      </el-card>

      <!-- 我的日程（仅医师）-->
      <el-card class="dash-card" v-if="roles.some(r => ['practitioner'].includes(r)) && myTodayAppts.length > 0">
        <template #header>
          <div class="card-header">
            <span>{{ t('dashboard.mySchedule') }}</span>
            <el-tag size="small" type="success">{{ t('dashboard.appointmentCount', { count: myTodayAppts.length }) }}</el-tag>
          </div>
        </template>
        <div class="appointment-list">
          <div
            v-for="appt in myTodayAppts"
            :key="appt.id"
            class="appt-item"
            @click="appt.patientId ? goToPatientConsultation(appt.patientId) : null"
            :style="{ cursor: appt.patientId ? 'pointer' : 'default' }"
          >
            <div class="appt-time">
              <span>{{ formatTime(appt.startTime) }}</span>
            </div>
            <div class="appt-info">
              <div class="appt-name">{{ appt.serviceType === 'time_block' ? ('🚫 ' + (appt.notes || '时间占用')) : appt.patient?.name }}</div>
              <div class="appt-service">{{ appt.serviceType === 'time_block' ? '时间占用' : appt.serviceLabel }}</div>
            </div>
            <el-tag :type="STATUS_MAP[appt.status]?.type" size="small">
              {{ t('appointmentStatus.' + appt.status) }}
            </el-tag>
          </div>
        </div>
      </el-card>

      <!-- 最近诊疗记录 -->
      <el-card class="dash-card" v-if="roles.some(r => ['admin', 'practitioner'].includes(r))">
        <template #header>
          <div class="card-header">
            <span>{{ t('dashboard.recentConsultations') }}</span>
          </div>
        </template>
        <div v-if="recentConsultations.length === 0" class="empty-state">
          <el-empty :description="t('dashboard.noConsultations')" :image-size="60" />
        </div>
        <div v-else>
          <div
            v-for="c in recentConsultations"
            :key="c.id"
            class="consult-item"
            @click="goToConsultation(c)"
          >
            <div class="consult-info">
              <div class="consult-patient">{{ c.patient?.name || '-' }}</div>
              <div class="consult-chief">{{ c.chiefComplaint || t('dashboard.noChiefComplaint') }}</div>
            </div>
            <div class="consult-meta">
              <div class="consult-date">{{ formatDate(c.date) }}</div>
              <el-tag :type="getConsultStatusType(c)" size="small">
                {{ getPaymentStatus(c) === 'paid' ? t('consultation.paymentStatusPaid') : t('consultStatus.' + c.status) }}
              </el-tag>
            </div>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 100%;
}

.welcome-bar {
  margin-bottom: 20px;
}

.welcome-title {
  font-size: 22px;
  font-weight: 700;
  color: #1b4332;
}

.welcome-date {
  font-size: 13px;
  color: #888;
  margin-top: 4px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.stat-card.green .stat-icon { background: #d8f3dc; color: #2d6a4f; }
.stat-card.blue .stat-icon { background: #dbeafe; color: #1d4ed8; }
.stat-card.orange .stat-icon { background: #fed7aa; color: #c2410c; }
.stat-card.red .stat-icon { background: #fee2e2; color: #dc2626; }

.stat-number {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  line-height: 1;
}

.stat-label {
  font-size: 13px;
  color: #888;
  margin-top: 4px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.dash-card {
  border-radius: 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
}

.appointment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.appt-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.appt-item:hover {
  background: #f5f5f5;
}

.appt-time {
  font-size: 13px;
  font-weight: 600;
  color: #2d6a4f;
  min-width: 70px;
  white-space: nowrap;
}

.appt-end {
  color: #999;
  font-weight: 400;
}

.appt-info {
  flex: 1;
}

.appt-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.appt-service {
  font-size: 12px;
  color: #888;
  margin-top: 2px;
}

.prescription-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.prescription-item:last-child {
  border-bottom: none;
}

.rx-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rx-patient {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.rx-formula {
  font-size: 12px;
  color: #888;
}

.stock-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid #f5f5f5;
  font-size: 14px;
}

.stock-item:last-child {
  border-bottom: none;
}

.stock-name {
  color: #333;
}

.stock-qty {
  font-weight: 600;
  color: #e9c46a;
}

.stock-qty.critical {
  color: #e63946;
}

.consult-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
  transition: background 0.2s;
}
.consult-item:hover { background: #f5f5f5; }
.consult-item:last-child { border-bottom: none; }
.consult-patient { font-size: 14px; font-weight: 600; color: #333; }
.consult-chief { font-size: 12px; color: #888; margin-top: 2px; }
.consult-meta { text-align: right; }
.consult-date { font-size: 12px; color: #aaa; margin-bottom: 4px; }
</style>
