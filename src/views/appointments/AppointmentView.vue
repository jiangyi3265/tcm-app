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
import { buildDayAppointmentLayout } from '../../utils/appointmentLayout'
import {
  WEEKDAYS,
  createEmptyWorkingRange,
  normalizeWorkingHoursForForm,
  buildWorkingHoursPayload,
  validateWorkingHours,
} from '../../utils/workingHours'
import { resolvePractitionerColor, resolveRoomColor } from '../../utils/colorPalette'
import { useEmailSimulator } from '../../utils/emailSimulator'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t, te } = useI18n()

const SLOT_MINUTES = 10
const INTERNAL_VIEW_DAYS = 7
const VISIBLE_DAYS = 3
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }

const appointmentsStore = useAppointmentsStore()
const patientsStore = usePatientsStore()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const branchesStore = useBranchesStore()
const { showEmailDialog, emailData, openEmailPreview, sendEmail } = useEmailSimulator()
const emailSending = ref(false)

const roles = computed(() => authStore.roles)
const canCreate = computed(() => hasPermission(roles.value, 'appointment.create'))
const canCancel = computed(() => hasPermission(roles.value, 'appointment.cancel'))
const canEditOwnSchedule = computed(() => roles.value.includes('practitioner') || roles.value.includes('doctor'))
const canEditAppointments = computed(() => hasPermission(roles.value, 'appointment.create'))

const currentDate = ref(new Date())
const viewMode = ref('calendar')
// pageOffset tracks which 3-day page within the 7-day window: 0→days 0-2, 1→days 3-5, 2→days 6-8 (wraps)
const pageOffset = ref(0)
const weekStart = computed(() => dayjs(currentDate.value).startOf('day'))
// Full 7-day window for data fetching
const weekDays = computed(() => Array.from({ length: INTERNAL_VIEW_DAYS }, (_, index) => weekStart.value.add(index, 'day').toDate()))
// Visible 3-day slice that cycles: page0=day0-2, page1=day3-5, page2=day6 + next week day0-1
const visibleDays = computed(() => {
  const startIdx = pageOffset.value * VISIBLE_DAYS
  return Array.from({ length: VISIBLE_DAYS }, (_, i) => {
    const idx = startIdx + i
    // If idx goes beyond 6, wrap into next week
    return weekStart.value.add(idx, 'day').toDate()
  })
})
function prevPage() {
  if (pageOffset.value > 0) {
    pageOffset.value--
  } else {
    // Go to previous 7-day window, last page
    currentDate.value = dayjs(currentDate.value).subtract(INTERNAL_VIEW_DAYS, 'day').toDate()
    pageOffset.value = Math.ceil(INTERNAL_VIEW_DAYS / VISIBLE_DAYS) - 1
  }
}
function nextPage() {
  const maxPage = Math.ceil(INTERNAL_VIEW_DAYS / VISIBLE_DAYS) - 1
  if (pageOffset.value < maxPage) {
    pageOffset.value++
  } else {
    // Go to next 7-day window, first page
    currentDate.value = dayjs(currentDate.value).add(INTERNAL_VIEW_DAYS, 'day').toDate()
    pageOffset.value = 0
  }
}
function prevWeek() { currentDate.value = dayjs(currentDate.value).subtract(INTERNAL_VIEW_DAYS, 'day').toDate(); pageOffset.value = 0 }
function nextWeek() { currentDate.value = dayjs(currentDate.value).add(INTERNAL_VIEW_DAYS, 'day').toDate(); pageOffset.value = 0 }
function goToday() { currentDate.value = new Date(); pageOffset.value = 0 }
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
  return settingsStore.serviceTypes?.[serviceType] || {}
}

function getServiceTypeLabel(serviceType, fallback = '') {
  const translationKey = `appointments.serviceTypes.${serviceType}`
  if (te(translationKey)) return t(translationKey)
  return fallback || getServiceTypeConfig(serviceType)?.label || serviceType
}

const serviceOptions = computed(() => {
  const source = settingsStore.serviceTypes || {}
  return Object.entries(source)
    .filter(([key]) => key !== 'time_block')
    .map(([key, config]) => ({
      key,
      label: getServiceTypeLabel(key, config?.label),
      duration: Number(config?.duration || 0),
      roomRequired: Boolean(config?.roomRequired),
      requiredTag: config?.requiredTag || '',
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

function buildEmptyIntakeForm() {
  return { chiefComplaint: '', allergies: '', currentMedications: '', medicalHistory: '' }
}

const practitioners = computed(() => authStore.getPractitioners())
const filterPractitioner = ref('')
const filterRoom = ref('')

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
  // Extend end to cover wrap-around days when on last page (day 6 + 2 extra days)
  const end = weekStart.value.add(INTERNAL_VIEW_DAYS + VISIBLE_DAYS - 1, 'day').endOf('day')
  return appointmentsStore.getBranchAppointments(branchesStore.currentBranchId)
    .filter((appointment) => appointment.status !== 'cancelled')
    .filter((appointment) => {
      if (filterPractitioner.value && String(appointment.practitionerId) !== String(filterPractitioner.value)) return false
      if (filterRoom.value && String(appointment.roomId || '') !== String(filterRoom.value)) return false
      const startTime = dayjs(appointment.startTime)
      return startTime.isValid() && !startTime.isBefore(start) && !startTime.isAfter(end)
    })
    .sort((left, right) => new Date(left.startTime) - new Date(right.startTime))
})

const weekAppointmentRows = computed(() =>
  weekAppointments.value.map((appointment) => getAppointmentWithInfo(appointment)),
)

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
    clickable: canCreate.value,
  }
}

// ── Proportional calendar layout ──
const PX_PER_MINUTE = 1.8  // each minute = 1.8px height

function getSlotTopPx(totalMinutes) {
  const base = timeSlots.value.length > 0 ? timeSlots.value[0].total : 0
  return (totalMinutes - base) * PX_PER_MINUTE
}

function getTotalCalendarHeight() {
  if (timeSlots.value.length === 0) return 0
  const first = timeSlots.value[0].total
  const last = timeSlots.value[timeSlots.value.length - 1].total + SLOT_MINUTES
  return (last - first) * PX_PER_MINUTE
}

/** Compute positioned appointments for a given day, including column layout for overlaps */
function getDayAppointmentBlocks(date) {
  const dateStr = dayjs(date).format('YYYY-MM-DD')
  const baseMinutes = timeSlots.value.length > 0 ? timeSlots.value[0].total : 0
  const dayAppts = weekAppointmentRows.value.filter((appointment) => dayjs(appointment.startTime).format('YYYY-MM-DD') === dateStr)
  return buildDayAppointmentLayout(dayAppts, {
    baseMinutes,
    pxPerMinute: PX_PER_MINUTE,
    minHeight: 20,
  })
}

const showCreateDialog = ref(false)
const appointmentDialogMode = ref('create')
const editingAppointmentId = ref('')
const selectedSlotValue = ref('')
const preferredSlotStartTime = ref('')
const availabilityLoading = ref(false)
const availabilityState = ref({ slots: [], duration: 0, slotStepMinutes: 10 })
const quickCreateMode = ref(false)
const quickPatientForm = ref({ firstName: '', lastName: '', email: '' })
const quickCreating = ref(false)
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

const isEditingAppointment = computed(() =>
  appointmentDialogMode.value === 'edit' && !!editingAppointmentId.value,
)

const appointmentDialogTitle = computed(() =>
  isEditingAppointment.value ? t('appointments.editAppointmentDialog') : t('appointments.newAppointmentDialog'),
)

watch(serviceOptions, (options) => {
  if (!options.length) return
  if (!options.some((option) => option.key === newAppt.value.serviceType)) {
    newAppt.value.serviceType = options[0].key
  }
}, { immediate: true })

const selectedServiceConfig = computed(() => getServiceTypeConfig(newAppt.value.serviceType))
const requiresRoomSelection = computed(() => Boolean(selectedServiceConfig.value?.roomRequired))
const filteredRooms = computed(() => {
  const tag = selectedServiceConfig.value?.requiredTag
  return settingsStore.activeRooms.filter((room) => {
    if (!tag) return true
    const tags = Array.isArray(room.supportTags) ? room.supportTags : []
    return tags.length === 0 || tags.includes(tag)
  })
})
const practitionerOptions = computed(() => practitioners.value.filter((item) => canPractitionerProvideService(item, newAppt.value.serviceType)))
const availabilitySlots = computed(() => Array.isArray(availabilityState.value.slots) ? availabilityState.value.slots : [])
const selectedAvailabilitySlot = computed(() => availabilitySlots.value.find((slot) => slot.startTime === selectedSlotValue.value) || null)
const appointmentEndTimeLabel = computed(() => selectedAvailabilitySlot.value?.endTime ? formatTime(selectedAvailabilitySlot.value.endTime) : '')

watch([() => newAppt.value.serviceType, practitionerOptions, filteredRooms], () => {
  if (newAppt.value.practitionerId && !practitionerOptions.value.some((item) => String(item.id) === String(newAppt.value.practitionerId))) {
    newAppt.value.practitionerId = ''
  }
  if (!requiresRoomSelection.value) {
    newAppt.value.roomId = ''
    return
  }
  if (newAppt.value.roomId && filteredRooms.value.some((room) => String(room.id) === String(newAppt.value.roomId))) return
  if (filterRoom.value && filteredRooms.value.some((room) => String(room.id) === String(filterRoom.value))) {
    newAppt.value.roomId = filterRoom.value
  }
})

function openCreateDialog({ date, practitionerId, preferredStartTime } = {}) {
  appointmentDialogMode.value = 'create'
  editingAppointmentId.value = ''
  newAppt.value = {
    patientId: '',
    practitionerId: practitionerId ?? filterPractitioner.value ?? '',
    roomId: filterRoom.value || '',
    serviceType: serviceOptions.value[0]?.key || 'acupuncture_new',
    date: date || dayjs(currentDate.value).format('YYYY-MM-DD'),
    notes: '',
    intakeFormData: { chiefComplaint: '', allergies: '', currentMedications: '', medicalHistory: '' },
  }
  preferredSlotStartTime.value = preferredStartTime || ''
  selectedSlotValue.value = ''
  showCreateDialog.value = true
}

function openEditDialog(appointment = selectedAppt.value) {
  if (!appointment?.id) return
  appointmentDialogMode.value = 'edit'
  editingAppointmentId.value = appointment.id
  newAppt.value = {
    patientId: appointment.patientId || '',
    practitionerId: appointment.practitionerId || '',
    roomId: appointment.roomId || '',
    serviceType: appointment.serviceType || serviceOptions.value[0]?.key || 'acupuncture_new',
    date: dayjs(appointment.startTime).format('YYYY-MM-DD'),
    notes: appointment.notes || '',
    intakeFormData: {
      ...buildEmptyIntakeForm(),
      ...(appointment.intakeFormData || {}),
    },
  }
  preferredSlotStartTime.value = appointment.startTime || ''
  selectedSlotValue.value = appointment.startTime || ''
  showDetailDialog.value = false
  showCreateDialog.value = true
}

function closeCreateDialog() {
  showCreateDialog.value = false
  appointmentDialogMode.value = 'create'
  editingAppointmentId.value = ''
  preferredSlotStartTime.value = ''
  selectedSlotValue.value = ''
  quickCreateMode.value = false
  quickPatientForm.value = { firstName: '', lastName: '', email: '' }
}

async function quickCreatePatient() {
  const firstName = quickPatientForm.value.firstName?.trim()
  const lastName = quickPatientForm.value.lastName?.trim()
  const email = quickPatientForm.value.email?.trim()
  if (!lastName || !firstName) return ElMessage.warning('请输入病人姓和名')
  if (!email) return ElMessage.warning('请输入病人邮箱')
  const name = `${lastName} ${firstName}`.trim()
  quickCreating.value = true
  try {
    const patient = await patientsStore.addPatient({
      name,
      firstName,
      lastName,
      emails: [email],
    })
    newAppt.value.patientId = patient.id
    quickCreateMode.value = false
    quickPatientForm.value = { firstName: '', lastName: '', email: '' }
    ElMessage.success(`病人「${patient.name}」已创建`)
  } catch (error) {
    ElMessage.error(error.message || '创建病人失败')
  } finally {
    quickCreating.value = false
  }
}

function handleScheduleCellClick(date, totalMinutes) {
  if (!canCreate.value) return
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

  if (!newAppt.value.date || !newAppt.value.serviceType) {
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
      roomId: newAppt.value.roomId || null,
      excludeId: isEditingAppointment.value ? editingAppointmentId.value : null,
    })
    if (requestId !== availabilityRequestId) return
    availabilityState.value = {
      slots: response?.slots || [],
      duration: Number(response?.duration || 0),
      slotStepMinutes: Math.max(10, Number(response?.slotStepMinutes ?? 10) || 10),
    }
    syncSelectedSlot()
  } catch (error) {
    if (requestId !== availabilityRequestId) return
    availabilityState.value = {
      slots: [],
      duration: Number(selectedServiceConfig.value?.duration || 0),
      slotStepMinutes: 10,
    }
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
  if (!selectedAvailabilitySlot.value) {
    return ElMessage.warning(availabilitySlots.value.length ? t('appointments.selectStartTime') : t('appointments.noAvailableSlots'))
  }

  try {
    const created = await appointmentsStore.createAppointment({
      ...newAppt.value,
      practitionerId: newAppt.value.practitionerId || selectedAvailabilitySlot.value.assignedPractitionerId || null,
      roomId: selectedAvailabilitySlot.value.roomId || newAppt.value.roomId || null,
      startTime: selectedAvailabilitySlot.value.startTime,
      endTime: selectedAvailabilitySlot.value.endTime,
      branchId: branchesStore.currentBranchId || null,
    })
    selectedAppt.value = getAppointmentWithInfo(created)
    ElMessage.success(t('appointments.appointmentCreated'))
    closeCreateDialog()
  } catch (error) {
    ElMessage.error(error.message || t('appointments.slotUnavailable'))
  }
}

async function submitAppointment() {
  if (!newAppt.value.patientId) return ElMessage.warning(t('appointments.selectPatient'))
  if (!newAppt.value.serviceType) return ElMessage.warning(t('appointments.selectServiceType'))
  if (!selectedAvailabilitySlot.value) {
    return ElMessage.warning(availabilitySlots.value.length ? t('appointments.selectStartTime') : t('appointments.noAvailableSlots'))
  }

  const payload = {
    ...newAppt.value,
    practitionerId: newAppt.value.practitionerId || selectedAvailabilitySlot.value.assignedPractitionerId || null,
    roomId: selectedAvailabilitySlot.value.roomId || newAppt.value.roomId || null,
    startTime: selectedAvailabilitySlot.value.startTime,
    endTime: selectedAvailabilitySlot.value.endTime,
    branchId: branchesStore.currentBranchId || null,
  }

  try {
    if (isEditingAppointment.value) {
      const updated = await appointmentsStore.updateAppointment(editingAppointmentId.value, payload)
      selectedAppt.value = getAppointmentWithInfo(updated)
      closeCreateDialog()
      ElMessage.success(t('appointments.appointmentUpdated'))
      return
    }
    await createAppointment()
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
    ElMessage.success(t('appointments.appointmentConfirmed'))
  } catch (error) {
    ElMessage.error(error.message || t('appointments.slotUnavailable'))
  }
}

// ── Time block (时间占用) ──
const showTimeBlockDialog = ref(false)
const TIME_BLOCK_TYPES = [
  { value: 'sick_leave', label: '请假' },
  { value: 'meeting', label: '会议' },
  { value: 'training', label: '培训' },
  { value: 'personal', label: '私事' },
  { value: 'other', label: '其他' },
]
const timeBlockForm = ref({
  practitionerId: '',
  date: dayjs().format('YYYY-MM-DD'),
  startTime: '09:00',
  endTime: '18:00',
  blockType: 'sick_leave',
  reason: '',
})

function openTimeBlockDialog() {
  timeBlockForm.value = {
    practitionerId: filterPractitioner.value || '',
    date: dayjs(currentDate.value).format('YYYY-MM-DD'),
    startTime: '09:00',
    endTime: '18:00',
    blockType: 'sick_leave',
    reason: '',
  }
  showTimeBlockDialog.value = true
}

function getBlockTypeLabel(blockType) {
  return TIME_BLOCK_TYPES.find((item) => item.value === blockType)?.label || blockType || '时间占用'
}

async function submitTimeBlock() {
  const form = timeBlockForm.value
  if (!form.practitionerId) return ElMessage.warning('请选择医师')
  if (!form.date) return ElMessage.warning('请选择日期')
  if (!form.startTime || !form.endTime) return ElMessage.warning('请选择时间范围')
  if (form.startTime >= form.endTime) return ElMessage.warning('结束时间必须晚于开始时间')

  const startTime = dayjs(form.date).format('YYYY-MM-DD') + ' ' + form.startTime + ':00'
  const endTime = dayjs(form.date).format('YYYY-MM-DD') + ' ' + form.endTime + ':00'

  try {
    await appointmentsStore.createTimeBlock({
      practitionerId: form.practitionerId,
      startTime,
      endTime,
      reason: (form.blockType ? getBlockTypeLabel(form.blockType) + (form.reason ? ': ' : '') : '') + (form.reason || ''),
      branchId: branchesStore.currentBranchId || null,
    })
    ElMessage.success('时间占用已创建')
    showTimeBlockDialog.value = false
  } catch (error) {
    ElMessage.error(error.message || '创建失败')
  }
}

function isTimeBlock(appointment) {
  return appointment?.serviceType === 'time_block' || appointment?.status === 'blocked'
}

const STATUS_COLORS = { booked: '#409eff', confirmed: '#2d6a4f', completed: '#889096', cancelled: '#c0c4cc', blocked: '#6b7280' }
const BLOCK_PALETTES = {
  booked: { bg: '#f4a261', accent: '#d97706', footer: '#d97706', text: '#fff' },
  confirmed: { bg: '#6abf7b', accent: '#2d6a4f', footer: '#2d6a4f', text: '#fff' },
  completed: { bg: '#a8b1bd', accent: '#64748b', footer: '#64748b', text: '#fff' },
  cancelled: { bg: '#d1d5db', accent: '#9ca3af', footer: '#9ca3af', text: '#374151' },
  blocked: { bg: '#9ca3af', accent: '#6b7280', footer: '#4b5563', text: '#fff' },
}

function getStatusTagType(status) {
  if (status === 'confirmed') return 'success'
  if (status === 'completed') return 'info'
  if (status === 'cancelled') return 'info'
  return 'warning'
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = parseInt(full, 16)
  return Number.isFinite(n) ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 } : { r: 244, g: 162, b: 97 }
}

function textColorOn(bg) {
  const { r, g, b } = hexToRgb(bg)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1f2937' : '#fff'
}

function getAppointmentBlockStyle(block) {
  const isBlock = isTimeBlock(block)
  const practitionerColor = resolvePractitionerColor(block.practitioner)
  const roomColor = block.room ? resolveRoomColor(block.room) : (BLOCK_PALETTES[block?.status] || BLOCK_PALETTES.booked).bg
  const statusFooter = (BLOCK_PALETTES[block?.status] || BLOCK_PALETTES.booked).footer
  const bg = isBlock ? '#d1d5db' : roomColor
  return {
    top: `${block.top}px`,
    height: `${block.height}px`,
    left: `calc(${block.leftPct}% + 3px)`,
    width: `calc(${block.widthPct}% - 6px)`,
    background: isBlock
      ? `repeating-linear-gradient(135deg, #d1d5db, #d1d5db 6px, #c0c4cc 6px, #c0c4cc 12px)`
      : roomColor,
    color: isBlock ? '#374151' : textColorOn(roomColor),
    borderLeft: `5px solid ${isBlock ? '#6b7280' : practitionerColor}`,
    '--block-accent': isBlock ? '#6b7280' : practitionerColor,
    '--block-footer': isBlock ? '#4b5563' : statusFooter,
  }
}

async function handleSendPreviewEmail() {
  emailSending.value = true
  try {
    await sendEmail()
    ElMessage.success(t('common.emailSent'))
  } catch (error) {
    ElMessage.error(error.message || '邮件发送失败')
  } finally {
    emailSending.value = false
  }
}
</script>

<template>
  <div class="appointment-view">
    <div class="appt-toolbar">
      <div class="toolbar-left">
        <el-button size="small" @click="goToday">{{ t('appointments.today') }}</el-button>
        <el-button circle size="small" :icon="'ArrowLeft'" @click="prevPage" />
        <el-button circle size="small" :icon="'ArrowRight'" @click="nextPage" />
        <span class="week-label">{{ formatDate(visibleDays[0]) }} – {{ formatDate(visibleDays[visibleDays.length - 1]) }}</span>
      </div>
      <div class="toolbar-right">
        <el-select v-model="filterRoom" clearable size="small" style="width:180px" placeholder="全部诊室">
          <el-option v-for="room in settingsStore.activeRooms" :key="room.id" :label="room.name" :value="room.id" />
        </el-select>
        <el-select v-model="filterPractitioner" clearable size="small" style="width:180px" :placeholder="t('appointments.allPractitioners')">
          <el-option v-for="practitioner in practitioners" :key="practitioner.id" :label="practitioner.name" :value="practitioner.id" />
        </el-select>
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="calendar">{{ t('appointments.calendarView') }}</el-radio-button>
          <el-radio-button value="list">{{ t('appointments.listView') }}</el-radio-button>
        </el-radio-group>
        <el-button v-if="canEditOwnSchedule" size="small" plain @click="openMyScheduleDrawer">{{ t('appointments.mySchedule') }}</el-button>
        <el-button v-if="canCreate" type="primary" size="small" @click="openCreateDialog()">
          <el-icon><Plus /></el-icon> {{ t('appointments.newAppointment') }}
        </el-button>
        <el-button v-if="canCreate" type="warning" size="small" plain @click="openTimeBlockDialog()">
          <el-icon><Clock /></el-icon> 添加时间占用
        </el-button>
      </div>
    </div>

    <div class="schedule-panel">
      <div class="schedule-meta">
        <div>
          <div class="schedule-title">
            {{ viewMode === 'calendar'
              ? (filterPractitioner ? t('appointments.scheduleHintFiltered') : t('appointments.scheduleHintAll'))
              : t('appointments.listViewTitle') }}
          </div>
          <div class="schedule-subtitle">
            {{ viewMode === 'calendar'
              ? (filterPractitioner ? t('appointments.scheduleHintFilteredHelp') : t('appointments.scheduleHintAllHelp'))
              : t('appointments.listViewHelp') }}
          </div>
        </div>
        <div v-if="viewMode === 'calendar'" class="schedule-legend">
          <span><i class="dot available" />{{ t('appointments.scheduleLegendAvailable') }}</span>
          <span><i class="dot booked" />{{ t('appointments.scheduleLegendBooked') }}</span>
          <span v-if="filterPractitioner"><i class="dot outside" />{{ t('appointments.scheduleLegendOutside') }}</span>
        </div>
      </div>

      <div v-if="viewMode === 'calendar'" class="schedule-scroll">
        <div class="schedule-grid" :style="{ '--cal-height': getTotalCalendarHeight() + 'px' }">
          <!-- Header row -->
          <div class="sg-head-row">
            <div class="sg-header sg-time-col">{{ t('appointments.timeAxis') }}</div>
            <div v-for="day in visibleDays" :key="'h'+day" class="sg-header" :class="{ today: isToday(day) }">
              <div>{{ dayjs(day).format('ddd') }}</div>
              <div>{{ dayjs(day).format('MM-DD') }}</div>
            </div>
          </div>

          <!-- Time axis + day columns body -->
          <div class="sg-body-row">
            <!-- Time labels column -->
            <div class="sg-time-axis" :style="{ height: getTotalCalendarHeight() + 'px' }">
              <div v-for="slot in timeSlots" :key="slot.label" class="sg-time-label" :style="{ top: getSlotTopPx(slot.total) + 'px' }">
                {{ slot.label }}
              </div>
            </div>

            <!-- Day columns -->
            <div
              v-for="day in visibleDays"
              :key="'d'+day"
              class="sg-day-col"
              :style="{ height: getTotalCalendarHeight() + 'px' }"
            >
              <!-- Grid lines at each slot -->
              <div v-for="slot in timeSlots" :key="slot.label" class="sg-gridline" :style="{ top: getSlotTopPx(slot.total) + 'px' }" />

              <!-- Working hour background bands -->
              <template v-if="selectedPractitioner">
                <div
                  v-for="(range, ri) in getWorkingRanges(selectedPractitioner, day)"
                  :key="'w'+ri"
                  class="sg-working-band"
                  :style="{ top: getSlotTopPx(range.startMinutes) + 'px', height: ((range.endMinutes - range.startMinutes) * PX_PER_MINUTE) + 'px' }"
                />
              </template>

              <div
                v-for="slot in timeSlots"
                :key="'c'+slot.label"
                class="sg-click-area"
                :style="{ top: getSlotTopPx(slot.total) + 'px', height: (SLOT_MINUTES * PX_PER_MINUTE) + 'px' }"
                :class="{ clickable: canCreate }"
                :data-testid="`appointment-slot-${dayjs(day).format('YYYY-MM-DD')}-${slot.label}`"
                @click="handleScheduleCellClick(day, slot.total)"
              />

              <!-- Appointment blocks -->
              <button
                v-for="block in getDayAppointmentBlocks(day)"
                :key="block.id"
                type="button"
                class="appt-block"
                :data-testid="`appointment-block-${block.id}`"
                :class="{ 'appt-block-overlap': block.hasOverlap }"
                :style="getAppointmentBlockStyle(block)"
                @click.stop="viewAppt(block)"
              >
                <span
                  v-for="(segment, index) in block.overlapSegments"
                  :key="`${block.id}-overlap-${index}`"
                  class="appt-block-overlap-segment"
                  :style="{ top: `${segment.top}px`, height: `${segment.height}px` }"
                />
                <div class="appt-block-content">
                  <div class="appt-block-time">{{ formatTime(block.startTime) }} - {{ formatTime(block.endTime) }}</div>
                  <strong v-if="isTimeBlock(block)">🚫 {{ block.notes || '时间占用' }}</strong>
                  <strong v-else>{{ block.patient?.name || t('appointments.unknown') }}</strong>
                  <div class="appt-block-svc">
                    <template v-if="isTimeBlock(block)">{{ block.practitioner?.name || '-' }}</template>
                    <template v-else>{{ block.serviceLabel }}<template v-if="!filterPractitioner"> · {{ block.practitioner?.name || '-' }}</template></template>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="appointment-list-panel">
        <div v-if="weekAppointmentRows.length === 0" class="empty-state">
          <el-empty :description="t('appointments.noAppointmentsThisWeek')" />
        </div>
        <div v-else class="wide-table-wrap">
          <el-table :data="weekAppointmentRows" stripe>
            <el-table-column :label="t('common.date')" width="110">
              <template #default="{ row }">{{ formatDate(row.startTime) }}</template>
            </el-table-column>
            <el-table-column :label="t('common.time')" width="150">
              <template #default="{ row }">{{ formatTime(row.startTime) }} - {{ formatTime(row.endTime) }}</template>
            </el-table-column>
            <el-table-column :label="t('appointments.patient')" min-width="110">
              <template #default="{ row }">
                <template v-if="isTimeBlock(row)"><el-tag type="info" size="small">🚫 {{ row.notes || '时间占用' }}</el-tag></template>
                <template v-else>{{ row.patient?.name || t('appointments.unknown') }}</template>
              </template>
            </el-table-column>
            <el-table-column :label="t('appointments.service')" min-width="140">
              <template #default="{ row }">
                <template v-if="isTimeBlock(row)">时间占用</template>
                <template v-else>{{ row.serviceLabel }}</template>
              </template>
            </el-table-column>
            <el-table-column :label="t('appointments.practitioner')" min-width="100">
              <template #default="{ row }">{{ row.practitioner?.name || '-' }}</template>
            </el-table-column>
            <el-table-column :label="t('appointments.room')" min-width="100">
              <template #default="{ row }">{{ row.room?.name || '-' }}</template>
            </el-table-column>
            <el-table-column :label="t('common.status')" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusTagType(row.status)" size="small">{{ t('appointmentStatus.' + row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.operation')" width="180">
              <template #default="{ row }">
                <el-button size="small" text type="primary" @click="viewAppt(row)">{{ t('common.view') }}</el-button>
                <el-button
                  v-if="canEditAppointments && row.status !== 'cancelled' && !isTimeBlock(row)"
                  size="small"
                  text
                  type="warning"
                  @click="openEditDialog(row)"
                >
                  {{ t('common.edit') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>

    <el-drawer
      v-model="showCreateDialog"
      :title="appointmentDialogTitle"
      size="640px"
      direction="rtl"
      :close-on-press-escape="true"
      @close="closeCreateDialog"
    >
      <el-form :model="newAppt" label-width="96px">
        <el-form-item :label="t('appointments.patient')" required>
          <template v-if="!quickCreateMode">
            <div style="display:flex;gap:8px;width:100%">
              <el-select v-model="newAppt.patientId" filterable :placeholder="t('appointments.searchPatient')" style="flex:1">
                <el-option
                  v-for="patient in patientsStore.activePatients"
                  :key="patient.id"
                  :label="patient.name + ' (' + (patient.emails?.[0] || patient.mobilePhone || '') + ')'"
                  :value="patient.id"
                />
              </el-select>
              <el-button v-if="!isEditingAppointment" size="small" @click="quickCreateMode = true">新建</el-button>
            </div>
          </template>
          <template v-else>
            <div style="width:100%">
              <div style="display:flex;gap:8px;margin-bottom:8px">
                <el-input v-model="quickPatientForm.lastName" placeholder="姓 Last name" style="flex:1" />
                <el-input v-model="quickPatientForm.firstName" placeholder="名 First name" style="flex:1" />
                <el-input v-model="quickPatientForm.email" placeholder="邮箱" style="flex:1" />
              </div>
              <div style="display:flex;gap:8px">
                <el-button type="primary" size="small" :loading="quickCreating" @click="quickCreatePatient">创建并选择</el-button>
                <el-button size="small" @click="quickCreateMode = false">取消</el-button>
              </div>
            </div>
          </template>
        </el-form-item>

        <el-form-item :label="t('appointments.practitioner')">
          <el-select v-model="newAppt.practitionerId" :placeholder="t('appointments.allPractitioners')" style="width:100%">
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

        <el-form-item v-if="requiresRoomSelection" :label="t('appointments.room')">
          <el-select v-model="newAppt.roomId" clearable placeholder="自动分配或选择诊室" style="width:100%">
            <el-option v-for="room in filteredRooms" :key="room.id" :label="room.name" :value="room.id" />
          </el-select>
        </el-form-item>

        <!-- 诊室已改为自动分配, 不在此处选择 -->

        <el-form-item :label="t('appointments.dateLabel')" required>
          <el-date-picker v-model="newAppt.date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>

        <el-form-item :label="t('appointments.startTime')" required>
          <div class="availability-wrapper">
            <div v-if="availabilityLoading" class="availability-empty">{{ t('common.loading') }}</div>
            <div v-else-if="!availabilitySlots.length" class="availability-empty">
              {{ t('appointments.noAvailableSlots') }}
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
        <el-button type="primary" @click="submitAppointment">
          {{ isEditingAppointment ? t('appointments.saveAppointmentChanges') : t('appointments.confirmAppointment') }}
        </el-button>
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

    <el-drawer v-model="showDetailDialog" :title="isTimeBlock(selectedAppt) ? '时间占用详情' : t('appointments.appointmentDetail')" size="420px" direction="rtl">
      <div v-if="selectedAppt" class="detail-panel">
        <template v-if="isTimeBlock(selectedAppt)">
          <div class="detail-row"><span class="detail-label">医师</span><span class="detail-value">{{ selectedAppt.practitioner?.name || '-' }}</span></div>
          <div class="detail-row"><span class="detail-label">时间</span><span class="detail-value">{{ formatDateTime(selectedAppt.startTime) }} - {{ formatTime(selectedAppt.endTime) }}</span></div>
          <div class="detail-row">
            <span class="detail-label">状态</span>
            <el-tag type="info" size="small">时间占用</el-tag>
          </div>
          <div v-if="selectedAppt.notes" class="detail-row"><span class="detail-label">原因</span><span class="detail-value">{{ selectedAppt.notes }}</span></div>
        </template>
        <template v-else>
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
        </template>
      </div>
      <template #footer>
        <el-button @click="showDetailDialog = false">{{ t('common.close') }}</el-button>
        <template v-if="isTimeBlock(selectedAppt)">
          <el-button v-if="canCancel" type="danger" size="small" @click="cancelAppt(selectedAppt.id)">取消占用</el-button>
        </template>
        <template v-else>
          <el-button
            v-if="canEditAppointments && selectedAppt?.status !== 'cancelled'"
            type="warning"
            size="small"
            @click="openEditDialog(selectedAppt)"
          >
            {{ t('common.edit') }}
          </el-button>
          <el-button v-if="canCreate && selectedAppt?.status === 'booked'" type="success" size="small" @click="confirmAppt(selectedAppt.id)">{{ t('appointments.confirmAppt') }}</el-button>
          <el-button v-if="canCancel && ['booked', 'confirmed'].includes(selectedAppt?.status)" type="danger" size="small" @click="cancelAppt(selectedAppt.id)">{{ t('appointments.cancelAppt') }}</el-button>
          <el-button v-if="selectedAppt?.patient" type="primary" size="small" @click="$router.push(`/patients/${selectedAppt.patientId}`); showDetailDialog = false">{{ t('appointments.viewPatient') }}</el-button>
        </template>
      </template>
    </el-drawer>

    <el-dialog v-model="showTimeBlockDialog" title="添加时间占用" width="480px" :close-on-click-modal="false">
      <el-form :model="timeBlockForm" label-width="90px">
        <el-form-item label="医师" required>
          <el-select v-model="timeBlockForm.practitionerId" :placeholder="t('appointments.allPractitioners')" style="width:100%">
            <el-option v-for="practitioner in practitioners" :key="practitioner.id" :label="practitioner.name" :value="practitioner.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期" required>
          <el-date-picker v-model="timeBlockForm.date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="开始时间" required>
          <el-time-select v-model="timeBlockForm.startTime" start="00:00" end="23:30" step="00:30" placeholder="开始时间" style="width:100%" />
        </el-form-item>
        <el-form-item label="结束时间" required>
          <el-time-select v-model="timeBlockForm.endTime" start="00:00" end="23:30" step="00:30" placeholder="结束时间" style="width:100%" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="timeBlockForm.blockType" style="width:100%">
            <el-option v-for="opt in TIME_BLOCK_TYPES" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="timeBlockForm.reason" placeholder="可选，如：全天请假" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTimeBlockDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitTimeBlock">确认占用</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="showEmailDialog" :title="t('email.preview')" size="520px" direction="rtl">
      <el-form label-width="60px" size="small">
        <el-form-item :label="t('email.recipient')"><el-input v-model="emailData.to" /></el-form-item>
        <el-form-item :label="t('email.subject')"><el-input v-model="emailData.subject" /></el-form-item>
        <el-form-item :label="t('email.body')"><el-input v-model="emailData.body" type="textarea" :rows="10" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEmailDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="emailSending" @click="handleSendPreviewEmail">{{ t('common.sendEmail') }}</el-button>
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
.appointment-list-panel { padding: 0 16px 16px; }
.wide-table-wrap { width:100%; overflow:auto; }
/* ── Proportional schedule grid ── */
.schedule-grid { display:flex; flex-direction:column; min-width:920px; }
.schedule-grid .sg-header { flex:1; text-align:center; padding:10px 8px; background:#f8fafc; border:1px solid #edf2f7; color:#1b4332; font-weight:600; font-size:13px; }
.schedule-grid .sg-header.today { background:#eefbf0; }
.schedule-grid .sg-header.sg-time-col { flex:0 0 72px; font-size:12px; color:#64748b; }
.schedule-grid .sg-head-row > .sg-header, .sg-body-row > .sg-time-axis, .sg-body-row > .sg-day-col { border-right:1px solid #edf2f7; }
.schedule-grid .sg-head-row { display:flex; }
.sg-body-row { display:flex; flex:1; }
.sg-time-axis { position:relative; flex:0 0 72px; background:#fbfdff; }
.sg-time-label { position:absolute; left:0; width:100%; padding:0 8px; font-size:11px; font-weight:600; color:#64748b; transform:translateY(-7px); pointer-events:none; }
.sg-day-col { position:relative; flex:1; min-width:120px; background:#fff; }
.sg-gridline { position:absolute; left:0; right:0; border-top:1px solid #edf2f7; pointer-events:none; }
.sg-working-band { position:absolute; left:0; right:0; background:#f6fff7; pointer-events:none; z-index:0; }
.sg-click-area { position:absolute; left:0; right:0; z-index:1; }
.sg-click-area.clickable:hover { background:rgba(45,106,79,0.06); cursor:pointer; }
.appt-block { position:absolute; z-index:2; box-sizing:border-box; border:0; border-radius:8px; padding:0; text-align:left; cursor:pointer; overflow:hidden; font-size:11px; line-height:1.3; transition:box-shadow 0.15s, transform 0.15s; box-shadow:0 3px 10px rgba(15,23,42,0.14); }
.appt-block::after { content:''; position:absolute; left:0; right:0; bottom:0; height:4px; background:var(--block-footer); opacity:0.45; }
.appt-block:hover { box-shadow:0 6px 18px rgba(15,23,42,0.2); z-index:3; transform:translateY(-1px); }
.appt-block-content { position:relative; z-index:1; display:flex; flex-direction:column; gap:1px; padding:5px 11px 7px 6px; height:100%; }
.appt-block-overlap-segment { position:absolute; right:0; width:5px; border-radius:4px 0 0 4px; background:var(--block-accent); opacity:0.95; z-index:1; }
.appt-block-time { font-size:10px; opacity:0.9; }
.appt-block strong { font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.appt-block-svc { font-size:10px; opacity:0.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
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
  .toolbar-right :deep(.el-radio-group) { width:100%; display:flex; }
  .toolbar-right :deep(.el-radio-button) { flex:1; }
  .appointment-list-panel { padding: 0 12px 12px; }
  .wide-table-wrap :deep(.el-table) { min-width: 880px; }
}
</style>
