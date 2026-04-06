<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppointmentsStore } from '../../stores/appointments'
import { usePatientsStore } from '../../stores/patients'
import { useAuthStore } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'
import { useBranchesStore } from '../../stores/branches'
import { hasPermission, canPractitionerProvideService } from '../../utils/permissions'
import { formatDate, formatTime, formatDateTime, dayjs } from '../../utils/dateUtils'
import {
  WEEKDAYS,
  createEmptyWorkingRange,
  normalizeWorkingHoursForForm,
  buildWorkingHoursPayload,
  validateWorkingHours,
} from '../../utils/workingHours'
import { SERVICE_TYPES } from '../../utils/sampleData'
import { useEmailSimulator } from '../../utils/emailSimulator'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t, te } = useI18n()

const SLOT_MINUTES = 30
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }

const appointmentsStore = useAppointmentsStore()
const patientsStore = usePatientsStore()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const branchesStore = useBranchesStore()
const { showEmailDialog, emailData, openEmailPreview, sendEmail, buildAppointmentConfirmEmail } = useEmailSimulator()

const roles = computed(() => authStore.roles)
const canCreate = computed(() => hasPermission(roles.value, 'appointment.create'))
const canCancel = computed(() => hasPermission(roles.value, 'appointment.cancel'))
const canEditOwnSchedule = computed(() => roles.value.includes('practitioner') || roles.value.includes('doctor'))

const currentDate = ref(new Date())
const weekStart = computed(() => dayjs(currentDate.value).startOf('week'))
const weekDays = computed(() => Array.from({ length: 7 }, (_, index) => weekStart.value.add(index, 'day').toDate()))
function prevWeek() { currentDate.value = dayjs(currentDate.value).subtract(7, 'day').toDate() }
function nextWeek() { currentDate.value = dayjs(currentDate.value).add(7, 'day').toDate() }
function goToday() { currentDate.value = new Date() }
function isToday(date) { return dayjs(date).isSame(dayjs(), 'day') }

function toMinutes(timeText) {
  const [hours, minutes] = String(timeText || '').split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function toSlotLabel(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function buildCellKey(date, totalMinutes) {
  return `${dayjs(date).format('YYYY-MM-DD')} ${toSlotLabel(totalMinutes)}`
}

function buildSlotDateTime(date, totalMinutes) {
  return dayjs(date).startOf('day').add(totalMinutes, 'minute').format('YYYY-MM-DD HH:mm:ss')
}

function addWorkingRangeTo(workingHours, day) {
  if (!Array.isArray(workingHours[day])) workingHours[day] = []
  workingHours[day].push(createEmptyWorkingRange())
}

function removeWorkingRangeFrom(workingHours, day, index) {
  if (!Array.isArray(workingHours[day])) return
  workingHours[day].splice(index, 1)
  if (workingHours[day].length === 0) workingHours[day] = [createEmptyWorkingRange()]
}

function getWorkingHoursValidationMessage(result) {
  if (!result || result.ok) return ''
  switch (result.code) {
    case 'incomplete':
      return t('admin.workingHoursIncomplete')
    case 'granularity':
      return t('admin.workingHoursGranularity')
    case 'order':
      return t('admin.workingHoursInvalidRange')
    case 'overlap':
      return t('admin.workingHoursOverlap')
    default:
      return t('admin.workingHoursInvalid')
  }
}

function getServiceTypeConfig(serviceType) {
  return settingsStore.serviceTypes?.[serviceType] || SERVICE_TYPES[serviceType] || {}
}

function getServiceTypeLabel(serviceType, fallback = '') {
  const translationKey = `appointments.serviceTypes.${serviceType}`
  if (te(translationKey)) return t(translationKey)
  return fallback || getServiceTypeConfig(serviceType)?.label || serviceType
}

const serviceOptions = computed(() => {
  const source = Object.keys(settingsStore.serviceTypes || {}).length > 0 ? settingsStore.serviceTypes : SERVICE_TYPES
  return Object.entries(source).map(([key, config]) => ({
    key,
    label: getServiceTypeLabel(key, config?.label),
    duration: Number(config?.duration || 0),
    roomRequired: Boolean(config?.roomRequired),
  }))
})

function getAppointmentWithInfo(appointment) {
  return {
    ...appointment,
    patient: patientsStore.getPatient(appointment.patientId),
    practitioner: authStore.getUserById(appointment.practitionerId),
    room: settingsStore.rooms.find((room) => room.id === appointment.roomId),
    serviceLabel: getServiceTypeLabel(appointment.serviceType),
  }
}

const practitioners = computed(() => authStore.getPractitioners())
const filterPractitioner = ref('')

watch(practitioners, (items) => {
  if (filterPractitioner.value || !canEditOwnSchedule.value) return
  const mine = String(authStore.userId || '')
  if (items.some((item) => String(item.id) === mine)) filterPractitioner.value = mine
}, { immediate: true })

const selectedPractitioner = computed(() => authStore.getUserById(filterPractitioner.value) || null)

function getWorkingRanges(practitioner, date) {
  const weekdayKey = WEEKDAY_KEYS[dayjs(date).day()]
  const rawRanges = Array.isArray(practitioner?.workingHours?.[weekdayKey]) ? practitioner.workingHours[weekdayKey] : []
  return rawRanges
    .map((range) => {
      const startMinutes = toMinutes(range?.start)
      const endMinutes = toMinutes(range?.end)
      if (startMinutes == null || endMinutes == null || startMinutes >= endMinutes) return null
      return { startMinutes, endMinutes }
    })
    .filter(Boolean)
}

function isWorkingSlot(date, totalMinutes) {
  if (!selectedPractitioner.value) return false
  const slotEnd = totalMinutes + SLOT_MINUTES
  return getWorkingRanges(selectedPractitioner.value, date).some((range) => totalMinutes >= range.startMinutes && slotEnd <= range.endMinutes)
}

const weekAppointments = computed(() => {
  const start = weekStart.value.startOf('day')
  const end = weekStart.value.add(6, 'day').endOf('day')
  return appointmentsStore.getBranchAppointments(branchesStore.currentBranchId)
    .filter((appointment) => appointment.status !== 'cancelled')
    .filter((appointment) => {
      if (filterPractitioner.value && String(appointment.practitionerId) !== String(filterPractitioner.value)) return false
      const startTime = dayjs(appointment.startTime)
      return startTime.isValid() && !startTime.isBefore(start) && !startTime.isAfter(end)
    })
    .sort((left, right) => new Date(left.startTime) - new Date(right.startTime))
})

const timeSlots = computed(() => {
  let minMinutes = 8 * 60
  let maxMinutes = 18 * 60
  weekDays.value.forEach((day) => {
    getWorkingRanges(selectedPractitioner.value, day).forEach((range) => {
      minMinutes = Math.min(minMinutes, range.startMinutes)
      maxMinutes = Math.max(maxMinutes, range.endMinutes)
    })
  })
  weekAppointments.value.forEach((appointment) => {
    const startTime = dayjs(appointment.startTime)
    const endTime = dayjs(appointment.endTime)
    if (!startTime.isValid() || !endTime.isValid()) return
    minMinutes = Math.min(minMinutes, startTime.hour() * 60 + startTime.minute())
    maxMinutes = Math.max(maxMinutes, endTime.hour() * 60 + endTime.minute())
  })
  const slots = []
  for (let total = Math.max(0, minMinutes); total < Math.max(minMinutes + SLOT_MINUTES, maxMinutes); total += SLOT_MINUTES) {
    slots.push({ total, label: toSlotLabel(total) })
  }
  return slots
})

const appointmentStartMap = computed(() => {
  const map = new Map()
  weekAppointments.value.forEach((appointment) => {
    const startTime = dayjs(appointment.startTime)
    if (!startTime.isValid()) return
    const key = buildCellKey(startTime, startTime.hour() * 60 + startTime.minute())
    const list = map.get(key) || []
    list.push(getAppointmentWithInfo(appointment))
    map.set(key, list)
  })
  return map
})

const occupiedCellSet = computed(() => {
  const set = new Set()
  weekAppointments.value.forEach((appointment) => {
    let cursor = dayjs(appointment.startTime)
    const end = dayjs(appointment.endTime)
    while (cursor.isValid() && end.isValid() && cursor.isBefore(end)) {
      set.add(buildCellKey(cursor, cursor.hour() * 60 + cursor.minute()))
      cursor = cursor.add(SLOT_MINUTES, 'minute')
    }
  })
  return set
})

function getCellAppointments(date, totalMinutes) {
  return appointmentStartMap.value.get(buildCellKey(date, totalMinutes)) || []
}

function isCellOccupied(date, totalMinutes) {
  return occupiedCellSet.value.has(buildCellKey(date, totalMinutes))
}

function getCellClass(date, totalMinutes) {
  return {
    working: isWorkingSlot(date, totalMinutes),
    occupied: isCellOccupied(date, totalMinutes),
    clickable: canCreate.value && (!filterPractitioner.value || (isWorkingSlot(date, totalMinutes) && !isCellOccupied(date, totalMinutes))),
  }
}

const showCreateDialog = ref(false)
const selectedSlotValue = ref('')
const preferredSlotStartTime = ref('')
const availabilityLoading = ref(false)
const availabilityState = ref({ slots: [], duration: 0 })
let availabilityRequestId = 0

const newAppt = ref({
  patientId: '',
  practitionerId: '',
  roomId: '',
  serviceType: 'acupuncture_new',
  date: dayjs().format('YYYY-MM-DD'),
  notes: '',
  intakeFormData: { chiefComplaint: '', allergies: '', currentMedications: '', medicalHistory: '' },
})

watch(serviceOptions, (options) => {
  if (!options.length) return
  if (!options.some((option) => option.key === newAppt.value.serviceType)) {
    newAppt.value.serviceType = options[0].key
  }
}, { immediate: true })

const selectedServiceConfig = computed(() => getServiceTypeConfig(newAppt.value.serviceType))
const requiresRoomSelection = computed(() => Boolean(selectedServiceConfig.value?.roomRequired))
const practitionerOptions = computed(() => practitioners.value.filter((item) => canPractitionerProvideService(item, newAppt.value.serviceType)))
const availabilitySlots = computed(() => Array.isArray(availabilityState.value.slots) ? availabilityState.value.slots : [])
const selectedAvailabilitySlot = computed(() => availabilitySlots.value.find((slot) => slot.startTime === selectedSlotValue.value) || null)
const appointmentEndTimeLabel = computed(() => selectedAvailabilitySlot.value?.endTime ? formatTime(selectedAvailabilitySlot.value.endTime) : '')

watch([() => newAppt.value.serviceType, practitionerOptions], () => {
  if (newAppt.value.practitionerId && !practitionerOptions.value.some((item) => String(item.id) === String(newAppt.value.practitionerId))) {
    newAppt.value.practitionerId = ''
  }
  if (!requiresRoomSelection.value) newAppt.value.roomId = ''
})

function openCreateDialog({ date, practitionerId, preferredStartTime } = {}) {
  newAppt.value = {
    patientId: '',
    practitionerId: practitionerId ?? filterPractitioner.value ?? '',
    roomId: '',
    serviceType: serviceOptions.value[0]?.key || 'acupuncture_new',
    date: date || dayjs(currentDate.value).format('YYYY-MM-DD'),
    notes: '',
    intakeFormData: { chiefComplaint: '', allergies: '', currentMedications: '', medicalHistory: '' },
  }
  preferredSlotStartTime.value = preferredStartTime || ''
  selectedSlotValue.value = ''
  showCreateDialog.value = true
}

function closeCreateDialog() {
  showCreateDialog.value = false
  preferredSlotStartTime.value = ''
  selectedSlotValue.value = ''
}

function handleScheduleCellClick(date, totalMinutes) {
  if (!canCreate.value) return
  if (filterPractitioner.value && (!isWorkingSlot(date, totalMinutes) || isCellOccupied(date, totalMinutes))) return
  openCreateDialog({
    date: dayjs(date).format('YYYY-MM-DD'),
    practitionerId: filterPractitioner.value || '',
    preferredStartTime: filterPractitioner.value ? buildSlotDateTime(date, totalMinutes) : '',
  })
}

function syncSelectedSlot() {
  if (!availabilitySlots.value.length) {
    selectedSlotValue.value = ''
    return
  }
  if (preferredSlotStartTime.value && availabilitySlots.value.some((slot) => slot.startTime === preferredSlotStartTime.value)) {
    selectedSlotValue.value = preferredSlotStartTime.value
    preferredSlotStartTime.value = ''
    return
  }
  if (!availabilitySlots.value.some((slot) => slot.startTime === selectedSlotValue.value)) {
    selectedSlotValue.value = availabilitySlots.value[0].startTime
  }
}

watch(availabilitySlots, syncSelectedSlot)

async function loadAvailability() {
  if (!showCreateDialog.value) return
  availabilityRequestId += 1
  const requestId = availabilityRequestId

  if (!newAppt.value.date || !newAppt.value.serviceType || (requiresRoomSelection.value && !newAppt.value.roomId)) {
    availabilityState.value = { slots: [], duration: Number(selectedServiceConfig.value?.duration || 0) }
    selectedSlotValue.value = ''
    return
  }

  availabilityLoading.value = true
  try {
    const response = await appointmentsStore.getAvailability({
      date: newAppt.value.date,
      serviceType: newAppt.value.serviceType,
      practitionerId: newAppt.value.practitionerId || null,
      roomId: requiresRoomSelection.value ? newAppt.value.roomId : null,
    })
    if (requestId !== availabilityRequestId) return
    availabilityState.value = { slots: response?.slots || [], duration: Number(response?.duration || 0) }
    syncSelectedSlot()
  } catch (error) {
    if (requestId !== availabilityRequestId) return
    availabilityState.value = { slots: [], duration: Number(selectedServiceConfig.value?.duration || 0) }
    selectedSlotValue.value = ''
    ElMessage.error(error.message || t('common.loadFailed'))
  } finally {
    if (requestId === availabilityRequestId) availabilityLoading.value = false
  }
}

watch(
  [showCreateDialog, () => newAppt.value.date, () => newAppt.value.serviceType, () => newAppt.value.practitionerId, () => newAppt.value.roomId],
  ([visible]) => {
    if (!visible) return
    void loadAvailability()
  },
)

function getAvailablePractitionerNames(slot) {
  return (slot?.availablePractitionerIds || []).map((id) => authStore.getUserById(id)?.name || id).join(', ')
}

async function createAppointment() {
  if (!newAppt.value.patientId) return ElMessage.warning(t('appointments.selectPatient'))
  if (!newAppt.value.serviceType) return ElMessage.warning(t('appointments.selectServiceType'))
  if (requiresRoomSelection.value && !newAppt.value.roomId) return ElMessage.warning(t('appointments.selectRoomFirst'))
  if (!selectedAvailabilitySlot.value) {
    return ElMessage.warning(availabilitySlots.value.length ? t('appointments.selectStartTime') : t('appointments.noAvailableSlots'))
  }

  try {
    const created = await appointmentsStore.createAppointment({
      ...newAppt.value,
      practitionerId: newAppt.value.practitionerId || selectedAvailabilitySlot.value.assignedPractitionerId || null,
      roomId: requiresRoomSelection.value ? newAppt.value.roomId : null,
      startTime: selectedAvailabilitySlot.value.startTime,
      endTime: selectedAvailabilitySlot.value.endTime,
      branchId: branchesStore.currentBranchId || null,
    })
    const patient = patientsStore.getPatient(created.patientId)
    const practitioner = authStore.getUserById(created.practitionerId)
    const emailContent = buildAppointmentConfirmEmail(patient, created, practitioner, getServiceTypeLabel(created.serviceType))
    if (patient?.emails?.[0] || patient?.email) openEmailPreview(emailContent)
    selectedAppt.value = getAppointmentWithInfo(created)
    ElMessage.success(t('appointments.appointmentCreated'))
    closeCreateDialog()
  } catch (error) {
    ElMessage.error(error.message || t('appointments.slotUnavailable'))
  }
}

const showScheduleDrawer = ref(false)
const myScheduleForm = ref({ workingHours: normalizeWorkingHoursForForm({}) })

function openMyScheduleDrawer() {
  const currentUser = authStore.getUserById(authStore.userId) || authStore.currentUser
  myScheduleForm.value = { workingHours: normalizeWorkingHoursForForm(currentUser?.workingHours || {}) }
  showScheduleDrawer.value = true
}

async function saveMySchedule() {
  try {
    const validation = validateWorkingHours(myScheduleForm.value.workingHours)
    if (!validation.ok) {
      return ElMessage.warning(getWorkingHoursValidationMessage(validation))
    }
    const updated = await authStore.updateUser(authStore.userId, {
      workingHours: buildWorkingHoursPayload(myScheduleForm.value.workingHours),
    })
    authStore.syncUser(updated)
    showScheduleDrawer.value = false
    ElMessage.success(t('appointments.scheduleSaved'))
  } catch (error) {
    ElMessage.error(error.message || t('common.saveFailed'))
  }
}

const selectedAppt = ref(null)
const showDetailDialog = ref(false)

function viewAppt(appointment) {
  selectedAppt.value = getAppointmentWithInfo(appointment)
  showDetailDialog.value = true
}

async function cancelAppt(id) {
  try {
    await ElMessageBox.confirm(t('appointments.cancelConfirm'), t('appointments.cancelTitle'), { type: 'warning' })
    const updated = await appointmentsStore.cancelAppointment(id)
    selectedAppt.value = getAppointmentWithInfo(updated)
    showDetailDialog.value = false
    ElMessage.success(t('appointments.appointmentCancelled'))
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.message || t('appointments.slotUnavailable'))
  }
}

async function confirmAppt(id) {
  try {
    const updated = await appointmentsStore.confirmAppointment(id)
    selectedAppt.value = getAppointmentWithInfo(updated)
    if (selectedAppt.value?.patient && selectedAppt.value?.practitioner) {
      const emailContent = buildAppointmentConfirmEmail(selectedAppt.value.patient, selectedAppt.value, selectedAppt.value.practitioner, selectedAppt.value.serviceLabel)
      if (selectedAppt.value.patient?.emails?.[0] || selectedAppt.value.patient?.email) openEmailPreview(emailContent)
    }
    ElMessage.success(t('appointments.appointmentConfirmed'))
  } catch (error) {
    ElMessage.error(error.message || t('appointments.slotUnavailable'))
  }
}

const STATUS_COLORS = { booked: '#409eff', confirmed: '#2d6a4f', completed: '#889096', cancelled: '#c0c4cc' }
</script>

<template>
  <div class="appointment-view">
    <div class="appt-toolbar">
      <div class="toolbar-left">
        <el-button size="small" @click="goToday">{{ t('appointments.today') }}</el-button>
        <el-button circle size="small" :icon="'ArrowLeft'" @click="prevWeek" />
        <el-button circle size="small" :icon="'ArrowRight'" @click="nextWeek" />
        <span class="week-label">{{ formatDate(weekDays[0]) }} - {{ formatDate(weekDays[6]) }}</span>
      </div>
      <div class="toolbar-right">
        <el-select v-model="filterPractitioner" clearable size="small" style="width:180px" :placeholder="t('appointments.allPractitioners')">
          <el-option v-for="practitioner in practitioners" :key="practitioner.id" :label="practitioner.name" :value="practitioner.id" />
        </el-select>
        <el-button v-if="canEditOwnSchedule" size="small" plain @click="openMyScheduleDrawer">{{ t('appointments.mySchedule') }}</el-button>
        <el-button v-if="canCreate" type="primary" size="small" @click="openCreateDialog()">
          <el-icon><Plus /></el-icon> {{ t('appointments.newAppointment') }}
        </el-button>
      </div>
    </div>

    <div class="schedule-panel">
      <div class="schedule-meta">
        <div>
          <div class="schedule-title">{{ filterPractitioner ? t('appointments.scheduleHintFiltered') : t('appointments.scheduleHintAll') }}</div>
          <div class="schedule-subtitle">{{ filterPractitioner ? t('appointments.scheduleHintFilteredHelp') : t('appointments.scheduleHintAllHelp') }}</div>
        </div>
        <div class="schedule-legend">
          <span><i class="dot available" />{{ t('appointments.scheduleLegendAvailable') }}</span>
          <span><i class="dot booked" />{{ t('appointments.scheduleLegendBooked') }}</span>
          <span v-if="filterPractitioner"><i class="dot outside" />{{ t('appointments.scheduleLegendOutside') }}</span>
        </div>
      </div>

      <div class="schedule-scroll">
        <table class="schedule-table">
          <thead>
            <tr>
              <th>{{ t('appointments.timeAxis') }}</th>
              <th v-for="day in weekDays" :key="day" :class="{ today: isToday(day) }">
                <div>{{ dayjs(day).format('ddd') }}</div>
                <div>{{ dayjs(day).format('MM-DD') }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="slot in timeSlots" :key="slot.label">
              <td class="time-cell">{{ slot.label }}</td>
              <td
                v-for="day in weekDays"
                :key="`${day}-${slot.label}`"
                class="schedule-cell"
                :class="getCellClass(day, slot.total)"
                @click="handleScheduleCellClick(day, slot.total)"
              >
                <template v-if="getCellAppointments(day, slot.total).length">
                  <button
                    v-for="appointment in getCellAppointments(day, slot.total)"
                    :key="appointment.id"
                    type="button"
                    class="appt-chip"
                    @click.stop="viewAppt(appointment)"
                  >
                    <div>{{ formatTime(appointment.startTime) }} - {{ formatTime(appointment.endTime) }}</div>
                    <strong>{{ appointment.patient?.name || t('appointments.unknown') }}</strong>
                    <div>{{ appointment.serviceLabel }}<template v-if="!filterPractitioner"> · {{ appointment.practitioner?.name || '-' }}</template></div>
                  </button>
                </template>
                <span v-else-if="filterPractitioner && isWorkingSlot(day, slot.total) && !isCellOccupied(day, slot.total)" class="available-pill">
                  {{ t('appointments.availableLabel') }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <el-drawer
      v-model="showCreateDialog"
      :title="t('appointments.newAppointmentDialog')"
      size="640px"
      direction="rtl"
      :close-on-press-escape="true"
      @close="closeCreateDialog"
    >
      <el-form :model="newAppt" label-width="96px">
        <el-form-item :label="t('appointments.patient')" required>
          <el-select v-model="newAppt.patientId" filterable :placeholder="t('appointments.searchPatient')" style="width:100%">
            <el-option
              v-for="patient in patientsStore.activePatients"
              :key="patient.id"
              :label="patient.name + ' (' + (patient.emails?.[0] || patient.mobilePhone || '') + ')'"
              :value="patient.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item :label="t('appointments.practitioner')">
          <el-select v-model="newAppt.practitionerId" clearable :placeholder="t('appointments.allPractitioners')" style="width:100%">
            <el-option v-for="practitioner in practitionerOptions" :key="practitioner.id" :label="practitioner.name" :value="practitioner.id" />
          </el-select>
        </el-form-item>

        <el-form-item :label="t('appointments.serviceType')" required>
          <el-select v-model="newAppt.serviceType" style="width:100%">
            <el-option
              v-for="option in serviceOptions"
              :key="option.key"
              :label="option.label + ' (' + option.duration + t('appointments.minutesSuffix') + ')'"
              :value="option.key"
            />
          </el-select>
        </el-form-item>

        <el-form-item v-if="requiresRoomSelection" :label="t('appointments.room')" required>
          <el-select v-model="newAppt.roomId" :placeholder="t('appointments.selectRoom')" style="width:100%">
            <el-option v-for="room in settingsStore.activeRooms" :key="room.id" :label="room.name" :value="room.id" />
          </el-select>
        </el-form-item>

        <el-form-item :label="t('appointments.dateLabel')" required>
          <el-date-picker v-model="newAppt.date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>

        <el-form-item :label="t('appointments.startTime')" required>
          <div class="availability-wrapper">
            <div v-if="availabilityLoading" class="availability-empty">{{ t('common.loading') }}</div>
            <div v-else-if="!availabilitySlots.length" class="availability-empty">
              {{ requiresRoomSelection && !newAppt.roomId ? t('appointments.selectRoomFirst') : t('appointments.noAvailableSlots') }}
            </div>
            <div v-else class="availability-list">
              <button
                v-for="slot in availabilitySlots"
                :key="slot.startTime"
                type="button"
                class="availability-card"
                :class="{ active: selectedSlotValue === slot.startTime }"
                @click="selectedSlotValue = slot.startTime"
              >
                <div class="availability-time">{{ formatTime(slot.startTime) }} - {{ formatTime(slot.endTime) }}</div>
                <div v-if="!newAppt.practitionerId" class="availability-meta">
                  {{ t('appointments.autoAssignedPractitioner') }}{{ authStore.getUserById(slot.assignedPractitionerId)?.name || '-' }}
                </div>
                <div v-if="!newAppt.practitionerId && (slot.availablePractitionerIds || []).length > 1" class="availability-meta">
                  {{ t('appointments.matchingPractitioners') }}{{ getAvailablePractitionerNames(slot) }}
                </div>
              </button>
            </div>
            <div v-if="appointmentEndTimeLabel" class="availability-footer">{{ t('appointments.endTime') }}{{ appointmentEndTimeLabel }}</div>
          </div>
        </el-form-item>

        <el-form-item :label="t('appointments.notesLabel')">
          <el-input v-model="newAppt.notes" :placeholder="t('appointments.notesPlaceholder')" />
        </el-form-item>

        <el-divider content-position="left">
          <span class="drawer-section-label">{{ t('appointments.intakeForm') }}</span>
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
        <el-button @click="closeCreateDialog">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createAppointment">{{ t('appointments.confirmAppointment') }}</el-button>
      </template>
    </el-drawer>

    <el-drawer v-model="showScheduleDrawer" :title="t('appointments.mySchedule')" size="560px" direction="rtl">
      <div v-for="day in WEEKDAYS" :key="day" class="schedule-editor-day">
        <div class="schedule-editor-header">
          <span class="schedule-editor-title">{{ WEEKDAY_LABELS[day] }}</span>
          <el-button size="small" text type="primary" @click="addWorkingRangeTo(myScheduleForm.workingHours, day)">{{ t('admin.addWorkingRange') }}</el-button>
        </div>
        <div class="schedule-editor-list">
        <div v-for="(range, index) in myScheduleForm.workingHours[day]" :key="`${day}-${index}`" class="schedule-editor-row">
            <el-time-select v-model="range.start" start="00:00" end="23:30" step="00:30" :placeholder="t('admin.profileStartTime')" size="small" style="width:140px" />
            <span>{{ t('admin.profileRangeSeparator') }}</span>
            <el-time-select v-model="range.end" start="00:00" end="23:30" step="00:30" :placeholder="t('admin.profileEndTime')" size="small" style="width:140px" />
            <el-button size="small" text type="danger" @click="removeWorkingRangeFrom(myScheduleForm.workingHours, day, index)">{{ t('common.delete') }}</el-button>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showScheduleDrawer = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveMySchedule">{{ t('common.save') }}</el-button>
      </template>
    </el-drawer>

    <el-drawer v-model="showDetailDialog" :title="t('appointments.appointmentDetail')" size="420px" direction="rtl">
      <div v-if="selectedAppt" class="detail-panel">
        <div class="detail-row"><span class="detail-label">{{ t('appointments.patient') }}</span><span class="detail-value">{{ selectedAppt.patient?.name }}</span></div>
        <div class="detail-row"><span class="detail-label">{{ t('appointments.practitioner') }}</span><span class="detail-value">{{ selectedAppt.practitioner?.name || '-' }}</span></div>
        <div class="detail-row"><span class="detail-label">{{ t('appointments.service') }}</span><span class="detail-value">{{ selectedAppt.serviceLabel }}</span></div>
        <div class="detail-row"><span class="detail-label">{{ t('appointments.timeLabel') }}</span><span class="detail-value">{{ formatDateTime(selectedAppt.startTime) }} - {{ formatTime(selectedAppt.endTime) }}</span></div>
        <div v-if="selectedAppt.room" class="detail-row"><span class="detail-label">{{ t('appointments.room') }}</span><span class="detail-value">{{ selectedAppt.room?.name }}</span></div>
        <div class="detail-row">
          <span class="detail-label">{{ t('appointments.statusLabel') }}</span>
          <el-tag :style="{ color: STATUS_COLORS[selectedAppt.status] }" size="small">{{ t('appointmentStatus.' + selectedAppt.status) }}</el-tag>
        </div>
        <div v-if="selectedAppt.notes" class="detail-row"><span class="detail-label">{{ t('appointments.notesLabel') }}</span><span class="detail-value">{{ selectedAppt.notes }}</span></div>
      </div>
      <template #footer>
        <el-button @click="showDetailDialog = false">{{ t('common.close') }}</el-button>
        <el-button v-if="canCreate && selectedAppt?.status === 'booked'" type="success" size="small" @click="confirmAppt(selectedAppt.id)">{{ t('appointments.confirmAppt') }}</el-button>
        <el-button v-if="canCancel && ['booked', 'confirmed'].includes(selectedAppt?.status)" type="danger" size="small" @click="cancelAppt(selectedAppt.id)">{{ t('appointments.cancelAppt') }}</el-button>
        <el-button v-if="selectedAppt?.patient" type="primary" size="small" @click="$router.push(`/patients/${selectedAppt.patientId}`); showDetailDialog = false">{{ t('appointments.viewPatient') }}</el-button>
      </template>
    </el-drawer>

    <el-drawer v-model="showEmailDialog" :title="t('email.preview')" size="520px" direction="rtl">
      <el-form label-width="60px" size="small">
        <el-form-item :label="t('email.recipient')"><el-input v-model="emailData.to" /></el-form-item>
        <el-form-item :label="t('email.subject')"><el-input v-model="emailData.subject" /></el-form-item>
        <el-form-item :label="t('email.body')"><el-input v-model="emailData.body" type="textarea" :rows="10" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEmailDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="sendEmail(); ElMessage.success(t('common.emailSent'))">{{ t('common.sendEmail') }}</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.appointment-view { display:flex; flex-direction:column; gap:16px; }
.appt-toolbar, .schedule-panel { background:#fff; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
.appt-toolbar, .schedule-meta { display:flex; justify-content:space-between; gap:12px; padding:12px 16px; flex-wrap:wrap; align-items:center; }
.toolbar-left, .toolbar-right { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.week-label { font-weight:600; color:#333; }
.schedule-meta { border-bottom:1px solid #eef2f7; }
.schedule-title { font-size:14px; font-weight:700; color:#1b4332; }
.schedule-subtitle { font-size:12px; color:#6b7280; margin-top:4px; }
.schedule-legend { display:flex; gap:12px; flex-wrap:wrap; font-size:12px; color:#666; }
.schedule-legend span { display:inline-flex; align-items:center; gap:6px; }
.dot { width:10px; height:10px; border-radius:999px; display:inline-block; }
.dot.available { background:#d8f3dc; border:1px solid #95d5b2; }
.dot.booked { background:#f4a261; }
.dot.outside { background:#eceff3; }
.schedule-scroll { overflow:auto; }
.schedule-table { width:100%; min-width:920px; border-collapse:collapse; }
.schedule-table th, .schedule-table td { border:1px solid #edf2f7; vertical-align:top; }
.schedule-table th { background:#f8fafc; padding:10px 8px; text-align:center; color:#1b4332; }
.schedule-table th.today { background:#eefbf0; }
.time-cell { width:84px; padding:10px 8px; font-size:12px; font-weight:600; color:#64748b; background:#fbfdff; }
.schedule-cell { min-width:120px; min-height:54px; padding:6px; background:#fff; transition:background 0.18s ease; }
.schedule-cell.working { background:#f6fff7; }
.schedule-cell.occupied { background:#fff0e4; }
.schedule-cell.clickable:hover { background:#eefaf0; cursor:pointer; }
.appt-chip { width:100%; border:0; border-radius:8px; background:#f4a261; color:#fff; padding:8px; text-align:left; display:flex; flex-direction:column; gap:2px; cursor:pointer; }
.appt-chip + .appt-chip { margin-top:6px; }
.available-pill { display:inline-flex; padding:4px 10px; border-radius:999px; background:#d8f3dc; color:#2d6a4f; font-size:12px; font-weight:600; }
.availability-wrapper { width:100%; display:flex; flex-direction:column; gap:10px; }
.availability-empty { padding:16px; border:1px dashed #d1d5db; border-radius:10px; background:#fafafa; color:#6b7280; font-size:13px; }
.availability-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px; }
.availability-card { border:1px solid #dbeafe; background:#f8fbff; border-radius:10px; padding:12px; text-align:left; cursor:pointer; transition:all 0.18s ease; }
.availability-card.active { border-color:#2d6a4f; background:#eefaf0; box-shadow:0 0 0 1px rgba(45,106,79,0.12); }
.availability-time { font-size:14px; font-weight:700; color:#1f2937; }
.availability-meta { font-size:12px; color:#6b7280; margin-top:6px; line-height:1.45; }
.availability-footer { font-size:12px; color:#6b7280; }
.drawer-section-label { font-size:12px; color:#888; }
.schedule-editor-day { border:1px solid #eee; border-radius:10px; padding:12px; margin-bottom:12px; background:#fafafa; }
.schedule-editor-header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:10px; }
.schedule-editor-title { font-size:14px; font-weight:700; color:#1b4332; }
.schedule-editor-list { display:flex; flex-direction:column; gap:8px; }
.schedule-editor-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.detail-panel { display:flex; flex-direction:column; gap:10px; }
.detail-row { display:flex; gap:12px; align-items:flex-start; }
.detail-label { min-width:72px; font-size:13px; font-weight:600; color:#666; }
.detail-value { font-size:13px; color:#333; }

@media (max-width: 768px) {
  .appt-toolbar, .schedule-meta, .toolbar-left, .toolbar-right, .schedule-editor-header, .detail-row { flex-direction:column; align-items:flex-start; }
  .toolbar-right { width:100%; }
  .toolbar-right :deep(.el-select), .toolbar-right :deep(.el-button) { width:100%; }
  .availability-list { grid-template-columns:1fr; }
}
</style>
