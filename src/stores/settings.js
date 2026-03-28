import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { SERVICE_TYPES } from '../utils/sampleData'
import { settingsApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

const DEFAULT_CLINIC_NAME = 'TCM Clinic Management System'

export const useSettingsStore = defineStore('settings', () => {
  const taxRate = ref(0.13)
  const rooms = ref([])
  const serviceTypes = ref({ ...SERVICE_TYPES })
  const practitionerInterval = ref(20)
  const profitRatio = ref(1.0)
  const clinicName = ref(DEFAULT_CLINIC_NAME)
  const clinicAddress = ref('')
  const clinicPhone = ref('')
  const priceLists = ref([])
  const customChiefComplaints = ref([])
  // 每个医师的预约间隔: { [practitionerId]: minutes }
  const practitionerIntervals = ref({})

  function init() {
    const data = readStoredJson('tcm_settings', null)
    taxRate.value = data?.taxRate ?? 0.13
    rooms.value = data?.rooms || []
    serviceTypes.value = data?.serviceTypes || { ...SERVICE_TYPES }
    practitionerInterval.value = data?.practitionerInterval ?? 20
    profitRatio.value = data?.profitRatio ?? 1.0
    clinicName.value = data?.clinicName || DEFAULT_CLINIC_NAME
    clinicAddress.value = data?.clinicAddress || ''
    clinicPhone.value = data?.clinicPhone || ''
    priceLists.value = data?.priceLists || []
    customChiefComplaints.value = data?.customChiefComplaints || []
    practitionerIntervals.value = data?.practitionerIntervals || {}
  }

  function saveState() {
    writeStoredJson('tcm_settings', {
      taxRate: taxRate.value,
      rooms: rooms.value,
      serviceTypes: serviceTypes.value,
      practitionerInterval: practitionerInterval.value,
      profitRatio: profitRatio.value,
      clinicName: clinicName.value,
      clinicAddress: clinicAddress.value,
      clinicPhone: clinicPhone.value,
      priceLists: priceLists.value,
      customChiefComplaints: customChiefComplaints.value,
      practitionerIntervals: practitionerIntervals.value,
    })
  }

  function addCustomChiefComplaint(complaint) {
    if (!complaint || customChiefComplaints.value.includes(complaint)) return
    customChiefComplaints.value.push(complaint)
    saveState()
  }

  function getPractitionerInterval(practitionerId) {
    return practitionerIntervals.value[practitionerId] ?? practitionerInterval.value
  }

  async function setPractitionerInterval(practitionerId, minutes) {
    const previous = { ...practitionerIntervals.value }
    const parsedMinutes = Number(minutes)
    try {
      if (!practitionerId || !Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
        delete practitionerIntervals.value[practitionerId]
      } else {
        practitionerIntervals.value[practitionerId] = parsedMinutes
      }
      const updated = await settingsApi.updateBase({ practitionerIntervals: practitionerIntervals.value })
      if (updated?.practitionerIntervals && typeof updated.practitionerIntervals === 'object') {
        practitionerIntervals.value = updated.practitionerIntervals
      }
      saveState()
      return practitionerIntervals.value
    } catch (error) {
      practitionerIntervals.value = previous
      throw error
    }
  }

  async function updateTaxRate(rate) {
    taxRate.value = rate
    await settingsApi.updateBase({ taxRate: rate })
    saveState()
  }

  async function addRoom(room) {
    const newRoom = { id: `room-${Date.now()}`, ...room, branchId: room.branchId || null, isActive: true }
    const created = await settingsApi.addRoom(newRoom)
    rooms.value.push(created)
    saveState()
    return created
  }

  async function updateRoom(id, updates) {
    const idx = rooms.value.findIndex((room) => room.id === id)
    if (idx === -1) return null
    const updated = await settingsApi.updateRoom(id, updates)
    rooms.value[idx] = updated
    saveState()
    return updated
  }

  async function deleteRoom(id) {
    await settingsApi.updateRoom(id, { isActive: false })
    rooms.value = rooms.value.filter((room) => room.id !== id)
    saveState()
  }

  async function updateServiceType(key, updates) {
    const updated = await settingsApi.updateServiceType(key, updates)
    serviceTypes.value[key] = updated
    saveState()
  }

  async function updateSettings(updates) {
    if (updates.taxRate !== undefined) taxRate.value = updates.taxRate
    if (updates.practitionerInterval !== undefined) practitionerInterval.value = updates.practitionerInterval
    if (updates.profitRatio !== undefined) profitRatio.value = updates.profitRatio
    if (updates.clinicName !== undefined) clinicName.value = updates.clinicName
    if (updates.clinicAddress !== undefined) clinicAddress.value = updates.clinicAddress
    if (updates.clinicPhone !== undefined) clinicPhone.value = updates.clinicPhone
    await settingsApi.updateBase(updates)
    saveState()
  }

  const activeRooms = computed(() => rooms.value.filter((room) => room.isActive))

  async function addPriceList(data) {
    const priceList = {
      name: data.name,
      effectiveDate: data.effectiveDate || new Date().toISOString().split('T')[0],
      isActive: true,
      items: data.items || [],
      createdAt: new Date().toISOString(),
    }
    const created = await settingsApi.addPriceList(priceList)
    priceLists.value.push(created)
    saveState()
    return created
  }

  async function updatePriceList(id, updates) {
    const idx = priceLists.value.findIndex((priceList) => priceList.id === id)
    if (idx === -1) return null
    const updated = await settingsApi.updatePriceList(id, updates)
    priceLists.value[idx] = updated
    saveState()
    return updated
  }

  async function deletePriceList(id) {
    const idx = priceLists.value.findIndex((priceList) => priceList.id === id)
    if (idx === -1) return
    const updated = await settingsApi.deletePriceList(id)
    priceLists.value[idx] = updated
    saveState()
  }

  const activePriceLists = computed(() => priceLists.value.filter((priceList) => priceList.isActive))

  init()

  return {
    taxRate,
    rooms,
    activeRooms,
    serviceTypes,
    practitionerInterval,
    practitionerIntervals,
    profitRatio,
    clinicName,
    clinicAddress,
    clinicPhone,
    priceLists,
    activePriceLists,
    customChiefComplaints,
    updateTaxRate,
    addRoom,
    updateRoom,
    deleteRoom,
    updateServiceType,
    updateSettings,
    addPriceList,
    updatePriceList,
    deletePriceList,
    addCustomChiefComplaint,
    getPractitionerInterval,
    setPractitionerInterval,
  }
})
