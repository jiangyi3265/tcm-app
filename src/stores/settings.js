import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { SERVICE_TYPES } from '../utils/sampleData'
import { settingsApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

const DEFAULT_CLINIC_NAME = 'TCM Clinic Management System'
const DEFAULT_CURRENCY = 'CAD'
const DEFAULT_PATENT_MEDICINES = []
const DEFAULT_FORMULA_CATEGORIES = ['经典方', '经验方', '自拟方']
const DEFAULT_DIFFERENTIATION_NAMES = ['Qi deficiency', 'Blood deficiency', 'Qi stagnation', 'Blood stasis', 'Damp heat', 'Cold damp', 'Yin deficiency', 'Yang deficiency']
const DEFAULT_EMAIL_TEMPLATES = {
  appointmentConfirmation: { subject: '{{clinicName}}｜预约确认', body: '您好 {{patientName}}，您的预约已确认：{{appointmentDate}} {{appointmentTime}}。地址：{{clinicAddress}}。' },
  appointmentCancellation: { subject: '{{clinicName}}｜预约取消通知', body: '您好 {{patientName}}，您的预约已取消。如需重新预约，请联系诊所。' },
  consultationRecord: { subject: '{{clinicName}}｜问诊记录', body: '您好 {{patientName}}，本次问诊记录已生成。问诊编号：{{consultationId}}，日期：{{consultationDate}}。如有疑问请联系诊所。' },
  invoice: { subject: '{{clinicName}}｜发票', body: '您好 {{patientName}}，您的发票已生成，金额：{{amount}}。感谢您的到访。' },
  reminder: { subject: '{{clinicName}}｜预约提醒', body: '您好 {{patientName}}，提醒您将在 {{appointmentDate}} {{appointmentTime}} 到诊。' },
  consent: { subject: '{{clinicName}}｜知情同意书签署', body: '您好 {{patientName}}，请在就诊前阅读并签署知情同意书：{{consentLink}}。' },
  intake: { subject: '{{clinicName}}｜就诊资料表', body: '您好 {{patientName}}，请在就诊前填写就诊资料表：{{intakeLink}}。' },
}

function normalizeTagList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
  }
  if (typeof value === 'string' && value.trim()) {
    const text = value.trim()
    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        const parsed = JSON.parse(text)
        if (Array.isArray(parsed)) {
          return [...new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean))]
        }
      } catch {
        // fall through to comma-delimited parsing
      }
    }
    if (text.includes(',')) {
      return [...new Set(text.split(',').map((item) => String(item || '').trim()).filter(Boolean))]
    }
    return [text]
  }
  return []
}

function normalizeEditableList(value, fallback = []) {
  let source = value
  if (typeof source === 'string' && source.trim()) {
    try {
      const parsed = JSON.parse(source)
      source = parsed
    } catch {
      source = source.split(/[,，\n]/)
    }
  }
  if (!Array.isArray(source)) source = fallback
  return [...new Set(source.map((item) => String(item || '').trim()).filter(Boolean))]
}

function normalizeRoom(room = {}) {
  return {
    ...room,
    supportTags: normalizeTagList(room.supportTags),
    branchId: room.branchId || null,
    isActive: room.isActive !== false,
  }
}

function normalizeServiceType(key, config = {}) {
  const fallback = SERVICE_TYPES[key] || {}
  return {
    ...fallback,
    ...config,
    key,
    requiredTag: config.requiredTag ?? fallback.requiredTag ?? '',
    roomRequired: Boolean(config.roomRequired ?? fallback.roomRequired),
    publicVisible: config.publicVisible !== undefined ? Boolean(config.publicVisible) : true,
    taxable: config.taxable !== undefined ? Boolean(config.taxable) : (fallback.taxable !== undefined ? Boolean(fallback.taxable) : true),
    pricingVisible: config.pricingVisible !== undefined ? Boolean(config.pricingVisible) : (fallback.pricingVisible !== undefined ? Boolean(fallback.pricingVisible) : true),
  }
}

function normalizeRooms(rooms = []) {
  return Array.isArray(rooms) ? rooms.map((room) => normalizeRoom(room)) : []
}

function normalizeServiceTypes(serviceTypes = {}) {
  const entries = Array.isArray(serviceTypes)
    ? serviceTypes.map((item) => [item?.key ?? item?.serviceKey, item])
    : Object.entries(serviceTypes)
  const normalized = {}
  entries.forEach(([key, config]) => {
    if (!key) return
    normalized[key] = normalizeServiceType(key, config)
  })
  if (Object.keys(normalized).length === 0) {
    Object.entries(SERVICE_TYPES).forEach(([key, fallback]) => {
      normalized[key] = { ...fallback, key }
    })
  }
  return normalized
}

export const useSettingsStore = defineStore('settings', () => {
  const taxRate = ref(0.13)
  const rooms = ref([])
  const serviceTypes = ref({ ...SERVICE_TYPES })
  const practitionerInterval = ref(20)
  const publicBookingAdvanceDays = ref(15)
  const publicBookingDripWindowDays = ref(7)
  const publicBookingDripMinutes = ref(60)
  const profitRatio = ref(1.0)
  const clinicName = ref(DEFAULT_CLINIC_NAME)
  const clinicAddress = ref('')
  const clinicPhone = ref('')
  const currency = ref(DEFAULT_CURRENCY)
  const thirdPartyInvoicePng = ref('')
  const priceLists = ref([])
  const customChiefComplaints = ref([])
  const patentMedicines = ref([...DEFAULT_PATENT_MEDICINES])
  const formulaCategories = ref([...DEFAULT_FORMULA_CATEGORIES])
  const differentiationNames = ref([...DEFAULT_DIFFERENTIATION_NAMES])
  const emailTemplates = ref({ ...DEFAULT_EMAIL_TEMPLATES })
  const thirdPartySignature = ref({ path: '', url: '', uploadedAt: '' })
  const practitionerProfile = ref({ practitionerName: '', organization: '', organizationNumber: '' })
  // 每个医师的预约间隔: { [practitionerId]: minutes }
  const practitionerIntervals = ref({})

  function init() {
    const data = readStoredJson('tcm_settings', null)
    taxRate.value = data?.taxRate ?? 0.13
    rooms.value = normalizeRooms(data?.rooms || [])
    serviceTypes.value = normalizeServiceTypes(data?.serviceTypes || SERVICE_TYPES)
    practitionerInterval.value = data?.practitionerInterval ?? 20
    publicBookingAdvanceDays.value = data?.publicBookingAdvanceDays ?? 15
    publicBookingDripWindowDays.value = data?.publicBookingDripWindowDays ?? 7
    publicBookingDripMinutes.value = data?.publicBookingDripMinutes ?? 60
    profitRatio.value = data?.profitRatio ?? 1.0
    clinicName.value = data?.clinicName || DEFAULT_CLINIC_NAME
    clinicAddress.value = data?.clinicAddress || ''
    clinicPhone.value = data?.clinicPhone || ''
    currency.value = data?.currency || DEFAULT_CURRENCY
    thirdPartyInvoicePng.value = data?.thirdPartyInvoicePng || data?.thirdPartySignature?.path || data?.thirdPartySignaturePath || ''
    priceLists.value = data?.priceLists || []
    customChiefComplaints.value = data?.customChiefComplaints || []
    patentMedicines.value = normalizeEditableList(data?.patentMedicines, DEFAULT_PATENT_MEDICINES)
    formulaCategories.value = normalizeEditableList(data?.formulaCategories, DEFAULT_FORMULA_CATEGORIES)
    differentiationNames.value = normalizeEditableList(data?.differentiationNames, DEFAULT_DIFFERENTIATION_NAMES)
    emailTemplates.value = { ...DEFAULT_EMAIL_TEMPLATES, ...(data?.emailTemplates || {}) }
    thirdPartySignature.value = {
      path: data?.thirdPartySignature?.path || data?.thirdPartySignaturePath || '',
      url: data?.thirdPartySignature?.url || data?.thirdPartySignatureUrl || '',
      uploadedAt: data?.thirdPartySignature?.uploadedAt || '',
    }
    practitionerProfile.value = {
      practitionerName: data?.practitionerProfile?.practitionerName || data?.practitionerName || '',
      organization: data?.practitionerProfile?.organization || data?.practitionerOrganization || '',
      organizationNumber: data?.practitionerProfile?.organizationNumber || data?.practitionerOrganizationNumber || '',
    }
    practitionerIntervals.value = data?.practitionerIntervals || {}
  }

  function saveState() {
    writeStoredJson('tcm_settings', {
      taxRate: taxRate.value,
      rooms: rooms.value,
      serviceTypes: serviceTypes.value,
      practitionerInterval: practitionerInterval.value,
      publicBookingAdvanceDays: publicBookingAdvanceDays.value,
      publicBookingDripWindowDays: publicBookingDripWindowDays.value,
      publicBookingDripMinutes: publicBookingDripMinutes.value,
      profitRatio: profitRatio.value,
      clinicName: clinicName.value,
      clinicAddress: clinicAddress.value,
      clinicPhone: clinicPhone.value,
      currency: currency.value,
      thirdPartyInvoicePng: thirdPartyInvoicePng.value,
      priceLists: priceLists.value,
      customChiefComplaints: customChiefComplaints.value,
      patentMedicines: patentMedicines.value,
      formulaCategories: formulaCategories.value,
      differentiationNames: differentiationNames.value,
      emailTemplates: emailTemplates.value,
      thirdPartySignature: thirdPartySignature.value,
      practitionerProfile: practitionerProfile.value,
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
    const isOverlapKey = minutes === 'overlap1' || minutes === 'overlap2'
    const parsedMinutes = isOverlapKey ? minutes : Number(minutes)
    try {
      if (!practitionerId || (!isOverlapKey && (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0))) {
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
    const newRoom = normalizeRoom({ id: `room-${Date.now()}`, ...room, isActive: true })
    const created = await settingsApi.addRoom(newRoom)
    const merged = normalizeRoom({ ...newRoom, ...created, color: created?.color || newRoom.color })
    rooms.value.push(merged)
    saveState()
    return merged
  }

  async function updateRoom(id, updates) {
    const idx = rooms.value.findIndex((room) => room.id === id)
    if (idx === -1) return null
    const payload = normalizeRoom({ ...rooms.value[idx], ...updates, id })
    const updated = await settingsApi.updateRoom(id, payload)
    const merged = normalizeRoom({ ...rooms.value[idx], ...updated, id, color: updated?.color || updates?.color || rooms.value[idx].color })
    rooms.value[idx] = merged
    saveState()
    return merged
  }

  async function deleteRoom(id) {
    await settingsApi.updateRoom(id, { isActive: false })
    rooms.value = rooms.value.filter((room) => room.id !== id)
    saveState()
  }

  async function addServiceType(key, config) {
    const payload = normalizeServiceType(key, { ...config, key })
    const created = await settingsApi.addServiceType(payload)
    serviceTypes.value[key] = normalizeServiceType(key, { ...created, key })
    saveState()
    return serviceTypes.value[key]
  }

  async function updateServiceType(key, updates) {
    const payload = normalizeServiceType(key, { ...serviceTypes.value[key], ...updates, key })
    const updated = await settingsApi.updateServiceType(key, payload)
    serviceTypes.value[key] = normalizeServiceType(key, { ...serviceTypes.value[key], ...updated, key })
    saveState()
  }

  async function deleteServiceType(key) {
    await settingsApi.deleteServiceType(key)
    delete serviceTypes.value[key]
    saveState()
  }

  async function updateSettings(updates) {
    if (updates.taxRate !== undefined) taxRate.value = updates.taxRate
    if (updates.practitionerInterval !== undefined) practitionerInterval.value = updates.practitionerInterval
    if (updates.publicBookingAdvanceDays !== undefined) publicBookingAdvanceDays.value = updates.publicBookingAdvanceDays
    if (updates.publicBookingDripWindowDays !== undefined) publicBookingDripWindowDays.value = updates.publicBookingDripWindowDays
    if (updates.publicBookingDripMinutes !== undefined) publicBookingDripMinutes.value = updates.publicBookingDripMinutes
    if (updates.profitRatio !== undefined) profitRatio.value = updates.profitRatio
    if (updates.clinicName !== undefined) clinicName.value = updates.clinicName
    if (updates.clinicAddress !== undefined) clinicAddress.value = updates.clinicAddress
    if (updates.clinicPhone !== undefined) clinicPhone.value = updates.clinicPhone
    if (updates.currency !== undefined) currency.value = updates.currency || DEFAULT_CURRENCY
    if (updates.thirdPartyInvoicePng !== undefined) thirdPartyInvoicePng.value = updates.thirdPartyInvoicePng || ''
    if (updates.patentMedicines !== undefined) patentMedicines.value = normalizeEditableList(updates.patentMedicines, DEFAULT_PATENT_MEDICINES)
    if (updates.formulaCategories !== undefined) formulaCategories.value = normalizeEditableList(updates.formulaCategories, DEFAULT_FORMULA_CATEGORIES)
    if (updates.differentiationNames !== undefined) differentiationNames.value = normalizeEditableList(updates.differentiationNames, DEFAULT_DIFFERENTIATION_NAMES)
    if (updates.emailTemplates !== undefined) emailTemplates.value = { ...DEFAULT_EMAIL_TEMPLATES, ...updates.emailTemplates }
    if (updates.thirdPartySignature !== undefined) thirdPartySignature.value = { ...thirdPartySignature.value, ...updates.thirdPartySignature }
    if (updates.practitionerProfile !== undefined) practitionerProfile.value = { ...practitionerProfile.value, ...updates.practitionerProfile }
    const updated = await settingsApi.updateBase(updates)
    if (updated?.emailTemplates) emailTemplates.value = { ...DEFAULT_EMAIL_TEMPLATES, ...updated.emailTemplates }
    if (updated?.thirdPartySignature) thirdPartySignature.value = { ...thirdPartySignature.value, ...updated.thirdPartySignature }
    if (updated?.practitionerProfile) practitionerProfile.value = { ...practitionerProfile.value, ...updated.practitionerProfile }
    saveState()
  }

  async function uploadSignaturePng(file) {
    const uploaded = await settingsApi.uploadSignaturePng(file)
    const nextSignature = {
      path: uploaded.path || uploaded.resource || '',
      url: uploaded.url || '',
      uploadedAt: uploaded.uploadedAt || new Date().toISOString(),
    }
    await updateSettings({ thirdPartySignature: nextSignature, thirdPartyInvoicePng: nextSignature.path })
    return nextSignature
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
    publicBookingAdvanceDays,
    publicBookingDripWindowDays,
    publicBookingDripMinutes,
    practitionerIntervals,
    profitRatio,
    clinicName,
    clinicAddress,
    clinicPhone,
    currency,
    thirdPartyInvoicePng,
    priceLists,
    activePriceLists,
    customChiefComplaints,
    patentMedicines,
    formulaCategories,
    differentiationNames,
    emailTemplates,
    thirdPartySignature,
    practitionerProfile,
    updateTaxRate,
    addRoom,
    updateRoom,
    deleteRoom,
    addServiceType,
    updateServiceType,
    deleteServiceType,
    updateSettings,
    addPriceList,
    updatePriceList,
    deletePriceList,
    addCustomChiefComplaint,
    getPractitionerInterval,
    setPractitionerInterval,
    uploadSignaturePng,
  }
})
