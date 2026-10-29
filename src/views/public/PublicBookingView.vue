<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { publicBookingApi } from '../../utils/api'
import { dayjs } from '../../utils/dateUtils'
import { SERVICE_TYPES } from '../../utils/sampleData'
import clinicLogo from '../../assets/otcm-logo.png'

const { t, locale } = useI18n()

const DEFAULT_PUBLIC_BOOKING = {
  advanceDays: 15,
  dripWindowDays: 7,
  dripMinutes: 60,
}
const weekdayLabels = computed(() => locale.value.startsWith('zh') ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'])

const loading = ref(true)
const scheduleLoading = ref(false)
const optionsError = ref(false)
const scheduleError = ref(false)
const submitting = ref(false)
const serviceTypes = ref([])
const practitioners = ref([])
const scheduleDays = ref([])
const scheduleSlots = ref([])
const selectedDateValue = ref('')
const selectedSlotValue = ref('')
const successState = ref(null)
const bookingPage = ref(null)
const publicBookingSettings = ref({ ...DEFAULT_PUBLIC_BOOKING })
const publicWindowStart = ref(dayjs().format('YYYY-MM-DD'))
const publicWindowEnd = ref(dayjs().add(DEFAULT_PUBLIC_BOOKING.advanceDays - 1, 'day').format('YYYY-MM-DD'))
const currentMonth = ref(dayjs().startOf('month').format('YYYY-MM-DD'))
const expandedServices = ref([])

const isEmbedded = computed(() => {
  if (typeof window === 'undefined') return false
  const value = new URLSearchParams(window.location.search).get('embed')
  return ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase())
})
let embedResizeObserver = null
let embedResizeTimer = null

const form = ref({
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  practitionerId: '',
  serviceType: '',
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
        defaultPrice: item?.defaultPrice ?? item?.price ?? null,
        description: String(item?.description || '').trim(),
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

const monthStart = computed(() => dayjs(currentMonth.value).startOf('month'))
const displayLocale = computed(() => locale.value.startsWith('zh') ? 'zh-cn' : 'en')
const selectedService = computed(() => serviceTypes.value.find((service) => service.key === form.value.serviceType))
const monthLabel = computed(() => monthStart.value.locale(displayLocale.value).format(locale.value.startsWith('zh') ? 'YYYY年M月' : 'MMMM YYYY'))
const selectedDay = computed(() => scheduleDays.value.find((day) => day.date === selectedDateValue.value) || null)
const selectedDaySlots = computed(() => (selectedDay.value?.slots || [])
  .filter((slot) => slot.status === 'available').slice()
  .sort((left, right) => left.startTime.localeCompare(right.startTime)))
const selectedSlot = computed(() => scheduleSlots.value.find((slot) => getSlotKey(slot) === selectedSlotValue.value) || null)
const selectedDateLabel = computed(() => selectedDateValue.value ? fullDateLabel(selectedDateValue.value) : '')
const canGoPrevMonth = computed(() => monthStart.value.isAfter(dayjs(publicWindowStart.value).startOf('month')))
const canGoNextMonth = computed(() => monthStart.value.isBefore(dayjs(publicWindowEnd.value).startOf('month')))
const calendarDays = computed(() => {
  const byDate = new Map(scheduleDays.value.map((day) => [day.date, day]))
  const blanks = Array.from({ length: monthStart.value.day() }, (_, index) => ({ key: `blank-${index}` }))
  const dates = Array.from({ length: monthStart.value.daysInMonth() }, (_, index) => {
    const date = monthStart.value.add(index, 'day').format('YYYY-MM-DD')
    const day = byDate.get(date)
    return { key: date, date, number: index + 1,
      availableCount: date >= publicWindowStart.value && date <= publicWindowEnd.value ? (day?.availableCount || 0) : 0 }
  })
  return [...blanks, ...dates]
})
const hasMonthAvailability = computed(() => scheduleDays.value.some((day) => day.availableCount > 0))

function fullDateLabel(value) {
  return dayjs(value).locale(displayLocale.value).format(locale.value.startsWith('zh') ? 'YYYY年M月D日' : 'MMMM D, YYYY')
}

function timeLabel(value) {
  return dayjs(value).locale('en').format('h:mm A')
}

function servicePrice(service) {
  if (service.pricingVisible === false || service.defaultPrice === null || service.defaultPrice === '' || !Number.isFinite(Number(service.defaultPrice))) return ''
  return new Intl.NumberFormat(locale.value.startsWith('zh') ? 'zh-CN' : 'en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(service.defaultPrice))
}

function serviceDuration(service) {
  const duration = Number(service?.duration)
  if (!Number.isFinite(duration) || duration <= 0) return ''
  return duration === 60 ? t('publicBooking.oneHour') : t('publicBooking.minutes', { count: duration })
}

function selectService(service) {
  if (!submitting.value) form.value.serviceType = service.key
}

function toggleDescription(key) {
  expandedServices.value = expandedServices.value.includes(key)
    ? expandedServices.value.filter((value) => value !== key) : [...expandedServices.value, key]
}

function prevMonth() {
  if (!submitting.value && canGoPrevMonth.value) currentMonth.value = monthStart.value.subtract(1, 'month').format('YYYY-MM-DD')
}

function nextMonth() {
  if (!submitting.value && canGoNextMonth.value) currentMonth.value = monthStart.value.add(1, 'month').format('YYYY-MM-DD')
}

function getSlotKey(slot) {
  if (!slot) return ''
  return [
    slot.startTime || '',
    slot.endTime || '',
    slot.assignedPractitionerId ?? slot.practitionerId ?? '',
    slot.roomId ?? slot.assignedRoomId ?? '',
  ].map((part) => String(part || '')).join('|')
}

function getPractitionerName(id) {
  return practitioners.value.find((item) => String(item.id) === String(id))?.name || id || '-'
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
    roomId: slot?.roomId ?? slot?.assignedRoomId ?? null,
    assignedRoomId: slot?.assignedRoomId ?? slot?.roomId ?? null,
    status,
    assignedPractitionerId: slot?.assignedPractitionerId ?? slot?.practitionerId ?? null,
    availablePractitionerIds: Array.isArray(slot?.availablePractitionerIds) ? slot.availablePractitionerIds : [],
  }
}

function normalizeDay(day) {
  const date = String(day?.date || '').trim()
  const slots = Array.isArray(day?.slots) ? day.slots.map((slot) => normalizeSlot({ ...slot, date: slot.date || date })).filter(Boolean) : []
  return {
    ...day,
    date,
    slots,
    availableCount: slots.filter((slot) => slot.status === 'available').length,
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
    selectedDateValue.value = availableDay?.date || ''
  }

  const matchedDay = scheduleDays.value.find((day) => day.date === selectedDateValue.value)
  const nextSlots = Array.isArray(matchedDay?.slots)
    ? matchedDay.slots.filter((slot) => slot.status === 'available').sort((left, right) => left.startTime.localeCompare(right.startTime))
    : []
  if (!nextSlots.some((slot) => getSlotKey(slot) === selectedSlotValue.value)) {
    selectedSlotValue.value = nextSlots[0] ? getSlotKey(nextSlots[0]) : ''
  }
}

function selectDate(day) {
  if (submitting.value || scheduleLoading.value || !day || (day.availableCount || 0) < 1) return
  selectedDateValue.value = day.date
}

function selectSlot(slot) {
  if (submitting.value || scheduleLoading.value || !slot || slot.status !== 'available') return
  selectedDateValue.value = slot.date
  selectedSlotValue.value = getSlotKey(slot)
}

function isSelectedDate(day) {
  return selectedDateValue.value === day?.date
}

function isSelectedSlot(slot) {
  return selectedSlotValue.value === getSlotKey(slot)
}

function postEmbedHeight() {
  if (!isEmbedded.value || typeof window === 'undefined' || window.parent === window || !bookingPage.value) return
  // Measure the content, since document height cannot shrink below the current iframe viewport.
  const height = Math.ceil(bookingPage.value.getBoundingClientRect().height)
  window.parent.postMessage({ type: 'otcm-booking-height', height }, '*')
}

function scheduleEmbedHeightPost() {
  if (!isEmbedded.value || typeof window === 'undefined') return
  if (embedResizeTimer) window.clearTimeout(embedResizeTimer)
  embedResizeTimer = window.setTimeout(() => {
    embedResizeTimer = null
    postEmbedHeight()
  }, 50)
}

function setupEmbedHeightBridge() {
  if (!isEmbedded.value || typeof window === 'undefined') return
  nextTick(scheduleEmbedHeightPost)
  if ('ResizeObserver' in window) {
    embedResizeObserver = new ResizeObserver(scheduleEmbedHeightPost)
    if (bookingPage.value) embedResizeObserver.observe(bookingPage.value)
  }
  window.addEventListener('load', scheduleEmbedHeightPost)
}

async function loadOptions() {
  loading.value = true
  optionsError.value = false
  try {
    const response = await publicBookingApi.options()
    serviceTypes.value = normalizeServiceTypes(response?.serviceTypes)
    practitioners.value = Array.isArray(response?.practitioners) ? response.practitioners : []

    const nextSettings = normalizePublicBookingSettings(response?.publicBooking)
    publicBookingSettings.value = nextSettings
    publicWindowStart.value = response?.publicWindowStart || dayjs().format('YYYY-MM-DD')
    publicWindowEnd.value = response?.publicWindowEnd || resolveWindowEnd(publicWindowStart.value, nextSettings)

    currentMonth.value = dayjs(publicWindowStart.value).startOf('month').format('YYYY-MM-DD')

    if (!serviceTypes.value.some((service) => service.key === form.value.serviceType)) {
      form.value.serviceType = serviceTypes.value[0]?.key || ''
    }
  } catch {
    optionsError.value = true
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
}, { flush: 'sync' })

watch(selectedDateValue, () => {
  if (!selectedDaySlots.value.some((slot) => getSlotKey(slot) === selectedSlotValue.value)) {
    selectedSlotValue.value = selectedDaySlots.value[0] ? getSlotKey(selectedDaySlots.value[0]) : ''
  }
})

let scheduleRequestId = 0

async function loadSchedule() {
  const requestId = ++scheduleRequestId
  scheduleError.value = false
  selectedDateValue.value = ''
  selectedSlotValue.value = ''
  if (!form.value.serviceType) {
    scheduleDays.value = []
    scheduleSlots.value = []
    scheduleLoading.value = false
    return
  }

  scheduleLoading.value = true
  try {
    // The API returns weeks; request every week intersecting this month and
    // the real booking window so later weeks are visible without another step.
    const month = monthStart.value
    const first = month.format('YYYY-MM-DD') > publicWindowStart.value ? month : dayjs(publicWindowStart.value)
    const last = month.endOf('month').format('YYYY-MM-DD') < publicWindowEnd.value ? month.endOf('month') : dayjs(publicWindowEnd.value)
    const weeks = []
    for (let week = dayjs(alignWeekStart(first)); !week.isAfter(last, 'day'); week = week.add(7, 'day')) {
      if (!first.isAfter(last, 'day')) weeks.push(week.format('YYYY-MM-DD'))
    }
    const responses = await Promise.all(weeks.map((week) => publicBookingApi.schedule({
      weekStart: week,
      serviceType: form.value.serviceType,
      practitionerId: form.value.practitionerId || null,
      roomId: null,
    })))
    if (requestId !== scheduleRequestId) return

    const response = responses[0]
    publicBookingSettings.value = normalizePublicBookingSettings(response?.publicBooking || publicBookingSettings.value)
    publicWindowStart.value = response?.publicWindowStart || publicWindowStart.value
    publicWindowEnd.value = response?.publicWindowEnd || resolveWindowEnd(publicWindowStart.value, publicBookingSettings.value)
    const days = new Map()
    responses.flatMap(normalizeScheduleDays).forEach((day) => {
      if (day.date >= publicWindowStart.value && day.date <= publicWindowEnd.value && dayjs(day.date).isSame(month, 'month')) {
        days.set(day.date, day)
      }
    })
    scheduleDays.value = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
    scheduleSlots.value = scheduleDays.value.flatMap((day) => day.slots)
    syncSelectionFromSchedule()
  } catch {
    if (requestId !== scheduleRequestId) return
    scheduleDays.value = []
    scheduleSlots.value = []
    selectedDateValue.value = ''
    selectedSlotValue.value = ''
    scheduleError.value = true
  } finally {
    if (requestId === scheduleRequestId) scheduleLoading.value = false
  }
}

watch(
  [() => form.value.serviceType, () => form.value.practitionerId, monthStart],
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

async function submitBooking() {
  if (submitting.value || loading.value || scheduleLoading.value || successState.value) return
  if (!form.value.serviceType) return ElMessage.warning(t('appointments.selectServiceType'))
  if (!selectedDateValue.value) return ElMessage.warning(t('publicBooking.selectDateHint'))
  if (!selectedSlot.value) return ElMessage.warning(t('publicBooking.selectSlotHint'))
  if (!form.value.lastName.trim() || !form.value.firstName.trim()) return ElMessage.warning(t('publicBooking.nameRequired'))
  if (!form.value.phone.trim()) return ElMessage.warning(t('publicBooking.phoneRequired'))
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email.trim())) return ElMessage.warning(t('publicBooking.emailRequired'))

  const slot = { ...selectedSlot.value }
  const practitionerId = form.value.practitionerId || slot.assignedPractitionerId || null
  submitting.value = true
  try {
    const response = await publicBookingApi.create({
      firstName: form.value.firstName.trim(),
      lastName: form.value.lastName.trim(),
      patientName: `${form.value.lastName.trim()} ${form.value.firstName.trim()}`.trim(),
      phone: form.value.phone.trim(),
      email: form.value.email.trim(),
      practitionerId,
      roomId: slot.roomId || null,
      serviceType: form.value.serviceType,
      startTime: slot.startTime,
      endTime: slot.endTime,
    })
    successState.value = response?.appointment || {
      startTime: slot.startTime,
      practitionerId,
      roomId: slot.roomId,
    }
    selectedSlotValue.value = ''
  } catch (error) {
    ElMessage.error(error.message || t('publicBooking.submitFailed'))
  } finally {
    submitting.value = false
  }
}

const successTimeLabel = computed(() => {
  const startTime = successState.value?.startTime
  if (!startTime) return ''
  const parsed = dayjs(startTime)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(startTime)
})

async function bookAnother() {
  if (submitting.value) return
  successState.value = null
  selectedSlotValue.value = ''
  await loadSchedule().catch(() => {})
}


watch(
  [loading, scheduleLoading, scheduleDays, selectedDateValue, selectedSlotValue, successState],
  () => { nextTick(scheduleEmbedHeightPost) },
  { deep: true },
)

onMounted(() => {
  void loadOptions()
  setupEmbedHeightBridge()
})

onBeforeUnmount(() => {
  scheduleRequestId += 1
  if (embedResizeTimer && typeof window !== 'undefined') window.clearTimeout(embedResizeTimer)
  embedResizeObserver?.disconnect()
  if (typeof window !== 'undefined') window.removeEventListener('load', scheduleEmbedHeightPost)
})
</script>

<template>
  <div ref="bookingPage" class="public-booking-page" :class="{ embedded: isEmbedded }">
    <div v-if="successState" class="public-card success-card" role="status">
      <a class="clinic-home-link" href="https://otcm.ca/" target="_top" aria-label="OTCM home"><img :src="clinicLogo" class="clinic-logo" alt="OTCM Acupuncture" width="389" height="232" /></a>
      <h1>{{ t('publicBooking.successTitle') }}</h1>
      <p>{{ t('publicBooking.successIntro') }}</p>
      <p>{{ t('publicBooking.successTime', { time: successTimeLabel }) }}</p>
      <p>{{ t('publicBooking.easternTime') }}</p>
      <p>{{ t('publicBooking.successPractitioner', { name: getPractitionerName(successState.practitionerId) }) }}</p>
      <button type="button" class="primary-button" :disabled="submitting" @click="bookAnother">{{ t('publicBooking.bookAnother') }}</button>
    </div>

    <div v-else class="public-card">
      <header class="page-head">
        <a class="clinic-home-link" href="https://otcm.ca/" target="_top" aria-label="OTCM home"><img :src="clinicLogo" class="clinic-logo" alt="OTCM Acupuncture" width="389" height="232" /></a>
        <h1>{{ t('publicBooking.treatmentTitle') }}</h1>
      </header>
      <el-skeleton v-if="loading" :rows="6" animated />
      <div v-else-if="optionsError" class="booking-notice" role="alert">
        <p>{{ t('publicBooking.loadFailed') }}</p>
        <button type="button" class="outline-button" @click="loadOptions">{{ t('publicBooking.retry') }}</button>
      </div>
      <div v-else-if="!serviceTypes.length" class="booking-notice" role="status">{{ t('publicBooking.noServicesAvailable') }}</div>
      <form v-else class="public-form" @submit.prevent="submitBooking">
        <h2 class="section-heading service-heading"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>{{ t('publicBooking.selectService') }}</h2>
        <div class="service-list" role="radiogroup" :aria-label="t('appointments.serviceType')">
          <article v-for="service in serviceTypes" :key="service.key" class="service-card" :class="{ active: service.key === form.serviceType }">
            <button type="button" class="service-choice" role="radio" :aria-label="service.label" :aria-checked="service.key === form.serviceType" :disabled="submitting" @click="selectService(service)">
              <span class="service-name">{{ service.label }}</span>
              <span class="service-indicator" aria-hidden="true"><svg v-if="service.key === form.serviceType" viewBox="0 0 24 24"><path d="m6 12 4 4 8-8" /></svg></span>
            </button>
            <div v-if="service.description" class="service-description-row">
              <p :class="{ expanded: expandedServices.includes(service.key) }">{{ service.description }}</p>
              <button type="button" class="text-button" :aria-expanded="expandedServices.includes(service.key)" @click="toggleDescription(service.key)">{{ t(expandedServices.includes(service.key) ? 'publicBooking.readLess' : 'publicBooking.readMore') }}</button>
            </div>
            <p class="service-facts"><span v-if="servicePrice(service)">{{ servicePrice(service) }}</span><span v-if="servicePrice(service) && serviceDuration(service)" aria-hidden="true"> · </span><span>{{ serviceDuration(service) }}</span></p>
          </article>
        </div>

        <section class="schedule-section" :aria-busy="scheduleLoading">
          <p class="booking-summary">{{ t('publicBooking.bookingFor') }} <strong>{{ selectedService?.label }}</strong></p>
          <p class="selected-date-heading" aria-live="polite">{{ selectedDateLabel || t('publicBooking.selectDateHint') }}</p>
          <div class="schedule-columns">
            <section class="calendar-panel" :aria-label="t('publicBooking.dateHeading')">
              <h2 class="section-heading"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M7 2v4m10-4v4M3 10h18M7 14h1m3 0h1m3 0h1M7 18h1m3 0h1"/></svg>{{ t('publicBooking.dateHeading') }}</h2>
              <div class="month-nav">
                <button type="button" class="month-step" :aria-label="t('publicBooking.previousMonth')" :disabled="submitting || !canGoPrevMonth" @click="prevMonth"><span aria-hidden="true">‹</span> {{ t('publicBooking.previousMonth') }}</button>
                <span class="month-label" aria-live="polite">{{ monthLabel }}</span>
                <button type="button" class="month-step" :aria-label="t('publicBooking.nextMonth')" :disabled="submitting || !canGoNextMonth" @click="nextMonth">{{ t('publicBooking.nextMonth') }} <span aria-hidden="true">›</span></button>
              </div>
              <div class="calendar-grid">
                <span v-for="(label, index) in weekdayLabels" :key="`weekday-${index}`" class="weekday-label" aria-hidden="true">{{ label }}</span>
                <template v-for="day in calendarDays" :key="day.key">
                  <span v-if="!day.date" class="calendar-blank" aria-hidden="true"></span>
                  <button v-else type="button" class="date-card" :class="{ active: isSelectedDate(day), available: day.availableCount > 0 }" :data-date="day.date" :aria-label="fullDateLabel(day.date)" :title="day.availableCount > 0 ? t('publicBooking.dateCardAvailable', { count: day.availableCount }) : t('publicBooking.dateCardUnavailable')" :aria-pressed="isSelectedDate(day)" :disabled="submitting || scheduleLoading || scheduleError || day.availableCount < 1" @click="selectDate(day)">{{ day.number }}</button>
                </template>
              </div>
              <p class="calendar-hint">{{ t('publicBooking.calendarHint') }}</p>
            </section>
            <section class="time-panel" :aria-label="t('publicBooking.timeHeading')">
              <h2 class="section-heading"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 5v7h5"/></svg>{{ t('publicBooking.timeHeading') }}</h2>
              <div v-if="scheduleLoading" class="booking-notice" role="status">{{ t('common.loading') }}</div>
              <div v-else-if="scheduleError" class="booking-notice" role="alert">
                <p>{{ t('publicBooking.scheduleLoadFailed') }}</p>
                <button type="button" class="outline-button" @click="loadSchedule">{{ t('publicBooking.retry') }}</button>
              </div>
              <div v-else-if="!hasMonthAvailability" class="booking-notice" role="status">
                <p>{{ t('publicBooking.noMonthSlots') }}</p>
                <button v-if="canGoNextMonth" type="button" class="outline-button" :disabled="submitting" @click="nextMonth">{{ t('publicBooking.viewNextMonth') }}</button>
              </div>
              <div v-else-if="!selectedDaySlots.length" class="booking-notice">{{ t('publicBooking.selectDateHint') }}</div>
              <div v-else class="time-block-list">
                <button v-for="slot in selectedDaySlots" :key="getSlotKey(slot)" type="button" class="time-block-button" :disabled="submitting || scheduleLoading" :class="{ active: isSelectedSlot(slot) }" :aria-pressed="isSelectedSlot(slot)" @click="selectSlot(slot)">{{ timeLabel(slot.startTime) }}</button>
              </div>
            </section>
          </div>
          <p class="timezone-note"><span aria-hidden="true">ⓘ</span> {{ t('publicBooking.easternTime') }}</p>
        </section>

        <section class="details-section">
          <h2 class="section-heading"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="9" r="2"/><path d="M8 16c0-4 8-4 8 0M8 19h8"/></svg>{{ t('publicBooking.detailsHeading') }}</h2>
          <div class="details-fields">
            <div class="name-fields">
              <label for="booking-first-name">{{ t('publicBooking.firstName') }} <span class="required">*</span><input id="booking-first-name" v-model="form.firstName" name="given-name" autocomplete="given-name" :placeholder="t('publicBooking.firstName')" :disabled="submitting" required maxlength="100" /></label>
              <label for="booking-last-name">{{ t('publicBooking.lastName') }} <span class="required">*</span><input id="booking-last-name" v-model="form.lastName" name="family-name" autocomplete="family-name" :placeholder="t('publicBooking.lastName')" :disabled="submitting" required maxlength="100" /></label>
            </div>
            <label for="booking-email">{{ t('publicBooking.email') }} <span class="required">*</span><input id="booking-email" v-model="form.email" name="email" type="email" autocomplete="email" inputmode="email" :placeholder="t('publicBooking.email')" :disabled="submitting" required maxlength="254" /></label>
            <label for="booking-phone">{{ t('publicBooking.phoneNumber') }} <span class="required">*</span><input id="booking-phone" v-model="form.phone" name="tel" type="tel" autocomplete="tel" inputmode="tel" :placeholder="t('publicBooking.phoneNumber')" :disabled="submitting" required maxlength="40" /></label>
            <p v-if="selectedSlot" class="selected-time-summary">{{ selectedDateLabel }} · {{ timeLabel(selectedSlot.startTime) }}<br>{{ t('publicBooking.easternTimeShort') }}</p>
            <button type="submit" class="primary-button submit-button" :disabled="submitting || scheduleLoading || scheduleError || !selectedSlot">{{ submitting ? t('common.loading') : t('publicBooking.submit') }}</button>
          </div>
        </section>
      </form>
    </div>
  </div>
</template>

<style scoped>
.public-booking-page { --booking-accent: #508d9b; min-height: 100vh; padding: 24px 28px 72px; background: #fff; color: #252525; font-family: 'Segoe UI', Arial, sans-serif; font-size: 18px; line-height: 1.5; }
.public-booking-page * { box-sizing: border-box; }
.public-booking-page.embedded { min-height: 0; }
.service-card, .service-choice, .service-description-row, .service-name { min-width: 0; }
.service-name { overflow-wrap: anywhere; }
.public-card { max-width: 1128px; margin: 0 auto; }
.page-head { display: flex; flex-direction: column; align-items: center; gap: 18px; margin: 0 0 58px; }
.page-head h1 { margin: 0; color: #303030; font-size: 32px; font-weight: 400; line-height: 1.3; }
.clinic-home-link { flex: none; display: inline-block; }
.clinic-logo { display: block; width: 116px; height: auto; }
button, input { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; }
button:focus-visible, a:focus-visible { outline: 3px solid #245968; outline-offset: 4px; }
.service-heading { margin-bottom: 32px; }
.service-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 42px; }
.service-card { position: relative; min-height: 194px; border: 1px solid #e3e3e3; border-top: 6px solid var(--booking-accent); border-radius: 5px; padding: 22px; display: flex; flex-direction: column; transition: box-shadow 160ms ease; }
.service-card.active { border-color: var(--booking-accent); box-shadow: 0 8px 20px #00000020; }
.service-choice { padding: 0; border: 0; background: transparent; color: inherit; display: flex; align-items: flex-start; gap: 20px; text-align: left; width: 100%; flex: 1; }
.service-choice::after { content: ''; position: absolute; inset: 0; }
.service-choice:disabled { opacity: .65; }
.service-name { flex: 1; font-size: 25px; line-height: 1.35; font-weight: 400; }
.service-indicator { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border: 2px solid var(--booking-accent); border-radius: 50%; margin-top: 5px; color: #fff; }
.service-card.active .service-indicator { background: var(--booking-accent); }
.service-indicator svg { width: 20px; fill: none; stroke: currentColor; stroke-width: 2.5; }
.service-description-row { position: relative; z-index: 1; display: flex; align-items: baseline; gap: 10px; margin-top: 28px; font-size: 16px; color: #626262; }
.service-description-row p { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.service-description-row p.expanded { white-space: normal; }
.text-button { flex: none; border: 0; padding: 0; background: none; color: #386e7b; text-decoration: underline; }
.service-facts { margin: 22px 0 0; font-weight: 700; line-height: 1.4; }
.schedule-section { margin-top: 76px; }
.booking-summary { width: fit-content; max-width: 100%; margin: 0 auto; padding: 8px 38px; border-radius: 40px; background: #f6f6f6; text-align: center; font-size: 20px; }
.selected-date-heading { margin: 40px 0 48px; font-size: 25px; color: #4d4d4d; text-align: center; min-height: 38px; }
.schedule-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 64px; }
.section-heading { display: flex; align-items: center; gap: 24px; margin: 0 0 48px; font-size: 21px; font-weight: 700; letter-spacing: 1px; color: #242424; line-height: 1.4; }
.section-heading svg { width: 28px; height: 28px; flex: none; fill: none; stroke: var(--booking-accent); stroke-width: 1.7; }
.month-nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; margin-bottom: 24px; min-height: 48px; }
.month-label { font-size: 24px; color: #444; text-align: center; }
.month-step { display: flex; justify-content: center; align-items: center; gap: 5px; border: 1px solid #acc8cf; border-radius: 4px; background: #fff; color: #386e7b; padding: 8px 7px; font-size: 14px; line-height: 1.2; min-height: 44px; }
.month-step span { font-size: 25px; }
.month-step:not(:disabled):hover { background: #f0f6f7; border-color: var(--booking-accent); }
.month-step:disabled { color: #a3a3a3; border-color: #e7e7e7; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
.weekday-label { display: grid; place-items: center; height: 40px; color: #444; font-size: 18px; }
.date-card { display: grid; place-items: center; justify-self: center; width: 44px; height: 44px; max-width: 100%; padding: 0; border: 1px solid transparent; border-radius: 50%; background: none; color: #999; font-size: 19px; }
.date-card.available:not(:disabled) { color: #333; font-weight: 600; }
.date-card.available:hover:not(:disabled) { background: #edf5f6; border-color: #acc8cf; }
.date-card.active:not(:disabled) { color: #fff; background: var(--booking-accent); }
.date-card:disabled { color: #b1b1b1; }
.calendar-hint { font-size: 14px; color: #626262; margin: 18px 0 0; text-align: center; }
.time-block-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px 20px; padding-top: 6px; }
.time-block-button { min-height: 58px; padding: 10px 5px; border: 1px solid #858585; border-radius: 4px; color: #303030; background: #fff; font-size: 22px; white-space: nowrap; }
.time-block-button:hover:not(:disabled) { background: #f0f6f7; border-color: var(--booking-accent); }
.time-block-button.active { background: var(--booking-accent); border-color: var(--booking-accent); color: #fff; }
.time-block-button:disabled { opacity: .6; }
.timezone-note { margin: 42px 0 0; color: #505050; text-align: center; font-size: 19px; }
.timezone-note span { margin-right: 7px; }
.details-section { margin-top: 112px; }
.details-section .section-heading { margin-bottom: 56px; }
.details-fields { width: calc((100% - 64px) / 2); }
.details-fields label { display: block; color: #505050; font-weight: 600; font-size: 18px; margin-bottom: 20px; }
.required { color: #b63232; }
.details-fields input { display: block; width: 100%; height: 48px; margin-top: 5px; border: 1px solid #808080; border-radius: 3px; background: #f7f7f7; padding: 9px 12px; color: #252525; font-size: 18px; font-weight: 400; }
.details-fields input::placeholder { color: #737373; opacity: 1; }
.details-fields input:focus { outline: 2px solid var(--booking-accent); outline-offset: 1px; background: #fff; }
.details-fields input:disabled { opacity: .65; }
.name-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.selected-time-summary { margin: 28px 0 20px; font-size: 16px; color: #505050; }
.primary-button { min-height: 48px; padding: 12px 28px; border: 1px solid var(--booking-accent); border-radius: 3px; background: var(--booking-accent); color: #fff; font-size: 18px; font-weight: 600; }
.primary-button:hover:not(:disabled) { background: #3e7180; }
.primary-button:disabled { opacity: .5; }
.submit-button { width: 100%; }
.outline-button { min-height: 44px; border: 1px solid var(--booking-accent); border-radius: 3px; padding: 8px 18px; color: #386e7b; background: #fff; }
.booking-notice { padding: 18px 0; color: #626262; font-size: 17px; }
.booking-notice p { margin: 0 0 16px; }
.success-card { text-align: center; padding-top: 60px; max-width: 720px; }
.success-card h1 { font-size: 30px; margin-top: 28px; }
.success-card p { margin: 18px 0; }
.success-card .primary-button { margin-top: 16px; }
@media (max-width: 1000px) {
  .schedule-columns { gap: 36px; }
  .service-list { gap: 28px; }
  .month-nav { grid-template-columns: 1fr 1fr; }
  .month-label { grid-column: 1 / -1; grid-row: 1; margin-bottom: 6px; }
  .time-block-list { gap: 12px; }
  .time-block-button { font-size: 19px; }
  .details-fields { width: calc((100% - 36px) / 2); }
}
@media (max-width: 700px) {
  .public-booking-page { padding: 20px 20px 48px; font-size: 16px; }
  .page-head { gap: 14px; margin-bottom: 38px; }
  .page-head h1 { font-size: 28px; }
  .clinic-logo { width: 100px; }
  .service-list { grid-template-columns: minmax(0, 1fr); gap: 18px; }
  .service-card { min-height: 142px; padding: 18px; }
  .service-name { font-size: 22px; }
  .service-facts { margin-top: 22px; }
  .schedule-section { margin-top: 40px; }
  .booking-summary { font-size: 17px; padding: 10px 20px; }
  .selected-date-heading { margin: 28px 0; font-size: 23px; }
  .schedule-columns { grid-template-columns: 1fr; gap: 38px; }
  .section-heading { font-size: 19px; gap: 18px; margin-bottom: 24px; }
  .month-nav { margin-bottom: 18px; }
  .month-label { font-size: 23px; }
  .month-step { font-size: 16px; }
  .time-block-list { padding: 0; }
  .time-block-button { min-height: 52px; font-size: 19px; }
  .timezone-note { margin-top: 28px; font-size: 15px; }
  .details-section { margin-top: 52px; }
  .details-section .section-heading { margin-bottom: 30px; }
  .details-fields { width: 100%; }
  .details-fields label, .details-fields input { font-size: 17px; }
}
@media (max-width: 360px) {
  .public-booking-page { padding-right: 14px; padding-left: 14px; }
  .name-fields { grid-template-columns: 1fr; gap: 0; }
  .time-block-list { gap: 8px; }
  .time-block-button { font-size: 17px; }
}
@media (prefers-reduced-motion: reduce) { .service-card { transition: none; } }
</style>
