<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { publicBookingApi } from '../../utils/api'
import { dayjs, formatDate, formatTime } from '../../utils/dateUtils'
import { SERVICE_TYPES } from '../../utils/sampleData'

const { t } = useI18n()

const DEFAULT_PUBLIC_BOOKING = {
  advanceDays: 15,
  dripWindowDays: 7,
  dripMinutes: 60,
}
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const loading = ref(true)
const scheduleLoading = ref(false)
const serviceTypes = ref([])
const practitioners = ref([])
const scheduleDays = ref([])
const scheduleSlots = ref([])
const selectedDateValue = ref('')
const selectedSlotValue = ref('')
const successState = ref(null)
const publicBookingSettings = ref({ ...DEFAULT_PUBLIC_BOOKING })
const publicWindowStart = ref(dayjs().format('YYYY-MM-DD'))
const publicWindowEnd = ref(dayjs().add(DEFAULT_PUBLIC_BOOKING.advanceDays - 1, 'day').format('YYYY-MM-DD'))
const currentWeek = ref(alignWeekStart(dayjs()))

const isEmbedded = computed(() => {
  if (typeof window === 'undefined') return false
  const value = new URLSearchParams(window.location.search).get('embed')
  return ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase())
})

const form = ref({
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  practitionerId: '',
  serviceType: '',
  notes: '',
  intakeFormData: {
    chiefComplaint: '',
    allergies: '',
    currentMedications: '',
    medicalHistory: '',
  },
})

function normalizeTagList(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
  if (typeof value !== 'string' || !value.trim()) return []
  const text = value.trim()
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return [...new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean))]
    } catch {
      // Fall through to delimited parsing.
    }
  }
  return [...new Set(text.split(',').map((item) => item.trim()).filter(Boolean))]
}

function normalizeServiceTypes(source) {
  const items = Array.isArray(source)
    ? source
    : source && typeof source === 'object'
      ? Object.entries(source).map(([key, value]) => ({ key, ...value }))
      : []
  return items
    .map((item) => {
      const key = item?.key ?? item?.serviceKey ?? item?.service_type ?? ''
      const fallback = SERVICE_TYPES[key] || {}
      return {
        ...fallback,
        ...item,
        key,
        label: item?.label ?? item?.name ?? item?.displayName ?? fallback.label ?? key,
        requiredTag: item?.requiredTag ?? fallback.requiredTag ?? '',
        roomRequired: Boolean(item?.roomRequired ?? fallback.roomRequired),
      }
    })
    .filter((item) => item.key && item.publicVisible !== false)
}

function alignWeekStart(value) {
  const date = dayjs(value || undefined)
  const mondayOffset = (date.day() + 6) % 7
  return date.subtract(mondayOffset, 'day').startOf('day').toDate()
}

function parsePositiveInteger(value, fallback, minimum = 1) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= minimum ? Math.trunc(parsed) : fallback
}

function normalizePublicBookingSettings(source) {
  return {
    advanceDays: parsePositiveInteger(source?.advanceDays, DEFAULT_PUBLIC_BOOKING.advanceDays, 1),
    dripWindowDays: parsePositiveInteger(source?.dripWindowDays, DEFAULT_PUBLIC_BOOKING.dripWindowDays, 1),
    dripMinutes: parsePositiveInteger(source?.dripMinutes, DEFAULT_PUBLIC_BOOKING.dripMinutes, 10),
  }
}

function resolveWindowEnd(start, settings) {
  const startDate = dayjs(start)
  const resolvedSettings = normalizePublicBookingSettings(settings)
  const base = startDate.isValid() ? startDate : dayjs()
  return base.add(resolvedSettings.advanceDays - 1, 'day').format('YYYY-MM-DD')
}

const practitionerOptions = computed(() =>
  practitioners.value.filter((item) => {
    const serviceKeys = Array.isArray(item.serviceKeys) ? item.serviceKeys : normalizeTagList(item.serviceKeys)
    return !form.value.serviceType || serviceKeys.length === 0 || serviceKeys.includes(form.value.serviceType)
  }),
)

const weekStart = computed(() => dayjs(alignWeekStart(currentWeek.value)))
const weekLabel = computed(() => `${formatDate(weekStart.value.toDate())} - ${formatDate(weekStart.value.add(6, 'day').toDate())}`)
const selectedDay = computed(() => scheduleDays.value.find((day) => day.date === selectedDateValue.value) || null)
const selectedDaySlots = computed(() => {
  const slots = Array.isArray(selectedDay.value?.slots) ? selectedDay.value.slots : []
  return slots
    .filter((slot) => slot.status === 'available')
    .slice()
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
})
const selectedSlot = computed(() => scheduleSlots.value.find((slot) => slot.startTime === selectedSlotValue.value) || null)
const selectedDateLabel = computed(() => {
  if (!selectedDateValue.value) return ''
  const parsed = dayjs(selectedDateValue.value)
  return parsed.isValid() ? `${parsed.format('YYYY-MM-DD')} ${formatWeekday(selectedDateValue.value)}` : selectedDateValue.value
})
const windowStartWeek = computed(() => dayjs(alignWeekStart(publicWindowStart.value)))
const windowEndWeek = computed(() => dayjs(alignWeekStart(publicWindowEnd.value)))
const canGoPrevWeek = computed(() => weekStart.value.valueOf() > windowStartWeek.value.valueOf())
const canGoNextWeek = computed(() => weekStart.value.add(7, 'day').valueOf() <= windowEndWeek.value.valueOf())

function formatWeekday(value) {
  const parsed = dayjs(value)
  return parsed.isValid() ? WEEKDAY_LABELS[parsed.day()] : ''
}

function formatShortDate(value) {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('MM-DD') : value
}

function prevWeek() {
  if (canGoPrevWeek.value) currentWeek.value = weekStart.value.subtract(7, 'day').toDate()
}

function nextWeek() {
  if (canGoNextWeek.value) currentWeek.value = weekStart.value.add(7, 'day').toDate()
}

function goToday() {
  currentWeek.value = alignWeekStart(publicWindowStart.value || dayjs())
}

function getPractitionerName(id) {
  return practitioners.value.find((item) => String(item.id) === String(id))?.name || id || '-'
}

function getPractitionerNames(ids = []) {
  return ids.map((id) => getPractitionerName(id)).filter(Boolean).join(', ')
}

function parseScheduleDateTime(date, value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (text.includes('T') || text.includes(' ')) {
    const parsed = dayjs(text)
    return parsed.isValid() ? parsed : null
  }
  if (!date) return null
  const parsed = dayjs(`${date} ${text.length === 5 ? `${text}:00` : text}`)
  return parsed.isValid() ? parsed : null
}

function normalizeSlot(slot) {
  const start = parseScheduleDateTime(slot?.date || '', slot?.startTime || slot?.start || slot?.beginTime)
  const end = parseScheduleDateTime(slot?.date || '', slot?.endTime || slot?.end || slot?.finishTime)
  if (!start || !end) return null

  const statusText = String(slot?.status || '').toLowerCase()
  let status = statusText
  if (!status) {
    if (slot?.occupied || slot?.booked || slot?.isBooked || slot?.appointmentId || slot?.patientId) status = 'booked'
    else if (slot?.available === true || slot?.isAvailable === true || slot?.canBook === true) status = 'available'
    else status = 'working'
  }
  if (status === 'reserved') status = 'booked'
  if (status === 'free') status = 'available'
  if (!['off', 'working', 'booked', 'available', 'occupied'].includes(status)) status = 'working'

  return {
    ...slot,
    date: slot?.date || start.format('YYYY-MM-DD'),
    startTime: start.format('YYYY-MM-DD HH:mm:ss'),
    endTime: end.format('YYYY-MM-DD HH:mm:ss'),
    status,
    assignedPractitionerId: slot?.assignedPractitionerId ?? slot?.practitionerId ?? null,
    availablePractitionerIds: Array.isArray(slot?.availablePractitionerIds) ? slot.availablePractitionerIds : [],
  }
}

function normalizeDay(day) {
  const date = String(day?.date || '').trim()
  const slots = Array.isArray(day?.slots) ? day.slots.map(normalizeSlot).filter(Boolean) : []
  return {
    ...day,
    date,
    slots,
    availableCount: Number(day?.availableCount ?? slots.filter((slot) => slot.status === 'available').length) || 0,
    releaseMode: String(day?.releaseMode || 'full').toLowerCase(),
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

function normalizeScheduleDays(response) {
  if (Array.isArray(response?.days)) return response.days.map(normalizeDay)

  const grouped = new Map()
  collectSlots(response).forEach((slot) => {
    if (!grouped.has(slot.date)) {
      grouped.set(slot.date, { date: slot.date, slots: [], availableCount: 0, releaseMode: 'full' })
    }
    const day = grouped.get(slot.date)
    day.slots.push(slot)
    if (slot.status === 'available') day.availableCount += 1
  })
  return Array.from(grouped.values()).sort((left, right) => left.date.localeCompare(right.date))
}

function syncSelectionFromSchedule() {
  const currentDay = scheduleDays.value.find((day) => day.date === selectedDateValue.value)
  const availableDay = scheduleDays.value.find((day) => (day.availableCount || 0) > 0)
  if (!currentDay || (currentDay.availableCount || 0) < 1) {
    selectedDateValue.value = availableDay?.date || scheduleDays.value[0]?.date || ''
  }

  const matchedDay = scheduleDays.value.find((day) => day.date === selectedDateValue.value)
  const nextSlots = Array.isArray(matchedDay?.slots)
    ? matchedDay.slots.filter((slot) => slot.status === 'available').sort((left, right) => left.startTime.localeCompare(right.startTime))
    : []
  if (!nextSlots.some((slot) => slot.startTime === selectedSlotValue.value)) {
    selectedSlotValue.value = nextSlots[0]?.startTime || ''
  }
}

function selectDate(day) {
  if (!day || (day.availableCount || 0) < 1) return
  selectedDateValue.value = day.date
}

function selectSlot(slot) {
  if (!slot || slot.status !== 'available') return
  selectedDateValue.value = slot.date
  selectedSlotValue.value = slot.startTime
}

function isSelectedDate(day) {
  return selectedDateValue.value === day?.date
}

function isSelectedSlot(slot) {
  return selectedSlotValue.value === slot?.startTime
}

async function loadOptions() {
  loading.value = true
  try {
    const response = await publicBookingApi.options()
    const nextServiceTypes = normalizeServiceTypes(response?.serviceTypes)
    serviceTypes.value = nextServiceTypes.length > 0 ? nextServiceTypes : normalizeServiceTypes(SERVICE_TYPES)
    practitioners.value = Array.isArray(response?.practitioners) ? response.practitioners : []

    const nextSettings = normalizePublicBookingSettings(response?.publicBooking)
    publicBookingSettings.value = nextSettings
    publicWindowStart.value = response?.publicWindowStart || dayjs().format('YYYY-MM-DD')
    publicWindowEnd.value = response?.publicWindowEnd || resolveWindowEnd(publicWindowStart.value, nextSettings)

    currentWeek.value = alignWeekStart(publicWindowStart.value)

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
  if (!form.value.practitionerId && items.length === 1) {
    form.value.practitionerId = items[0].id
  }
})

watch(selectedDateValue, () => {
  if (!selectedDaySlots.value.some((slot) => slot.startTime === selectedSlotValue.value)) {
    selectedSlotValue.value = selectedDaySlots.value[0]?.startTime || ''
  }
})

let scheduleRequestId = 0

async function loadSchedule() {
  if (!form.value.serviceType) {
    scheduleDays.value = []
    scheduleSlots.value = []
    selectedDateValue.value = ''
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
      roomId: null,
    })
    if (requestId !== scheduleRequestId) return

    if (response?.weekStart) {
      const normalizedWeekStart = alignWeekStart(response.weekStart)
      if (!dayjs(normalizedWeekStart).isSame(weekStart.value, 'day')) currentWeek.value = normalizedWeekStart
    }
    publicBookingSettings.value = normalizePublicBookingSettings(response?.publicBooking || publicBookingSettings.value)
    publicWindowStart.value = response?.publicWindowStart || publicWindowStart.value
    publicWindowEnd.value = response?.publicWindowEnd || resolveWindowEnd(publicWindowStart.value, publicBookingSettings.value)
    scheduleDays.value = normalizeScheduleDays(response)
    scheduleSlots.value = collectSlots(response)
    syncSelectionFromSchedule()
  } catch (error) {
    if (requestId !== scheduleRequestId) return
    scheduleDays.value = []
    scheduleSlots.value = []
    selectedDateValue.value = ''
    selectedSlotValue.value = ''
    ElMessage.error(error.message || t('publicBooking.loadFailed'))
  } finally {
    if (requestId === scheduleRequestId) scheduleLoading.value = false
  }
}

watch(
  [() => form.value.serviceType, () => form.value.practitionerId, weekStart],
  () => { void loadSchedule() },
  { immediate: true },
)

watch(
  [() => form.value.serviceType, () => form.value.practitionerId],
  () => {
    selectedDateValue.value = ''
    selectedSlotValue.value = ''
  },
)

function getSelectedSlotMeta(slot) {
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
  if (!form.value.serviceType) return ElMessage.warning(t('appointments.selectServiceType'))
  if (!selectedDateValue.value) return ElMessage.warning(t('publicBooking.selectDateHint'))
  if (!selectedSlot.value) return ElMessage.warning(t('publicBooking.selectSlotHint'))
  if (!form.value.lastName.trim() || !form.value.firstName.trim()) return ElMessage.warning(t('publicBooking.nameRequired'))
  if (!form.value.phone.trim()) return ElMessage.warning(t('publicBooking.phoneRequired'))

  try {
    const response = await publicBookingApi.create({
      firstName: form.value.firstName.trim(),
      lastName: form.value.lastName.trim(),
      patientName: `${form.value.lastName.trim()} ${form.value.firstName.trim()}`.trim(),
      phone: form.value.phone.trim(),
      email: form.value.email.trim(),
      practitionerId: form.value.practitionerId || selectedSlot.value.assignedPractitionerId || null,
      roomId: selectedSlot.value.roomId || null,
      serviceType: form.value.serviceType,
      startTime: selectedSlot.value.startTime,
      endTime: selectedSlot.value.endTime,
      notes: form.value.notes,
      intakeFormData: { ...form.value.intakeFormData },
    })
    successState.value = response?.appointment || {
      startTime: selectedSlot.value.startTime,
      practitionerId: selectedSlot.value.assignedPractitionerId,
      roomId: selectedSlot.value.roomId,
    }
    selectedSlotValue.value = ''
    await loadSchedule().catch(() => {})
  } catch (error) {
    ElMessage.error(error.message || t('publicBooking.submitFailed'))
  }
}

const successTimeLabel = computed(() => {
  const startTime = successState.value?.startTime
  if (!startTime) return ''
  const parsed = dayjs(startTime)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(startTime)
})

async function bookAnother() {
  successState.value = null
  selectedSlotValue.value = ''
  await loadSchedule().catch(() => {})
}

function copyBookingUrl() {
  const url = window.location.href
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => ElMessage.success(t('publicBooking.linkCopied')))
      .catch(() => ElMessage.info(url))
    return
  }
  ElMessage.info(url)
}

onMounted(() => {
  void loadOptions()
})
</script>

<template>
  <div class="public-booking-page" :class="{ embedded: isEmbedded }">
    <div v-if="successState" class="public-card success-card">
      <h1>{{ t('publicBooking.successTitle') }}</h1>
      <p>{{ t('publicBooking.successIntro') }}</p>
      <p>{{ t('publicBooking.successTime', { time: successTimeLabel }) }}</p>
      <p>{{ t('publicBooking.successPractitioner', { name: getPractitionerName(successState.practitionerId) }) }}</p>
      <el-button type="primary" @click="bookAnother">{{ t('publicBooking.bookAnother') }}</el-button>
    </div>

    <div v-else class="public-card">
      <div class="page-head">
        <div>
          <h1>{{ t('publicBooking.pageTitle') }}</h1>
          <p>{{ t('publicBooking.pageSubtitle') }}</p>
        </div>
        <el-button v-if="!isEmbedded" size="small" @click="copyBookingUrl">
          {{ t('publicBooking.copyLink') }}
        </el-button>
      </div>

      <el-skeleton v-if="loading" :rows="6" animated />

      <el-form v-else :model="form" label-position="top" class="public-form">
        <section class="booking-section">
          <h2>Choose a Service</h2>
          <div class="grid two-col">
            <el-form-item :label="t('appointments.serviceType')" required>
              <el-select v-model="form.serviceType" style="width: 100%">
                <el-option v-for="service in serviceTypes" :key="service.key" :label="service.label" :value="service.key" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('appointments.practitioner')">
              <el-select v-model="form.practitionerId" clearable :placeholder="t('appointments.allPractitioners')" style="width: 100%">
                <el-option v-for="practitioner in practitionerOptions" :key="practitioner.id" :label="practitioner.name" :value="practitioner.id" />
              </el-select>
            </el-form-item>
          </div>
          <div v-if="!form.practitionerId" class="auto-match-banner">
            {{ t('publicBooking.autoAssignHint') }}
          </div>
        </section>

        <section class="booking-section">
          <div class="schedule-head">
            <div>
              <h2>{{ t('publicBooking.weekScheduleTitle') }}</h2>
              <p>{{ t('publicBooking.weekScheduleSubtitle') }}</p>
            </div>
            <div class="week-nav">
              <el-button size="small" @click="goToday">{{ t('appointments.today') }}</el-button>
              <el-button circle size="small" :disabled="!canGoPrevWeek" @click="prevWeek">&lt;</el-button>
              <span class="week-label">{{ weekLabel }}</span>
              <el-button circle size="small" :disabled="!canGoNextWeek" @click="nextWeek">&gt;</el-button>
            </div>
          </div>

          <div class="date-strip">
            <div v-if="scheduleLoading" class="schedule-empty">{{ t('common.loading') }}</div>
            <template v-else>
              <div v-if="!scheduleDays.length" class="schedule-empty">
                {{ t('publicBooking.noAvailableDates') }}
              </div>
              <div v-else class="date-grid">
                <button
                  v-for="day in scheduleDays"
                  :key="day.date"
                  type="button"
                  class="date-card"
                  :class="{ active: isSelectedDate(day), disabled: (day.availableCount || 0) < 1 }"
                  :disabled="(day.availableCount || 0) < 1"
                  @click="selectDate(day)"
                >
                  <div class="date-card-top">
                    <span>{{ formatWeekday(day.date) }}</span>
                    <span class="release-badge" :class="{ full: day.releaseMode !== 'drip' }">
                      {{ t(day.releaseMode === 'drip' ? 'publicBooking.releaseModeDrip' : 'publicBooking.releaseModeFull') }}
                    </span>
                  </div>
                  <div class="date-day">{{ formatShortDate(day.date) }}</div>
                  <div class="date-meta">
                    {{
                      (day.availableCount || 0) > 0
                        ? t('publicBooking.dateCardAvailable', { count: day.availableCount })
                        : t('publicBooking.dateCardUnavailable')
                    }}
                  </div>
                </button>
              </div>
            </template>
          </div>
        </section>

        <section class="booking-section time-blocks">
          <div>
            <h2>{{ t('publicBooking.timeBlocksTitle') }}</h2>
            <p>{{ t('publicBooking.timeBlocksSubtitle') }}</p>
          </div>
          <div v-if="scheduleLoading" class="schedule-empty">{{ t('common.loading') }}</div>
          <div v-else-if="!selectedDateValue" class="schedule-empty">{{ t('publicBooking.selectDateHint') }}</div>
          <div v-else-if="!selectedDaySlots.length" class="schedule-empty">{{ t('publicBooking.noSlotsForDate') }}</div>
          <div v-else class="time-block-list">
            <button
              v-for="slot in selectedDaySlots"
              :key="slot.startTime"
              type="button"
              class="time-block-button"
              :class="{ active: isSelectedSlot(slot) }"
              @click="selectSlot(slot)"
            >
              <div class="slot-time">{{ formatTime(slot.startTime) }} - {{ formatTime(slot.endTime) }}</div>
              <div v-for="line in getSelectedSlotMeta(slot)" :key="line" class="slot-meta">{{ line }}</div>
            </button>
          </div>
        </section>

        <div class="grid two-col selection-grid">
          <div class="selected-slot-panel">
            <div class="selected-slot-title">{{ t('publicBooking.selectedDateTitle') }}</div>
            <div v-if="selectedDateLabel" class="selected-slot-detail">{{ selectedDateLabel }}</div>
            <div v-else class="selected-slot-empty">{{ t('publicBooking.selectDateHint') }}</div>
          </div>
          <div class="selected-slot-panel">
            <div class="selected-slot-title">{{ t('publicBooking.selectedSlotTitle') }}</div>
            <div v-if="selectedSlot" class="selected-slot-detail">
              {{ formatTime(selectedSlot.startTime) }} - {{ formatTime(selectedSlot.endTime) }}
              <span v-if="!form.practitionerId && selectedSlot.assignedPractitionerId">
                - {{ t('publicBooking.autoAssignedPractitioner', { name: getPractitionerName(selectedSlot.assignedPractitionerId) }) }}
              </span>
            </div>
            <div v-else class="selected-slot-empty">{{ t('publicBooking.selectSlotHint') }}</div>
          </div>
        </div>

        <section class="booking-section">
          <h2>Patient Information</h2>
          <div class="grid two-col">
            <el-form-item label="Last name" required>
              <el-input v-model="form.lastName" placeholder="Last name" />
            </el-form-item>
            <el-form-item label="First name" required>
              <el-input v-model="form.firstName" placeholder="First name" />
            </el-form-item>
            <el-form-item :label="t('publicBooking.phone')" required>
              <el-input v-model="form.phone" :placeholder="t('publicBooking.phonePlaceholder')" />
            </el-form-item>
            <el-form-item :label="t('publicBooking.email')">
              <el-input v-model="form.email" :placeholder="t('publicBooking.emailPlaceholder')" />
            </el-form-item>
          </div>
        </section>

        <div class="actions">
          <el-button type="primary" @click="submitBooking">{{ t('publicBooking.submit') }}</el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.public-booking-page {
  min-height: 100vh;
  padding: 32px 16px;
  background: linear-gradient(180deg, #f8fafc 0%, #eef6f0 100%);
}

.public-card {
  max-width: 1180px;
  margin: 0 auto;
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
}

.success-card {
  text-align: center;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-head h1,
.booking-section h2,
.schedule-head h2,
.time-blocks h2 {
  margin: 0;
  color: #1b4332;
}

.page-head p,
.schedule-head p,
.time-blocks p {
  margin: 8px 0 0;
  color: #64748b;
}

.public-booking-page.embedded {
  min-height: auto;
  padding: 0;
  background: transparent;
}

.public-booking-page.embedded .public-card {
  max-width: none;
  margin: 0;
  box-shadow: none;
  border: 1px solid #dbe5dd;
}

.public-form {
  margin-top: 22px;
}

.booking-section {
  padding: 16px 0;
  border-top: 1px solid #edf2ef;
}

.booking-section:first-child {
  border-top: 0;
  padding-top: 0;
}

.grid {
  display: grid;
  gap: 16px;
}

.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.auto-match-banner,
.selected-slot-panel,
.schedule-empty {
  border-radius: 8px;
  background: #f8fafc;
  border: 1px dashed #d1d5db;
  padding: 14px 16px;
  color: #475569;
}

.schedule-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.week-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.week-label {
  font-weight: 700;
  color: #1f2937;
}

.date-strip {
  margin-top: 14px;
  padding: 8px 0;
}

.date-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 12px;
}

.date-card {
  border: 1px solid #dbe5dd;
  border-radius: 8px;
  background: #fff;
  padding: 14px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.date-card:hover:not(:disabled) {
  border-color: #95d5b2;
  box-shadow: 0 8px 20px rgba(45, 106, 79, 0.08);
}

.date-card.active {
  border-color: #2d6a4f;
  box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.12);
  background: #f6fff7;
}

.date-card.disabled {
  cursor: not-allowed;
  opacity: 0.7;
  background: #f8fafc;
}

.date-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
}

.date-day {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
}

.date-meta,
.slot-meta {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.release-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 8px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 11px;
  font-weight: 600;
}

.release-badge.full {
  background: #eefbf0;
  color: #166534;
}

.time-block-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.time-block-button {
  width: 100%;
  border: 1px solid #dbe5dd;
  border-radius: 8px;
  background: #fff;
  padding: 14px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.time-block-button:hover {
  border-color: #95d5b2;
  box-shadow: 0 8px 20px rgba(45, 106, 79, 0.08);
}

.time-block-button.active {
  border-color: #2d6a4f;
  box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.12);
  background: #f6fff7;
}

.slot-time {
  font-size: 15px;
  font-weight: 700;
  color: #1f2937;
}

.selection-grid {
  margin-top: 4px;
  margin-bottom: 10px;
}

.selected-slot-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.selected-slot-title {
  font-size: 12px;
  font-weight: 700;
  color: #1f2937;
}

.selected-slot-detail {
  color: #14532d;
  font-weight: 600;
}

.selected-slot-empty {
  color: #64748b;
}

.optional-section {
  padding-top: 8px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

@media (max-width: 768px) {
  .two-col {
    grid-template-columns: 1fr;
  }

  .public-card {
    padding: 18px;
  }

  .page-head,
  .schedule-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .week-nav {
    width: 100%;
  }

  .week-nav :deep(.el-button) {
    flex: 1;
  }
}
</style>
