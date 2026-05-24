import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { SERVICE_TYPES } from '../utils/sampleData'
import { settingsApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'
import { cloneDefaultEmailTemplates, normalizeEmailTemplates } from '../utils/emailTemplates'

const DEFAULT_CLINIC_NAME = 'TCM Clinic Management System'
const DEFAULT_CURRENCY = 'CAD'
const DEFAULT_PATENT_MEDICINES = []
const DEFAULT_FORMULA_CATEGORIES = ['经典方', '经验方', '自拟方']
const DEFAULT_DIFFERENTIATION_NAMES = ['Qi deficiency', 'Blood deficiency', 'Qi stagnation', 'Blood stasis', 'Damp heat', 'Cold damp', 'Yin deficiency', 'Yang deficiency']
const DEFAULT_CONSENT_TEMPLATE = {
  title: 'OTCM Acupuncture Clinic Informed Consent',
  version: 'otcm-consent-2026-04',
  sections: [
    {
      key: 'patient_consent',
      title: 'Patient Consent / 患者同意',
      paragraphs: [
        'I consent to Traditional Chinese Medicine diagnosis and treatments including acupuncture, Chinese herbal medicine, auricular acupuncture, cupping, and related modalities provided by the clinic team.',
        'I understand treatment methods may include acupuncture, electrical stimulation, moxibustion, cupping, skin scraping, bloodletting, Tui-Na, Chinese herbal medicine, medicated diet, and other related TCM therapies.',
      ],
    },
    {
      key: 'risks_and_side_effects',
      title: 'Risks and Side Effects / 风险与副作用',
      paragraphs: [
        'I understand that possible side effects include bruising, bleeding, numbness or tingling, dizziness or fainting, temporary skin marks, allergic reactions, and other unexpected responses.',
        'I understand rare risks may include infection, burns or scarring from moxibustion, tissue damage, organ puncture, spontaneous miscarriage, and other serious complications.',
      ],
    },
    {
      key: 'herbal_medicine_and_pregnancy',
      title: 'Herbal Medicine and Pregnancy / 草药与怀孕',
      paragraphs: [
        'I understand that some herbs or acupuncture points may be inappropriate during pregnancy or while breastfeeding.',
        'I agree to notify the clinic immediately if I experience unpleasant effects, or if I am or become pregnant.',
      ],
    },
    {
      key: 'medical_history_disclosure',
      title: 'Medical History Disclosure / 病史披露',
      paragraphs: [
        'I confirm that I have disclosed relevant health history, medications, allergies, implants, bleeding disorders, pacemaker, infectious diseases, and other information needed for safe care.',
      ],
    },
    {
      key: 'confidentiality',
      title: 'Confidentiality / 隐私保密',
      paragraphs: [
        'I understand my clinical and administrative records will be kept confidential and will not be released without my written consent except where required by law.',
      ],
    },
    {
      key: 'financial_obligations',
      title: 'Financial Obligations / 费用责任',
      paragraphs: [
        'I understand the fees are not covered under OHIP and I am responsible for full and prompt payment after services have been rendered.',
        'I understand treatment fees, herbs, and other goods or services are non-refundable after purchase or service completion unless clinic policy states otherwise.',
      ],
    },
    {
      key: 'cancellation_policy',
      title: 'Cancellation, No-Show, and Purchase Policy / 取消与缺席政策',
      paragraphs: [
        'I understand appointments are reserved specifically for me and the clinic requests at least 24 hours notice for cancellation or rescheduling.',
      ],
    },
    {
      key: 'consent_statement',
      title: 'Consent Statement / 同意声明',
      paragraphs: [
        'By signing this consent, I confirm that I have read, understood, and had the opportunity to ask questions about the benefits, risks, and alternatives of treatment.',
        'I understand that I may withdraw consent at any time by clearly notifying the clinic.',
      ],
    },
  ],
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

function normalizeConsentParagraphs(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function buildConsentSectionKey(title, index, usedKeys) {
  const base = String(title || `section_${index + 1}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `section_${index + 1}`
  let key = base
  let suffix = 2
  while (usedKeys.has(key)) {
    key = `${base}_${suffix}`
    suffix += 1
  }
  usedKeys.add(key)
  return key
}

function normalizeConsentTemplate(value) {
  let source = value
  if (typeof source === 'string' && source.trim()) {
    try {
      source = JSON.parse(source)
    } catch {
      source = null
    }
  }
  if (!source || typeof source !== 'object') source = DEFAULT_CONSENT_TEMPLATE
  const usedKeys = new Set()
  const sections = (Array.isArray(source.sections) ? source.sections : DEFAULT_CONSENT_TEMPLATE.sections)
    .map((section, index) => {
      const title = String(section?.title || '').trim()
      const paragraphs = normalizeConsentParagraphs(section?.paragraphs)
      if (!title && !paragraphs.length) return null
      const rawKey = String(section?.key || '').trim()
      let key = rawKey || buildConsentSectionKey(title, index, usedKeys)
      if (rawKey) {
        if (usedKeys.has(key)) key = buildConsentSectionKey(key, index, usedKeys)
        else usedKeys.add(key)
      }
      return {
        key,
        title: title || `Section ${index + 1}`,
        paragraphs: paragraphs.length ? paragraphs : [''],
      }
    })
    .filter(Boolean)
  return {
    title: String(source.title || DEFAULT_CONSENT_TEMPLATE.title).trim() || DEFAULT_CONSENT_TEMPLATE.title,
    version: String(source.version || DEFAULT_CONSENT_TEMPLATE.version).trim() || DEFAULT_CONSENT_TEMPLATE.version,
    sections: sections.length ? sections : DEFAULT_CONSENT_TEMPLATE.sections,
  }
}

function normalizeStripeSettings(value = {}) {
  return {
    publishableKey: String(value?.publishableKey || value?.stripePublishableKey || '').trim(),
    terminalReaderId: String(value?.terminalReaderId || value?.stripeTerminalReaderId || '').trim(),
    secretKeyConfigured: Boolean(value?.secretKeyConfigured),
    secretKeyMasked: String(value?.secretKeyMasked || '').trim(),
    webhookSecretConfigured: Boolean(value?.webhookSecretConfigured),
    webhookSecretMasked: String(value?.webhookSecretMasked || '').trim(),
  }
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
  const emailTemplates = ref(cloneDefaultEmailTemplates())
  const consentTemplate = ref(normalizeConsentTemplate())
  const thirdPartySignature = ref({ path: '', url: '', uploadedAt: '' })
  const clinicSeal = ref({ path: '', url: '', uploadedAt: '' })
  const practitionerProfile = ref({ practitionerName: '', organization: '', organizationNumber: '' })
  const stripeSettings = ref(normalizeStripeSettings())
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
    emailTemplates.value = normalizeEmailTemplates(data?.emailTemplates)
    consentTemplate.value = normalizeConsentTemplate(data?.consentTemplate)
    thirdPartySignature.value = {
      path: data?.thirdPartySignature?.path || data?.thirdPartySignaturePath || '',
      url: data?.thirdPartySignature?.url || data?.thirdPartySignatureUrl || '',
      uploadedAt: data?.thirdPartySignature?.uploadedAt || '',
    }
    clinicSeal.value = {
      path: data?.clinicSeal?.path || data?.clinicSealPath || '',
      url: data?.clinicSeal?.url || data?.clinicSealUrl || '',
      uploadedAt: data?.clinicSeal?.uploadedAt || '',
    }
    practitionerProfile.value = {
      practitionerName: data?.practitionerProfile?.practitionerName || data?.practitionerName || '',
      organization: data?.practitionerProfile?.organization || data?.practitionerOrganization || '',
      organizationNumber: data?.practitionerProfile?.organizationNumber || data?.practitionerOrganizationNumber || '',
    }
    stripeSettings.value = normalizeStripeSettings(data?.stripeSettings)
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
      emailTemplates: normalizeEmailTemplates(emailTemplates.value),
      consentTemplate: normalizeConsentTemplate(consentTemplate.value),
      thirdPartySignature: thirdPartySignature.value,
      clinicSeal: clinicSeal.value,
      practitionerProfile: practitionerProfile.value,
      stripeSettings: stripeSettings.value,
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
    if (updates.consentTemplate !== undefined) consentTemplate.value = normalizeConsentTemplate(updates.consentTemplate)
    const payload = { ...updates }
    if (updates.emailTemplates !== undefined) {
      emailTemplates.value = normalizeEmailTemplates(updates.emailTemplates)
      payload.emailTemplates = emailTemplates.value
    }
    if (updates.thirdPartySignature !== undefined) thirdPartySignature.value = { ...thirdPartySignature.value, ...updates.thirdPartySignature }
    if (updates.clinicSeal !== undefined) clinicSeal.value = { ...clinicSeal.value, ...updates.clinicSeal }
    if (updates.practitionerProfile !== undefined) practitionerProfile.value = { ...practitionerProfile.value, ...updates.practitionerProfile }
    if (updates.stripeSettings !== undefined) {
      stripeSettings.value = normalizeStripeSettings(updates.stripeSettings)
      delete payload.stripeSettings
    }
    const updated = await settingsApi.updateBase(payload)
    if (updated?.emailTemplates) emailTemplates.value = normalizeEmailTemplates(updated.emailTemplates)
    if (updated?.consentTemplate) consentTemplate.value = normalizeConsentTemplate(updated.consentTemplate)
    if (updated?.thirdPartySignature) thirdPartySignature.value = { ...thirdPartySignature.value, ...updated.thirdPartySignature }
    if (updated?.clinicSeal) clinicSeal.value = { ...clinicSeal.value, ...updated.clinicSeal }
    if (updated?.practitionerProfile) practitionerProfile.value = { ...practitionerProfile.value, ...updated.practitionerProfile }
    if (updated?.stripeSettings) stripeSettings.value = normalizeStripeSettings(updated.stripeSettings)
    saveState()
  }

  async function updateStripeSettings(updates) {
    const updated = await settingsApi.updateStripeSettings(updates)
    stripeSettings.value = normalizeStripeSettings(updated)
    saveState()
    return stripeSettings.value
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

  async function uploadClinicSealPng(file) {
    const uploaded = await settingsApi.uploadSealPng(file)
    const nextSeal = {
      path: uploaded.path || uploaded.resource || '',
      url: uploaded.url || '',
      uploadedAt: uploaded.uploadedAt || new Date().toISOString(),
    }
    await updateSettings({ clinicSeal: nextSeal })
    return nextSeal
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
    consentTemplate,
    thirdPartySignature,
    clinicSeal,
    practitionerProfile,
    stripeSettings,
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
    uploadClinicSealPng,
    updateStripeSettings,
  }
})
