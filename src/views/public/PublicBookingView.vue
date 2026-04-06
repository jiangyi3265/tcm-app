<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { publicBookingApi } from '../../utils/api'
import { formatTime, dayjs } from '../../utils/dateUtils'
import { ElMessage } from 'element-plus'

const { t } = useI18n()

const loading = ref(true)
const availabilityLoading = ref(false)
const serviceTypes = ref([])
const practitioners = ref([])
const rooms = ref([])
const availabilitySlots = ref([])
const selectedSlotValue = ref('')
const successState = ref(null)

const form = ref({
  patientName: '',
  phone: '',
  email: '',
  practitionerId: '',
  roomId: '',
  serviceType: '',
  date: dayjs().format('YYYY-MM-DD'),
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
const selectedSlot = computed(() => availabilitySlots.value.find((slot) => slot.startTime === selectedSlotValue.value) || null)

function getPractitionerName(id) {
  return practitioners.value.find((item) => String(item.id) === String(id))?.name || id || '-'
}

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

async function loadAvailability() {
  if (!form.value.serviceType || !form.value.date || (requiresRoomSelection.value && !form.value.roomId)) {
    availabilitySlots.value = []
    selectedSlotValue.value = ''
    return
  }

  availabilityLoading.value = true
  try {
    const response = await publicBookingApi.availability({
      date: form.value.date,
      serviceType: form.value.serviceType,
      practitionerId: form.value.practitionerId || null,
      roomId: requiresRoomSelection.value ? form.value.roomId : null,
    })
    availabilitySlots.value = Array.isArray(response?.slots) ? response.slots : []
    if (!availabilitySlots.value.some((slot) => slot.startTime === selectedSlotValue.value)) {
      selectedSlotValue.value = availabilitySlots.value[0]?.startTime || ''
    }
  } catch (error) {
    availabilitySlots.value = []
    selectedSlotValue.value = ''
    ElMessage.error(error.message || t('publicBooking.loadFailed'))
  } finally {
    availabilityLoading.value = false
  }
}

watch(
  [() => form.value.serviceType, () => form.value.practitionerId, () => form.value.roomId, () => form.value.date],
  () => { void loadAvailability() },
)

async function submitBooking() {
  if (!form.value.patientName.trim()) return ElMessage.warning(t('publicBooking.nameRequired'))
  if (!form.value.phone.trim()) return ElMessage.warning(t('publicBooking.phoneRequired'))
  if (!form.value.serviceType) return ElMessage.warning(t('appointments.selectServiceType'))
  if (requiresRoomSelection.value && !form.value.roomId) return ElMessage.warning(t('appointments.selectRoomFirst'))
  if (!selectedSlot.value) return ElMessage.warning(t('appointments.selectStartTime'))

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
    successState.value = response?.appointment || { startTime: selectedSlot.value.startTime, practitionerId: selectedSlot.value.assignedPractitionerId }
  } catch (error) {
    ElMessage.error(error.message || t('publicBooking.submitFailed'))
  }
}

onMounted(() => { void loadOptions() })
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

      <el-skeleton v-if="loading" :rows="8" animated />

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

        <div class="grid two-col">
          <el-form-item :label="t('appointments.dateLabel')" required>
            <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
          </el-form-item>
          <div />
        </div>

        <el-form-item :label="t('appointments.startTime')" required>
          <div class="slot-wrapper">
            <div v-if="availabilityLoading" class="slot-empty">{{ t('common.loading') }}</div>
            <div v-else-if="!availabilitySlots.length" class="slot-empty">
              {{ requiresRoomSelection && !form.roomId ? t('appointments.selectRoomFirst') : t('appointments.noAvailableSlots') }}
            </div>
            <div v-else class="slot-grid">
              <button
                v-for="slot in availabilitySlots"
                :key="slot.startTime"
                type="button"
                class="slot-button"
                :class="{ active: selectedSlotValue === slot.startTime }"
                @click="selectedSlotValue = slot.startTime"
              >
                <div>{{ formatTime(slot.startTime) }} - {{ formatTime(slot.endTime) }}</div>
                <small v-if="!form.practitionerId">{{ t('publicBooking.assignedPractitioner', { name: getPractitionerName(slot.assignedPractitionerId) }) }}</small>
              </button>
            </div>
          </div>
        </el-form-item>

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
.public-card { max-width:920px; margin:0 auto; background:#fff; border-radius:18px; padding:24px; box-shadow:0 18px 50px rgba(15,23,42,0.08); }
.success-card { text-align:center; }
.page-head h1 { margin:0; color:#1b4332; }
.page-head p { margin:8px 0 0; color:#64748b; }
.public-form { margin-top:20px; }
.grid { display:grid; gap:16px; }
.two-col { grid-template-columns:repeat(2,minmax(0,1fr)); }
.slot-wrapper { display:flex; flex-direction:column; gap:10px; }
.slot-empty { padding:16px; border:1px dashed #d1d5db; border-radius:12px; background:#fafafa; color:#6b7280; }
.slot-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:10px; }
.slot-button { border:1px solid #dbeafe; background:#f8fbff; border-radius:12px; padding:12px; text-align:left; cursor:pointer; }
.slot-button.active { border-color:#2d6a4f; background:#eefaf0; }
.slot-button small { display:block; margin-top:6px; color:#6b7280; }
.actions { display:flex; justify-content:flex-end; }

@media (max-width: 768px) {
  .two-col { grid-template-columns:1fr; }
  .public-card { padding:18px; }
}
</style>
