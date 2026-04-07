<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { publicBookingApi } from '../../utils/api'
import { dayjs, formatDate, formatTime } from '../../utils/dateUtils'

const { t } = useI18n()

const SLOT_MINUTES = 30

const loading = ref(true)
const scheduleLoading = ref(false)
const serviceTypes = ref([])
const practitioners = ref([])
const rooms = ref([])
const scheduleSlots = ref([])
const selectedSlotValue = ref('')
const successState = ref(null)

function alignWeekStart(value) {
  const date = dayjs(value || undefined)
  const mondayOffset = (date.day() + 6) % 7
  return date.subtract(mondayOffset, 'day').startOf('day').toDate()
}

const currentWeek = ref(alignWeekStart(dayjs()))

const form = ref({
  patientName: '',
  phone: '',
  email: '',
  practitionerId: '',
  roomId: '',
  serviceType: '',
  notes: '',
  intakeFormData: {
    chiefComplaint: '',
    allergies: '',
    currentMedications: '',
    medicalHistory: '',
  },
})

const selectedService = computed(() => serviceTypes.value.find((item) => item.key === form.value.serviceType) || null)
const requiresRoomSelection = computed(() => Boolean(selectedService.value?.roomRequired))
const activeRooms = computed(() => rooms.value.filter((item) => item?.isActive !== false))
const practitionerOptions = computed(() =>
  practitioners.value.filter((item) => {
    const serviceKeys = Array.isArray(item.serviceKeys) ? item.serviceKeys : []
    return !form.value.serviceType || serviceKeys.length === 0 || serviceKeys.includes(form.value.serviceType)
  }),
)

const weekStart = computed(() => dayjs(alignWeekStart(currentWeek.value)))
const weekDays = computed(() => Array.from({ length: 7 }, (_, index) => weekStart.value.add(index, 'day').toDate()))
const weekLabel = computed(() => `${formatDate(weekDays.value[0])} - ${formatDate(weekDays.value[6])}`)

function prevWeek() {
  currentWeek.value = dayjs(currentWeek.value).subtract(7, 'day').toDate()
}

function nextWeek() {
  currentWeek.value = dayjs(currentWeek.value).add(7, 'day').toDate()
}

function goToday() {
  currentWeek.value = alignWeekStart(dayjs())
}

function getPractitionerName(id) {
  return practitioners.value.find((item) => String(item.id) === String(id))?.name || id || '-'
}

function getPractitionerNames(ids = []) {
  return ids
    .map((id) => getPractitionerName(id))
    .filter(Boolean)
    .join('、')
}

function parseScheduleDateTime(date, value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (text.includes('T') || text.includes(' ')) {
    const parsed = dayjs(text)
    return parsed.isValid() ? parsed : null
  }
  if (!date) return null
  const timeText = text.length === 5 ? `${text}:00` : text
  const parsed = dayjs(`${date} ${timeText}`)
  return parsed.isValid() ? parsed : null
}

function normalizeSlot(slot) {
  const start = parseScheduleDateTime(slot?.date || '', slot?.startTime || slot?.start || slot?.beginTime)
  const end = parseScheduleDateTime(slot?.date || '', slot?.endTime || slot?.end || slot?.finishTime)
  if (!start || !end) return null

  const statusText = String(slot?.status || '').toLowerCase()
  let status = statusText
  if (!status) {
    if (slot?.occupied || slot?.booked || slot?.isBooked || slot?.appointmentId || slot?.patientId) {
      status = 'booked'
    } else if (slot?.available === true || slot?.isAvailable === true || slot?.canBook === true) {
      status = 'available'
    } else {
      status = 'working'
    }
  }
  if (status === 'reserved') status = 'booked'
  if (status === 'free') status = 'available'
  if (!['off', 'working', 'booked', 'available'].includes(status)) status = 'working'

  return {
    ...slot,
    date: slot?.date || start.format('YYYY-MM-DD'),
    startTime: start.format('YYYY-MM-DD HH:mm:ss'),
    endTime: end.format('YYYY-MM-DD HH:mm:ss'),
    startMinutes: start.hour() * 60 + start.minute(),
    endMinutes: end.hour() * 60 + end.minute(),
    status,
    assignedPractitionerId: slot?.assignedPractitionerId ?? slot?.practitionerId ?? null,
    availablePractitionerIds: Array.isArray(slot?.availablePractitionerIds) ? slot.availablePractitionerIds : [],
  }
}

function collectSlots(response) {
  const rawSlots = Array.isArray(response?.slots)
    ? response.slots
    : Array.isArray(response?.cells)
      ? response.cells
      : Array.isArray(response?.days)
        ? response.days.flatMap((day) => Array.isArray(day?.slots)
          ? day.slots.map((slot) => ({ ...slot, date: slot?.date || day?.date }))
          : [])
        : []
  return rawSlots.map(normalizeSlot).filter(Boolean)
}

function getStatusPriority(status) {
  if (status === 'booked' || status === 'occupied') return 0
  if (status === 'available') return 1
  if (status === 'working') return 2
  if (status === 'off') return 3
  return 3
}

const gridBounds = computed(() => {
  const relevantSlots = scheduleSlots.value.filter((slot) => slot.status !== 'off')
  if (!relevantSlots.length) {
    return { startMinutes: 8 * 60, endMinutes: 18 * 60 }
  }
  const startMinutes = Math.max(0, Math.floor(Math.min(...relevantSlots.map((slot) => slot.startMinutes)) / SLOT_MINUTES) * SLOT_MINUTES)
  const endMinutes = Math.min(24 * 60, Math.ceil(Math.max(...relevantSlots.map((slot) => slot.endMinutes)) / SLOT_MINUTES) * SLOT_MINUTES)
  return {
    startMinutes,
    endMinutes: endMinutes > startMinutes ? endMinutes : startMinutes + SLOT_MINUTES,
  }
})

const timeRows = computed(() => {
  const rows = []
  for (let minute = gridBounds.value.startMinutes; minute < gridBounds.value.endMinutes; minute += SLOT_MINUTES) {
    rows.push(minute)
  }
  return rows
})

function buildCellKey(date, totalMinutes) {
  return `${dayjs(date).format('YYYY-MM-DD')} ${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}

const slotCoverageMap = computed(() => {
  const map = new Map()
  scheduleSlots.value.forEach((slot) => {
    let cursor = dayjs(slot.startTime)
    const end = dayjs(slot.endTime)
    while (cursor.isValid() && end.isValid() && cursor.isBefore(end)) {
      const key = buildCellKey(cursor, cursor.hour() * 60 + cursor.minute())
      const list = map.get(key) || []
      list.push(slot)
      map.set(key, list)
      cursor = cursor.add(SLOT_MINUTES, 'minute')
    }
  })
  return map
})

const slotStartMap = computed(() => {
  const map = new Map()
  scheduleSlots.value.forEach((slot) => {
    map.set(buildCellKey(slot.startTime, slot.startMinutes), slot)
  })
  return map
})

function getCellSlots(date, totalMinutes) {
  return slotCoverageMap.value.get(buildCellKey(date, totalMinutes)) || []
}

function getPrimaryCellSlot(date, totalMinutes) {
  return slotStartMap.value.get(buildCellKey(date, totalMinutes)) || null
}

function getCoveredCellSlot(date, totalMinutes) {
  const slots = getCellSlots(date, totalMinutes)
  return slots.slice().sort((left, right) => getStatusPriority(left.status) - getStatusPriority(right.status))[0] || null
}

function getCellStatus(date, totalMinutes) {
  const startSlot = getPrimaryCellSlot(date, totalMinutes)
  if (startSlot) return startSlot.status || 'empty'
  const coveredSlot = getCoveredCellSlot(date, totalMinutes)
  if (!coveredSlot) return 'empty'
  return coveredSlot.status || 'empty'
}

function getCellClass(date, totalMinutes) {
  const status = getCellStatus(date, totalMinutes)
  return {
    empty: status === 'empty',
    working: status === 'working',
    occupied: status === 'occupied' || status === 'booked',
    off: status === 'off',
    available: status === 'available',
    clickable: status === 'available' && Boolean(getPrimaryCellSlot(date, totalMinutes)),
  }
}

function isSelectedCell(date, totalMinutes) {
  return selectedSlotValue.value === getPrimaryCellSlot(date, totalMinutes)?.startTime
}

const selectedSlot = computed(() =>
  scheduleSlots.value.find((slot) => slot.startTime === selectedSlotValue.value) || null,
)

async function loadOptions() {
  loading.value = true
  try {
    const response = await publicBookingApi.options()
    serviceTypes.value = Array.isArray(response?.serviceTypes) ? response.serviceTypes : []
    practitioners.value = Array.isArray(response?.practitioners) ? response.practitioners : []
    rooms.value = Array.isArray(response?.rooms) ? response.rooms : []
    if (!form.value.serviceType && serviceTypes.value.length > 0) {
      form.value.serviceType = serviceTypes.value[0].key
    }
  } catch (error) {
    ElMessage.error(error.message || t('publicBooking.loadFailed'))
  } finally {
    loading.value = false
  }
}

watch(practitionerOptions, (items) => {
  if (form.value.practitionerId && !items.some((item) => String(item.id) === String(form.value.practitionerId))) {
    form.value.practitionerId = ''
  }
})

watch(requiresRoomSelection, (required) => {
  if (!required) form.value.roomId = ''
})

watch(activeRooms, (items) => {
  if (form.value.roomId && !items.some((item) => String(item.id) === String(form.value.roomId))) {
    form.value.roomId = ''
  }
})

let scheduleRequestId = 0

async function loadSchedule() {
  if (!form.value.serviceType || (requiresRoomSelection.value && !form.value.roomId)) {
    scheduleSlots.value = []
    selectedSlotValue.value = ''
    return
  }

  scheduleLoading.value = true
  const requestId = ++scheduleRequestId
  try {
    const response = await publicBookingApi.schedule({
      weekStart: weekStart.value.format('YYYY-MM-DD'),
      serviceType: form.value.serviceType,
      practitionerId: form.value.practitionerId || null,
      roomId: requiresRoomSelection.value ? form.value.roomId : null,
    })
    if (requestId !== scheduleRequestId) return
    if (response?.weekStart) {
      const normalizedWeekStart = alignWeekStart(response.weekStart)
      if (!dayjs(normalizedWeekStart).isSame(weekStart.value, 'day')) {
        currentWeek.value = normalizedWeekStart
      }
    }
    scheduleSlots.value = collectSlots(response)
    if (!scheduleSlots.value.some((slot) => slot.startTime === selectedSlotValue.value)) {
      selectedSlotValue.value = scheduleSlots.value.find((slot) => slot.status === 'available')?.startTime || ''
    }
  } catch (error) {
    if (requestId !== scheduleRequestId) return
    scheduleSlots.value = []
    selectedSlotValue.value = ''
    ElMessage.error(error.message || t('publicBooking.loadFailed'))
  } finally {
    if (requestId === scheduleRequestId) scheduleLoading.value = false
  }
}

watch(
  [() => form.value.serviceType, () => form.value.practitionerId, () => form.value.roomId, weekStart],
  () => { void loadSchedule() },
  { immediate: true },
)

function selectCell(date, totalMinutes) {
  const slot = getPrimaryCellSlot(date, totalMinutes)
  if (!slot || slot.status !== 'available') return
  selectedSlotValue.value = slot.startTime
}

function getSelectedCellMeta(slot) {
  if (!slot || form.value.practitionerId) return []
  const lines = []
  if (slot.assignedPractitionerId) {
    lines.push(t('publicBooking.autoAssignedPractitioner', { name: getPractitionerName(slot.assignedPractitionerId) }))
  }
  if ((slot.availablePractitionerIds || []).length > 1) {
    lines.push(t('publicBooking.matchingPractitioners', { names: getPractitionerNames(slot.availablePractitionerIds) }))
  }
  return lines
}

async function submitBooking() {
  if (!form.value.patientName.trim()) return ElMessage.warning(t('publicBooking.nameRequired'))
  if (!form.value.phone.trim()) return ElMessage.warning(t('publicBooking.phoneRequired'))
  if (!form.value.serviceType) return ElMessage.warning(t('appointments.selectServiceType'))
  if (requiresRoomSelection.value && !form.value.roomId) return ElMessage.warning(t('appointments.selectRoomFirst'))
  if (!selectedSlot.value) return ElMessage.warning(t('publicBooking.selectSlotHint'))

  try {
    const response = await publicBookingApi.create({
      patientName: form.value.patientName.trim(),
      phone: form.value.phone.trim(),
      email: form.value.email.trim(),
      practitionerId: form.value.practitionerId || selectedSlot.value.assignedPractitionerId || null,
      roomId: requiresRoomSelection.value ? form.value.roomId : null,
      serviceType: form.value.serviceType,
      startTime: selectedSlot.value.startTime,
      endTime: selectedSlot.value.endTime,
      notes: form.value.notes,
      intakeFormData: { ...form.value.intakeFormData },
    })
    successState.value = response?.appointment || {
      startTime: selectedSlot.value.startTime,
      practitionerId: selectedSlot.value.assignedPractitionerId,
    }
  } catch (error) {
    ElMessage.error(error.message || t('publicBooking.submitFailed'))
  }
}

watch(
  [() => form.value.serviceType, () => form.value.practitionerId, () => form.value.roomId],
  () => {
    selectedSlotValue.value = ''
  },
)

onMounted(() => {
  void loadOptions()
})
</script>

<template>
  <div class="public-booking-page">
    <div v-if="successState" class="public-card success-card">
      <h1>{{ t('publicBooking.successTitle') }}</h1>
      <p>{{ t('publicBooking.successIntro') }}</p>
      <p>{{ t('publicBooking.successTime', { time: `${successState.startTime}` }) }}</p>
      <p>{{ t('publicBooking.successPractitioner', { name: getPractitionerName(successState.practitionerId) }) }}</p>
      <el-button type="primary" @click="successState = null">{{ t('publicBooking.bookAnother') }}</el-button>
    </div>

    <div v-else class="public-card">
      <div class="page-head">
        <div>
          <h1>{{ t('publicBooking.pageTitle') }}</h1>
          <p>{{ t('publicBooking.pageSubtitle') }}</p>
        </div>
      </div>

      <el-skeleton v-if="loading" :rows="6" animated />

      <el-form v-else :model="form" label-position="top" class="public-form">
        <div class="grid two-col">
          <el-form-item :label="t('publicBooking.patientName')" required>
            <el-input v-model="form.patientName" :placeholder="t('publicBooking.patientNamePlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('publicBooking.phone')" required>
            <el-input v-model="form.phone" :placeholder="t('publicBooking.phonePlaceholder')" />
          </el-form-item>
        </div>

        <div class="grid two-col">
          <el-form-item :label="t('publicBooking.email')">
            <el-input v-model="form.email" :placeholder="t('publicBooking.emailPlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('appointments.serviceType')" required>
            <el-select v-model="form.serviceType" style="width:100%">
              <el-option v-for="service in serviceTypes" :key="service.key" :label="service.label" :value="service.key" />
            </el-select>
          </el-form-item>
        </div>

        <div class="grid two-col">
          <el-form-item :label="t('appointments.practitioner')">
            <el-select v-model="form.practitionerId" clearable :placeholder="t('appointments.allPractitioners')" style="width:100%">
              <el-option v-for="practitioner in practitionerOptions" :key="practitioner.id" :label="practitioner.name" :value="practitioner.id" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="requiresRoomSelection" :label="t('appointments.room')" required>
            <el-select v-model="form.roomId" :placeholder="t('appointments.selectRoom')" style="width:100%">
              <el-option v-for="room in activeRooms" :key="room.id" :label="room.name" :value="room.id" />
            </el-select>
          </el-form-item>
          <div v-else />
        </div>

        <div v-if="!form.practitionerId" class="auto-match-banner">
          {{ t('publicBooking.autoAssignHint') }}
        </div>

        <div class="schedule-head">
          <div>
            <h2>{{ t('publicBooking.weekScheduleTitle') }}</h2>
            <p>{{ t('publicBooking.weekScheduleSubtitle') }}</p>
          </div>
          <div class="week-nav">
            <el-button size="small" @click="goToday">{{ t('appointments.today') }}</el-button>
            <el-button circle size="small" @click="prevWeek">‹</el-button>
            <span class="week-label">{{ weekLabel }}</span>
            <el-button circle size="small" @click="nextWeek">›</el-button>
          </div>
        </div>

        <div class="schedule-legend">
          <span><i class="dot available" />{{ t('publicBooking.legendAvailable') }}</span>
          <span><i class="dot occupied" />{{ t('publicBooking.legendOccupied') }}</span>
          <span><i class="dot working" />{{ t('publicBooking.legendWorking') }}</span>
        </div>

        <div class="schedule-scroll">
          <div v-if="scheduleLoading" class="schedule-empty">{{ t('common.loading') }}</div>
          <div v-else-if="!timeRows.length || !scheduleSlots.length" class="schedule-empty">
            {{ requiresRoomSelection && !form.roomId ? t('appointments.selectRoomFirst') : t('publicBooking.noScheduleSlots') }}
          </div>
          <table v-else class="schedule-table">
            <thead>
              <tr>
                <th>{{ t('appointments.timeAxis') }}</th>
                <th v-for="day in weekDays" :key="day" :class="{ today: dayjs(day).isSame(dayjs(), 'day') }">
                  <div>{{ dayjs(day).format('ddd') }}</div>
                  <div>{{ dayjs(day).format('MM-DD') }}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="minute in timeRows" :key="minute">
                <td class="time-cell">{{ String(Math.floor(minute / 60)).padStart(2, '0') }}:{{ String(minute % 60).padStart(2, '0') }}</td>
                <td
                  v-for="day in weekDays"
                  :key="`${day}-${minute}`"
                  class="schedule-cell"
                  :class="getCellClass(day, minute)"
                  @click="selectCell(day, minute)"
                >
                  <template v-if="getPrimaryCellSlot(day, minute)">
                    <template v-if="getPrimaryCellSlot(day, minute).status === 'available'">
                      <button
                        type="button"
                        class="slot-card"
                        :class="{ active: isSelectedCell(day, minute) }"
                        @click.stop="selectCell(day, minute)"
                      >
                        <div class="slot-time">{{ formatTime(getPrimaryCellSlot(day, minute).startTime) }} - {{ formatTime(getPrimaryCellSlot(day, minute).endTime) }}</div>
                        <div v-for="line in getSelectedCellMeta(getPrimaryCellSlot(day, minute))" :key="line" class="slot-meta">{{ line }}</div>
                      </button>
                    </template>
                    <template v-else>
                      <div class="slot-block">
                        <div class="slot-time">{{ formatTime(getPrimaryCellSlot(day, minute).startTime) }} - {{ formatTime(getPrimaryCellSlot(day, minute).endTime) }}</div>
                        <div class="slot-status">{{ t(`publicBooking.slotStatus.${getPrimaryCellSlot(day, minute).status}`) }}</div>
                      </div>
                    </template>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="selected-slot-panel">
          <div class="selected-slot-title">{{ t('publicBooking.selectedSlotTitle') }}</div>
          <div v-if="selectedSlot" class="selected-slot-detail">
            {{ formatTime(selectedSlot.startTime) }} - {{ formatTime(selectedSlot.endTime) }}
            <span v-if="!form.practitionerId && selectedSlot.assignedPractitionerId">· {{ t('publicBooking.autoAssignedPractitioner', { name: getPractitionerName(selectedSlot.assignedPractitionerId) }) }}</span>
          </div>
          <div v-else class="selected-slot-empty">{{ t('publicBooking.selectSlotHint') }}</div>
        </div>

        <div class="grid two-col">
          <el-form-item :label="t('appointments.chiefComplaint')">
            <el-input v-model="form.intakeFormData.chiefComplaint" :placeholder="t('appointments.chiefComplaintPlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('appointments.allergies')">
            <el-input v-model="form.intakeFormData.allergies" :placeholder="t('appointments.allergiesPlaceholder')" />
          </el-form-item>
        </div>

        <el-form-item :label="t('appointments.currentMedications')">
          <el-input v-model="form.intakeFormData.currentMedications" :placeholder="t('appointments.currentMedicationsPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('appointments.medicalHistory')">
          <el-input v-model="form.intakeFormData.medicalHistory" type="textarea" :rows="2" :placeholder="t('appointments.medicalHistoryPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('appointments.notesLabel')">
          <el-input v-model="form.notes" type="textarea" :rows="2" :placeholder="t('appointments.notesPlaceholder')" />
        </el-form-item>

        <div class="actions">
          <el-button type="primary" @click="submitBooking">{{ t('publicBooking.submit') }}</el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.public-booking-page { min-height:100vh; padding:32px 16px; background:linear-gradient(180deg,#f8fafc 0%,#eef6f0 100%); }
.public-card { max-width:1180px; margin:0 auto; background:#fff; border-radius:18px; padding:24px; box-shadow:0 18px 50px rgba(15,23,42,0.08); }
.success-card { text-align:center; }
.page-head h1, .schedule-head h2 { margin:0; color:#1b4332; }
.page-head p, .schedule-head p { margin:8px 0 0; color:#64748b; }
.public-form { margin-top:20px; }
.grid { display:grid; gap:16px; }
.two-col { grid-template-columns:repeat(2,minmax(0,1fr)); }
.auto-match-banner, .selected-slot-panel, .schedule-empty { border-radius:12px; background:#f8fafc; border:1px dashed #d1d5db; padding:14px 16px; color:#475569; }
.schedule-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-top:18px; }
.week-nav { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.week-label { font-weight:700; color:#1f2937; }
.schedule-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:#64748b; margin:12px 0 8px; }
.schedule-legend span { display:inline-flex; align-items:center; gap:6px; }
.dot { width:10px; height:10px; border-radius:999px; display:inline-block; }
.dot.available { background:#d8f3dc; border:1px solid #95d5b2; }
.dot.occupied { background:#f4a261; }
.dot.working { background:#dbeafe; border:1px solid #93c5fd; }
.schedule-scroll { overflow:auto; }
.schedule-table { width:100%; min-width:920px; border-collapse:collapse; }
.schedule-table th, .schedule-table td { border:1px solid #edf2f7; vertical-align:top; }
.schedule-table th { background:#f8fafc; padding:10px 8px; text-align:center; color:#1b4332; }
.schedule-table th.today { background:#eefbf0; }
.time-cell { width:84px; padding:10px 8px; font-size:12px; font-weight:600; color:#64748b; background:#fbfdff; }
.schedule-cell { min-width:120px; min-height:58px; padding:6px; background:#fff; transition:background 0.18s ease; }
.schedule-cell.working { background:#f6fff7; }
.schedule-cell.available { background:#eefaf0; }
.schedule-cell.occupied { background:#fff4eb; }
.schedule-cell.clickable:hover { background:#e8f8ee; cursor:pointer; }
.slot-card, .slot-block { width:100%; border:0; border-radius:10px; padding:8px; text-align:left; display:flex; flex-direction:column; gap:4px; }
.slot-card { background:#fff; cursor:pointer; }
.slot-card.active { box-shadow:0 0 0 2px rgba(45,106,79,0.18); }
.slot-time { font-size:13px; font-weight:700; color:#1f2937; }
.slot-meta, .slot-status { font-size:12px; color:#64748b; line-height:1.4; }
.slot-status { color:#b45309; }
.selected-slot-panel { margin-top:14px; display:flex; flex-direction:column; gap:6px; }
.selected-slot-title { font-size:12px; font-weight:700; color:#1f2937; }
.selected-slot-detail { color:#14532d; font-weight:600; }
.selected-slot-empty { color:#64748b; }
.actions { display:flex; justify-content:flex-end; margin-top:8px; }

@media (max-width: 768px) {
  .two-col { grid-template-columns:1fr; }
  .public-card { padding:18px; }
  .schedule-head { flex-direction:column; align-items:flex-start; }
  .week-nav { width:100%; }
  .week-nav :deep(.el-button) { flex:1; }
}
</style>
