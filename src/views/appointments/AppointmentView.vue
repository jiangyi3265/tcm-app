<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppointmentsStore } from '../../stores/appointments'
import { usePatientsStore } from '../../stores/patients'
import { useAuthStore } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'
import { useBranchesStore } from '../../stores/branches'
import { hasPermission } from '../../utils/permissions'
import { formatDate, formatTime, formatDateTime, dayjs } from '../../utils/dateUtils'
import { SERVICE_TYPES } from '../../utils/sampleData'
import { useEmailSimulator } from '../../utils/emailSimulator'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()

const appointmentsStore = useAppointmentsStore()
const patientsStore = usePatientsStore()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const branchesStore = useBranchesStore()
const { showEmailDialog, emailData, openEmailPreview, sendEmail, buildAppointmentConfirmEmail } = useEmailSimulator()

const roles = computed(() => authStore.roles)
const canCreate = computed(() => hasPermission(roles.value, 'appointment.create'))
const canCancel = computed(() => hasPermission(roles.value, 'appointment.cancel'))

const currentDate = ref(new Date())
const viewMode = ref('week')

const weekDays = computed(() => {
  const start = dayjs(currentDate.value).startOf('week')
  return Array.from({ length: 7 }, (_, i) => start.add(i, 'day').toDate())
})

function prevWeek() { currentDate.value = dayjs(currentDate.value).subtract(7, 'day').toDate() }
function nextWeek() { currentDate.value = dayjs(currentDate.value).add(7, 'day').toDate() }
function goToday() { currentDate.value = new Date() }

const practitioners = computed(() => authStore.getPractitioners())
const filterPractitioner = ref('')

const allAppointments = computed(() => appointmentsStore.appointments)

function getDayAppointments(date) {
  const d = dayjs(date).format('YYYY-MM-DD')
  const branchId = branchesStore.currentBranchId
  return allAppointments.value
    .filter((a) => {
      if (a.status === 'cancelled') return false
      if (filterPractitioner.value && a.practitionerId !== filterPractitioner.value) return false
      if (branchId && a.branchId && a.branchId !== branchId) return false
      return dayjs(a.startTime).format('YYYY-MM-DD') === d
    })
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
}

function getAppointmentWithInfo(appt) {
  return {
    ...appt,
    patient: patientsStore.getPatient(appt.patientId),
    practitioner: authStore.users.find((u) => u.id === appt.practitionerId),
    room: settingsStore.rooms.find((r) => r.id === appt.roomId),
    serviceLabel: SERVICE_TYPES[appt.serviceType]?.label || appt.serviceType,
  }
}

const isToday = (date) => dayjs(date).isSame(dayjs(), 'day')

// 新建预约
const showCreateDialog = ref(false)
const newAppt = ref({
  patientId: '',
  practitionerId: '',
  roomId: '',
  serviceType: 'acupuncture_new',
  date: dayjs().format('YYYY-MM-DD'),
  startHour: 9,
  startMinute: 0,
  notes: '',
  intakeFormData: {
    chiefComplaint: '',
    allergies: '',
    currentMedications: '',
    medicalHistory: '',
  },
})

const startTimeOptions = computed(() => {
  const slots = []
  for (let h = 8; h < 18; h++) {
    for (let m = 0; m < 60; m += 30) {
      slots.push({ label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, hour: h, minute: m })
    }
  }
  return slots
})

async function createAppointment() {
  if (!newAppt.value.patientId) return ElMessage.warning(t('appointments.selectPatient'))
  if (!newAppt.value.practitionerId) return ElMessage.warning(t('appointments.selectPractitionerMsg'))
  if (!newAppt.value.serviceType) return ElMessage.warning(t('appointments.selectServiceType'))

  const serviceConfig = SERVICE_TYPES[newAppt.value.serviceType]
  const startTime = dayjs(newAppt.value.date)
    .hour(newAppt.value.startHour)
    .minute(newAppt.value.startMinute)
    .second(0)
    .toISOString()
  const endTime = dayjs(startTime).add(serviceConfig.duration, 'minute').toISOString()

  const check = await appointmentsStore.isSlotAvailable(
    newAppt.value.practitionerId,
    serviceConfig.roomRequired ? newAppt.value.roomId : null,
    startTime,
    serviceConfig.duration,
  )

  if (!check.available) {
    return ElMessage.error(check.reason)
  }

  const apptData = {
    ...newAppt.value,
    startTime,
    endTime,
    roomId: serviceConfig.roomRequired ? newAppt.value.roomId : null,
    branchId: branchesStore.currentBranchId || null,
  }
  await appointmentsStore.createAppointment(apptData)

  // 邮件预览
  const patient = patientsStore.getPatient(newAppt.value.patientId)
  const practitioner = authStore.users.find(u => u.id === newAppt.value.practitionerId)
  const emailContent = buildAppointmentConfirmEmail(patient, apptData, practitioner, serviceConfig?.label || '')
  if (patient?.emails?.[0] || patient?.email) {
    openEmailPreview(emailContent)
  }

  ElMessage.success(t('appointments.appointmentCreated'))
  showCreateDialog.value = false
  resetNewAppt()
}

function resetNewAppt() {
  newAppt.value = {
    patientId: '', practitionerId: '', roomId: '', serviceType: 'acupuncture_new',
    date: dayjs().format('YYYY-MM-DD'), startHour: 9, startMinute: 0, notes: '',
    intakeFormData: { chiefComplaint: '', allergies: '', currentMedications: '', medicalHistory: '' },
  }
}

// 查看详情
const selectedAppt = ref(null)
const showDetailDialog = ref(false)

function viewAppt(appt) {
  selectedAppt.value = getAppointmentWithInfo(appt)
  showDetailDialog.value = true
}

async function cancelAppt(id) {
  try {
    await ElMessageBox.confirm(t('appointments.cancelConfirm'), t('appointments.cancelTitle'), { type: 'warning' })
    await appointmentsStore.cancelAppointment(id)
    showDetailDialog.value = false
    ElMessage.success(t('appointments.appointmentCancelled'))
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message)
  }
}

async function confirmAppt(id) {
  try {
    await appointmentsStore.confirmAppointment(id)
    if (selectedAppt.value) selectedAppt.value.status = 'confirmed'
    // 发送确认邮件
    if (selectedAppt.value) {
      const patient = selectedAppt.value.patient
      const practitioner = selectedAppt.value.practitioner
      const emailContent = buildAppointmentConfirmEmail(patient, selectedAppt.value, practitioner, selectedAppt.value.serviceLabel)
      if (patient?.emails?.[0] || patient?.email) {
        openEmailPreview(emailContent)
      }
    }
    ElMessage.success(t('appointments.appointmentConfirmed'))
  } catch (e) {
    ElMessage.error(e.message)
  }
}

const STATUS_COLORS = {
  booked: '#409eff',
  confirmed: '#2d6a4f',
  completed: '#aaa',
  cancelled: '#ccc',
}

</script>

<template>
  <div class="appointment-view">
    <!-- 工具栏 -->
    <div class="appt-toolbar">
      <div class="toolbar-left">
        <el-button @click="goToday" size="small">{{ t('appointments.today') }}</el-button>
        <el-button circle size="small" :icon="'ArrowLeft'" @click="prevWeek" />
        <el-button circle size="small" :icon="'ArrowRight'" @click="nextWeek" />
        <span class="week-label">
          {{ formatDate(weekDays[0]) }} — {{ formatDate(weekDays[6]) }}
        </span>
      </div>
      <div class="toolbar-right">
        <el-select v-model="filterPractitioner" :placeholder="t('appointments.allPractitioners')" clearable size="small" style="width: 140px">
          <el-option v-for="p in practitioners" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-button v-if="canCreate" type="primary" size="small" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon> {{ t('appointments.newAppointment') }}
        </el-button>
      </div>
    </div>

    <!-- 周视图 -->
    <div class="week-view">
      <div
        v-for="day in weekDays"
        :key="day"
        class="day-column"
        :class="{ today: isToday(day) }"
      >
        <div class="day-header">
          <div class="day-name">{{ dayjs(day).format('ddd') }}</div>
          <div class="day-date" :class="{ 'today-badge': isToday(day) }">
            {{ dayjs(day).format('D') }}
          </div>
        </div>
        <div class="day-appointments">
          <div
            v-for="appt in getDayAppointments(day)"
            :key="appt.id"
            class="appt-block"
            :style="{ borderLeftColor: STATUS_COLORS[appt.status] }"
            @click="viewAppt(appt)"
          >
            <div class="appt-time-label">{{ formatTime(appt.startTime) }}</div>
            <div class="appt-patient-name">
              {{ patientsStore.getPatient(appt.patientId)?.name || t('appointments.unknown') }}
            </div>
            <div class="appt-service-label">{{ SERVICE_TYPES[appt.serviceType]?.label }}</div>
          </div>
          <div v-if="getDayAppointments(day).length === 0" class="day-empty">
            <span>{{ t('appointments.noAppointments') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建预约抽屉 -->
    <el-drawer v-model="showCreateDialog" :title="t('appointments.newAppointmentDialog')" size="520px" direction="rtl" :close-on-press-escape="true">
      <el-form :model="newAppt" label-width="90px">
        <el-form-item :label="t('appointments.patient')" required>
          <el-select v-model="newAppt.patientId" filterable :placeholder="t('appointments.searchPatient')" style="width: 100%">
            <el-option v-for="p in patientsStore.activePatients" :key="p.id" :label="p.name + ' (' + (p.emails?.[0] || '') + ')'" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('appointments.practitioner')" required>
          <el-select v-model="newAppt.practitionerId" :placeholder="t('appointments.selectPractitioner')" style="width: 100%">
            <el-option v-for="p in practitioners" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('appointments.serviceType')" required>
          <el-select v-model="newAppt.serviceType" style="width: 100%">
            <el-option
              v-for="(config, key) in SERVICE_TYPES"
              :key="key"
              :label="config.label + ' (' + config.duration + t('appointments.minutesSuffix') + ')'"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="SERVICE_TYPES[newAppt.serviceType]?.roomRequired" :label="t('appointments.room')">
          <el-select v-model="newAppt.roomId" :placeholder="t('appointments.selectRoom')" style="width: 100%">
            <el-option v-for="r in settingsStore.activeRooms" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('appointments.dateLabel')" required>
          <el-date-picker v-model="newAppt.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('appointments.startTime')" required>
          <el-select v-model="newAppt.startHour" style="width: 90px" :placeholder="t('appointments.hour')">
            <el-option v-for="h in Array.from({length:10},(_,i)=>i+8)" :key="h" :label="String(h).padStart(2,'0')" :value="h" />
          </el-select>
          <span style="margin: 0 6px">:</span>
          <el-select v-model="newAppt.startMinute" style="width: 80px" :placeholder="t('appointments.minute')">
            <el-option v-for="m in [0,15,30,45]" :key="m" :label="String(m).padStart(2,'0')" :value="m" />
          </el-select>
          <span v-if="newAppt.serviceType" style="margin-left: 10px; font-size: 12px; color: #888">
            {{ t('appointments.endTime') }}{{ dayjs(newAppt.date).hour(newAppt.startHour).minute(newAppt.startMinute).add(SERVICE_TYPES[newAppt.serviceType]?.duration,'minute').format('HH:mm') }}
          </span>
        </el-form-item>
        <el-form-item :label="t('appointments.notesLabel')">
          <el-input v-model="newAppt.notes" :placeholder="t('appointments.notesPlaceholder')" />
        </el-form-item>
        <el-divider content-position="left">
          <span style="font-size:12px; color:#888">{{ t('appointments.intakeForm') }}</span>
        </el-divider>
        <el-form-item :label="t('appointments.chiefComplaint')">
          <el-input v-model="newAppt.intakeFormData.chiefComplaint" :placeholder="t('appointments.chiefComplaintPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('appointments.allergies')">
          <el-input v-model="newAppt.intakeFormData.allergies" :placeholder="t('appointments.allergiesPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('appointments.currentMedications')">
          <el-input v-model="newAppt.intakeFormData.currentMedications" :placeholder="t('appointments.currentMedicationsPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('appointments.medicalHistory')">
          <el-input v-model="newAppt.intakeFormData.medicalHistory" type="textarea" :rows="2" :placeholder="t('appointments.medicalHistoryPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false; resetNewAppt()">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createAppointment">{{ t('appointments.confirmAppointment') }}</el-button>
      </template>
    </el-drawer>

    <!-- 预约详情抽屉 -->
    <el-drawer v-model="showDetailDialog" :title="t('appointments.appointmentDetail')" size="420px" direction="rtl">
      <div v-if="selectedAppt" class="appt-detail">
        <div class="detail-row">
          <span class="detail-label">{{ t('appointments.patient') }}</span>
          <span class="detail-value">{{ selectedAppt.patient?.name }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">{{ t('appointments.practitioner') }}</span>
          <span class="detail-value">{{ selectedAppt.practitioner?.name }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">{{ t('appointments.service') }}</span>
          <span class="detail-value">{{ selectedAppt.serviceLabel }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">{{ t('appointments.timeLabel') }}</span>
          <span class="detail-value">{{ formatDateTime(selectedAppt.startTime) }} — {{ formatTime(selectedAppt.endTime) }}</span>
        </div>
        <div class="detail-row" v-if="selectedAppt.room">
          <span class="detail-label">{{ t('appointments.room') }}</span>
          <span class="detail-value">{{ selectedAppt.room?.name }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">{{ t('appointments.statusLabel') }}</span>
          <el-tag :style="{ color: STATUS_COLORS[selectedAppt.status] }" size="small">
            {{ t('appointmentStatus.' + selectedAppt.status) }}
          </el-tag>
        </div>
        <div class="detail-row" v-if="selectedAppt.notes">
          <span class="detail-label">{{ t('appointments.notesLabel') }}</span>
          <span class="detail-value">{{ selectedAppt.notes }}</span>
        </div>
        <div v-if="selectedAppt.intakeFormData && (selectedAppt.intakeFormData.chiefComplaint || selectedAppt.intakeFormData.allergies || selectedAppt.intakeFormData.currentMedications || selectedAppt.intakeFormData.medicalHistory)" style="margin-top:8px; padding-top:8px; border-top:1px solid #f0f0f0">
          <div style="font-size:12px; font-weight:600; color:#888; margin-bottom:6px">INTAKE FORM</div>
          <div v-if="selectedAppt.intakeFormData.chiefComplaint" class="detail-row">
            <span class="detail-label">{{ t('appointments.chiefComplaint') }}</span>
            <span class="detail-value">{{ selectedAppt.intakeFormData.chiefComplaint }}</span>
          </div>
          <div v-if="selectedAppt.intakeFormData.allergies" class="detail-row">
            <span class="detail-label">{{ t('appointments.allergies') }}</span>
            <span class="detail-value">{{ selectedAppt.intakeFormData.allergies }}</span>
          </div>
          <div v-if="selectedAppt.intakeFormData.currentMedications" class="detail-row">
            <span class="detail-label">{{ t('appointments.currentMedications') }}</span>
            <span class="detail-value">{{ selectedAppt.intakeFormData.currentMedications }}</span>
          </div>
          <div v-if="selectedAppt.intakeFormData.medicalHistory" class="detail-row">
            <span class="detail-label">{{ t('appointments.medicalHistory') }}</span>
            <span class="detail-value">{{ selectedAppt.intakeFormData.medicalHistory }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showDetailDialog = false">{{ t('common.close') }}</el-button>
        <el-button
          v-if="canCreate && selectedAppt?.status === 'booked'"
          type="success"
          size="small"
          @click="confirmAppt(selectedAppt.id)"
        >{{ t('appointments.confirmAppt') }}</el-button>
        <el-button
          v-if="canCancel && ['booked','confirmed'].includes(selectedAppt?.status)"
          type="danger"
          size="small"
          @click="cancelAppt(selectedAppt.id)"
        >{{ t('appointments.cancelAppt') }}</el-button>
        <el-button
          v-if="selectedAppt?.patient"
          type="primary"
          size="small"
          @click="$router.push(`/patients/${selectedAppt.patientId}`); showDetailDialog = false"
        >{{ t('appointments.viewPatient') }}</el-button>
      </template>
    </el-drawer>

    <!-- 邮件预览抽屉 -->
    <el-drawer v-model="showEmailDialog" :title="t('email.preview')" size="520px" direction="rtl">
      <el-form label-width="60px" size="small">
        <el-form-item :label="t('email.recipient')">
          <el-input v-model="emailData.to" />
        </el-form-item>
        <el-form-item :label="t('email.subject')">
          <el-input v-model="emailData.subject" />
        </el-form-item>
        <el-form-item :label="t('email.body')">
          <el-input v-model="emailData.body" type="textarea" :rows="10" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEmailDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="sendEmail(); ElMessage.success(t('common.emailSent'))">{{ t('common.sendEmail') }}</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.appointment-view { max-width: 1200px; }

.appt-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  padding: 12px 16px;
  border-radius: 10px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 8px; }
.week-label { font-size: 14px; font-weight: 600; color: #333; margin-left: 4px; }

.week-view {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  min-height: 500px;
}

.day-column {
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
  min-height: 400px;
}

.day-column.today {
  border: 2px solid #2d6a4f;
}

.day-header {
  padding: 10px;
  text-align: center;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
}

.day-name {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  font-weight: 500;
}

.day-date {
  font-size: 18px;
  font-weight: 700;
  color: #333;
  margin-top: 2px;
  line-height: 1.2;
}

.today-badge {
  width: 32px;
  height: 32px;
  background: #2d6a4f;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  font-size: 15px;
}

.day-appointments {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.appt-block {
  padding: 8px 10px;
  background: #f0faf5;
  border-radius: 6px;
  border-left: 3px solid #2d6a4f;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 12px;
}

.appt-block:hover { background: #d8f3dc; }

.appt-time-label { font-weight: 600; color: #2d6a4f; margin-bottom: 2px; }
.appt-patient-name { font-weight: 600; color: #333; }
.appt-service-label { color: #888; margin-top: 1px; }

.day-empty {
  text-align: center;
  padding: 20px 0;
  color: #ccc;
  font-size: 12px;
}

.appt-detail { display: flex; flex-direction: column; gap: 10px; }
.detail-row { display: flex; gap: 12px; align-items: flex-start; }
.detail-label { font-weight: 600; color: #666; min-width: 50px; font-size: 13px; }
.detail-value { font-size: 13px; color: #333; }

@media (max-width: 768px) {
  .week-view {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .day-column { min-height: auto; }
  .day-header { padding: 6px 10px; display: flex; align-items: center; gap: 6px; }
  .day-name { font-size: 10px; }
  .day-date { font-size: 14px; margin-top: 0; }
  .today-badge { width: 24px; height: 24px; font-size: 12px; }
  .appt-block { padding: 10px 12px; }
  .toolbar-left, .toolbar-right { width: 100%; justify-content: center; }
  .week-label { font-size: 12px; }
}
</style>
