import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { SERVICE_TYPES } from '../utils/sampleData'
import { settingsApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

export const useSettingsStore = defineStore('settings', () => {
  const taxRate = ref(0.13)
  const rooms = ref([])
  const serviceTypes = ref({ ...SERVICE_TYPES })
  const practitionerInterval = ref(20) // minutes
  const profitRatio = ref(1.0)
  const clinicName = ref('中医诊所综合管理系统')
  const clinicAddress = ref('')
  const clinicPhone = ref('')
  const priceLists = ref([])

  function init() {
    const data = readStoredJson('tcm_settings', null)
    taxRate.value = data?.taxRate ?? 0.13
    rooms.value = data?.rooms || []
    serviceTypes.value = data?.serviceTypes || { ...SERVICE_TYPES }
    practitionerInterval.value = data?.practitionerInterval ?? 20
    profitRatio.value = data?.profitRatio ?? 1.0
    clinicName.value = data?.clinicName || '中医诊所综合管理系统'
    clinicAddress.value = data?.clinicAddress || ''
    clinicPhone.value = data?.clinicPhone || ''
    priceLists.value = data?.priceLists || []
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
    })
  }

  async function updateTaxRate(rate) {
    taxRate.value = rate
    await settingsApi.updateBase({ taxRate: rate })
    saveState()
  }

  async function addRoom(room) {
    const newRoom = { id: 'room-' + Date.now(), ...room, branchId: room.branchId || null, isActive: true }
    const created = await settingsApi.addRoom(newRoom)
    rooms.value.push(created)
    saveState()
    return created
  }

  async function updateRoom(id, updates) {
    const idx = rooms.value.findIndex((r) => r.id === id)
    if (idx !== -1) {
      const updated = await settingsApi.updateRoom(id, updates)
      rooms.value[idx] = updated
      saveState()
      return updated
    }
    return null
  }

  async function deleteRoom(id) {
    await settingsApi.updateRoom(id, { isActive: false })
    rooms.value = rooms.value.filter((r) => r.id !== id)
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

  const activeRooms = computed(() => rooms.value.filter((r) => r.isActive))

  // ── 报价单管理 ──
  async function addPriceList(data) {
    const pl = {
      name: data.name,
      effectiveDate: data.effectiveDate || new Date().toISOString().split('T')[0],
      isActive: true,
      items: data.items || [],
      createdAt: new Date().toISOString(),
    }
    const created = await settingsApi.addPriceList(pl)
    priceLists.value.push(created)
    saveState()
    return created
  }

  async function updatePriceList(id, updates) {
    const idx = priceLists.value.findIndex(pl => pl.id === id)
    if (idx !== -1) {
      const updated = await settingsApi.updatePriceList(id, updates)
      priceLists.value[idx] = updated
      saveState()
      return updated
    }
    return null
  }

  async function deletePriceList(id) {
    const idx = priceLists.value.findIndex(pl => pl.id === id)
    if (idx !== -1) {
      await settingsApi.deletePriceList(id)
      priceLists.value.splice(idx, 1)
      saveState()
    }
  }

  const activePriceLists = computed(() => priceLists.value.filter(pl => pl.isActive))

  init()

  return {
    taxRate,
    rooms,
    activeRooms,
    serviceTypes,
    practitionerInterval,
    profitRatio,
    clinicName,
    clinicAddress,
    clinicPhone,
    priceLists,
    activePriceLists,
    updateTaxRate,
    addRoom,
    updateRoom,
    deleteRoom,
    updateServiceType,
    updateSettings,
    addPriceList,
    updatePriceList,
    deletePriceList,
  }
})
