import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dayjs } from '../utils/dateUtils'
import { appointmentsApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

export const useAppointmentsStore = defineStore('appointments', () => {
  const appointments = ref([])

  function init() {
    appointments.value = readStoredJson('tcm_appointments', []) || []
  }

  function saveState() {
    writeStoredJson('tcm_appointments', appointments.value)
  }

  function upsertAppointment(appointment) {
    if (!appointment?.id) return appointment
    const idx = appointments.value.findIndex((item) => item.id === appointment.id)
    if (idx === -1) {
      appointments.value.push(appointment)
    } else {
      appointments.value[idx] = appointment
    }
    saveState()
    return appointment
  }

  function getAppointment(id) {
    return appointments.value.find((a) => a.id === id) || null
  }

  function getPatientAppointments(patientId) {
    return appointments.value
      .filter((a) => a.patientId === patientId)
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
  }

  function getPractitionerAppointments(practitionerId) {
    return appointments.value.filter((a) => a.practitionerId === practitionerId)
  }

  function getDayAppointments(date) {
    const d = dayjs(date).format('YYYY-MM-DD')
    return appointments.value.filter((a) => {
      return dayjs(a.startTime).format('YYYY-MM-DD') === d
    })
  }

  // 检查时间槽是否可用（委托后端统一检查医师冲突和诊室冲突）
  async function isSlotAvailable(practitionerId, roomId, startTime, duration, excludeId = null) {
    const endTime = dayjs(startTime).add(duration, 'minute').toISOString()
    return await appointmentsApi.checkSlot({
      practitionerId,
      roomId,
      startTime,
      endTime,
      duration,
      excludeId,
    })
  }

  async function getAvailability({ date, serviceType, practitionerId, roomId, excludeId } = {}) {
    return appointmentsApi.availability({
      date,
      serviceType,
      practitionerId,
      roomId,
      excludeId,
    })
  }

  async function createAppointment(data) {
    const newAppt = {
      patientId: data.patientId,
      practitionerId: data.practitionerId || null,
      roomId: data.roomId || null,
      serviceType: data.serviceType,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status || 'booked',
      intakeFormData: data.intakeFormData || {},
      notes: data.notes || '',
      branchId: data.branchId || null,
      createdAt: data.createdAt || new Date().toISOString(),
    }
    const created = await appointmentsApi.create(newAppt)
    return upsertAppointment(created)
  }

  async function updateAppointment(id, updates) {
    const idx = appointments.value.findIndex((a) => a.id === id)
    if (idx !== -1) {
      const updated = await appointmentsApi.update(id, updates)
      return upsertAppointment(updated)
    }
    return null
  }

  async function cancelAppointment(id) {
    const updated = await appointmentsApi.status(id, 'cancelled')
    return upsertAppointment(updated)
  }

  async function confirmAppointment(id) {
    const updated = await appointmentsApi.status(id, 'confirmed')
    return upsertAppointment(updated)
  }

  async function completeAppointment(id) {
    const updated = await appointmentsApi.status(id, 'completed')
    return upsertAppointment(updated)
  }

  function getBranchAppointments(branchId) {
    if (!branchId) return appointments.value
    return appointments.value.filter(a => a.branchId === branchId || !a.branchId)
  }

  // 今日预约
  const todayAppointments = computed(() => {
    const today = dayjs().format('YYYY-MM-DD')
    return appointments.value
      .filter((a) => {
        return dayjs(a.startTime).format('YYYY-MM-DD') === today && a.status !== 'cancelled'
      })
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
  })

  // 即将到来的预约（今天及以后）
  const upcomingAppointments = computed(() => {
    const now = new Date()
    return appointments.value
      .filter((a) => new Date(a.startTime) >= now && a.status !== 'cancelled')
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
  })

  init()

  return {
    appointments,
    todayAppointments,
    upcomingAppointments,
    getAppointment,
    getPatientAppointments,
    getPractitionerAppointments,
    getDayAppointments,
    isSlotAvailable,
    getAvailability,
    getBranchAppointments,
    createAppointment,
    updateAppointment,
    cancelAppointment,
    confirmAppointment,
    completeAppointment,
  }
})
