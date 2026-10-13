import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { emptyDiff, normalizeDiff } from '../utils/sampleData'
import { consultationsApi } from '../utils/api'
import { useInventoryStore } from './inventory'
import { readStoredJson, writeStoredJson } from '../utils/storage'
import { todayDate } from '../utils/dateUtils'
import {
  getOutstandingAmount,
  getPaymentStatus,
  getPrescriptionStatus,
  hasAnyPendingPrescription,
} from '../utils/prescriptionWorkflow'

function genConsultId() {
  const n = Math.random().toString(36).substring(2, 7).toUpperCase()
  const m = Math.random().toString(36).substring(2, 7).toUpperCase()
  return `ORD-${n}-${m}`
}

export const useConsultationsStore = defineStore('consultations', () => {
  const consultations = ref([])
  const deletedPrescriptions = ref([])
  const inventoryStore = useInventoryStore()
  let revision = 0

  function upsertConsultation(record, fallback = {}) {
    const normalized = normalizeConsultation({ ...fallback, ...record })
    const index = consultations.value.findIndex((item) => item.id === normalized.id)
    if (index < 0) consultations.value.push(normalized)
    else consultations.value[index] = normalized
    revision += 1
    saveState()
    return normalized
  }

  function normalizeConsultation(consultation) {
    return {
      ...consultation,
      diff: consultation?.diff ? normalizeDiff(consultation.diff) : emptyDiff(),
    }
  }

  function hasDispensingCompleted(consultation) {
    if (!consultation) return false
    if (consultation.dispensingCompleted) return true
    return Array.isArray(consultation.prescriptions)
      && consultation.prescriptions.some((prescription) => getPrescriptionStatus(prescription) === 'dispensed')
  }

  function init() {
    const stored = readStoredJson('tcm_consultations', []) || []
    // 兼容旧数据：规范化所有 diff 字段
    consultations.value = stored.map(normalizeConsultation)
  }

  function saveState() {
    writeStoredJson('tcm_consultations', consultations.value)
  }

  async function refreshFromApi() {
    const startedAtRevision = revision
    const list = await consultationsApi.list()
    if (startedAtRevision !== revision) return consultations.value
    consultations.value = (Array.isArray(list) ? list : []).map(normalizeConsultation)
    saveState()
    return consultations.value
  }

  async function refreshConsultationFromApi(id) {
    if (!id) return null
    const startedAtRevision = revision
    const record = await consultationsApi.get(id)
    if (!record) return null
    if (startedAtRevision !== revision) return getConsultation(record.id) || record
    return upsertConsultation(record)
  }

  async function refreshInventoryAfterPrescriptionChange() {
    try {
      await inventoryStore.refreshFromApi()
    } catch (error) {
      console.warn('处方变更后刷新库存失败:', error.message)
    }
  }

  function getConsultation(id) {
    return consultations.value.find((c) => c.id === id) || null
  }

  function getPatientConsultations(patientId) {
    return consultations.value
      .filter((c) => c.patientId === patientId && !c.deletedAt)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }

  function getPractitionerConsultations(practitionerId) {
    return consultations.value.filter((c) => c.practitionerId === practitionerId && !c.deletedAt)
  }

  function getLastConsultation(patientId) {
    const list = getPatientConsultations(patientId)
    return list.length >= 1 ? list[0] : null
  }

  async function createConsultation(data) {
    const newConsult = {
      id: 'consult-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      consultationId: genConsultId(),
      patientId: data.patientId,
      practitionerId: data.practitionerId,
      appointmentId: data.appointmentId || null,
      parentConsultationId: data.parentConsultationId || null,
      date: data.date || todayDate(),
      status: 'draft',
      // Summary
      chiefComplaint: data.chiefComplaint || '',
      chiefComplaintDuration: data.chiefComplaintDuration || '',
      chiefComplaintDescription: data.chiefComplaintDescription || '',
      progressOfDisease: data.progressOfDisease || '',
      summary: data.summary || '',
      // Differentiation
      diff: normalizeDiff(data.diff || {}),
      differentiation: data.differentiation || '',
      // Treatments
      acupuncture: data.acupuncture || [],
      prescriptions: data.prescriptions || [],
      herbals: data.herbals || [],
      formulaName: data.formulaName || '',
      prescriptionType: data.prescriptionType || 'none',
      prognosis: data.prognosis || '',
      feedback: '',
      previousPrognosisReview: data.previousPrognosisReview || '',
      // Pricing
      servicePriceList: data.servicePriceList || '',
      services: data.services || [],
      consultationFee: data.consultationFee || 0,
      discountType: data.discountType || 'none',
      discountValue: data.discountValue || 0,
      taxable: data.taxable !== undefined ? data.taxable : false,
      includeRxAmount: data.includeRxAmount || false,
      add3rdParty: data.add3rdParty || false,
      currency: data.currency || 'CAD',
      comments: data.comments || '',
      historyAndMedication: data.historyAndMedication || '',
      historyAndMedicationSnapshot: data.historyAndMedicationSnapshot || '',
      historyAndMedicationSourceConsultId: data.historyAndMedicationSourceConsultId || null,
      historyAndMedicationSourceConsultDate: data.historyAndMedicationSourceConsultDate || '',
      // Calculated
      totalAmount: data.totalAmount || 0,
      taxAmount: data.taxAmount || 0,
      totalWithoutTax: data.totalWithoutTax || 0,
      // Branch
      branchId: data.branchId || null,
      // Files
      tongueImage: data.tongueImage || null,
      documents: data.documents || [],
      invoicePdfUrl: null,
      consultationPdfUrl: null,
      // Metadata
      version: 1,
      modifications: [],
      lockedAt: null,
      createdAt: new Date().toISOString(),
    }
    const created = await consultationsApi.create(newConsult)
    const saved = upsertConsultation(created)
    if (saved.prescriptions?.length) await refreshInventoryAfterPrescriptionChange()
    return saved
  }

  async function updateConsultation(id, updates, userId) {
    const updated = await consultationsApi.update(id, updates)
    // The server owns reservation and lifecycle metadata, even when this record
    // was not present in a cached list or that list changed while saving.
    const saved = upsertConsultation(updated, { ...getConsultation(id), ...updates, id })
    if (updates.prescriptions) await refreshInventoryAfterPrescriptionChange()
    return saved
  }

  function syncPatientHistorySnapshot(patientId, snapshot, sourceConsultationId, sourceDate) {
    consultations.value = consultations.value.map((consultation) => {
      if (consultation.patientId !== patientId || consultation.deletedAt) {
        return consultation
      }
      return {
        ...consultation,
        historyAndMedication: snapshot || '',
        historyAndMedicationSnapshot: snapshot || '',
        historyAndMedicationSourceConsultId: sourceConsultationId || null,
        historyAndMedicationSourceConsultDate: sourceDate || '',
      }
    })
    saveState()
  }

  async function completeConsultation(id) {
    const updated = await consultationsApi.complete(id)
    upsertConsultation(updated)
    return updated
  }

  async function reactivateConsultation(id) {
    const updated = await consultationsApi.reactivate(id)
    upsertConsultation(updated)
    return updated
  }

  async function markAsPaid(id, paymentInfo = {}) {
    const updated = await consultationsApi.createPayment(id, paymentInfo)
    upsertConsultation(updated)
    return updated
  }

  async function updateInvoicePricing(id, pricingInfo = {}) {
    const updated = await consultationsApi.updateInvoicePricing(id, pricingInfo)
    upsertConsultation(updated)
    return updated
  }

  async function deleteConsultation(id) {
    const updated = await consultationsApi.softDelete(id)
    upsertConsultation(updated)
    await refreshInventoryAfterPrescriptionChange()
    return true
  }

  async function restoreConsultation(id) {
    const updated = await consultationsApi.restore(id)
    upsertConsultation(updated)
    await refreshInventoryAfterPrescriptionChange()
  }

  async function physicalDeleteConsultation(id) {
    await consultationsApi.hardDelete(id)
    revision += 1
    consultations.value = consultations.value.filter((c) => c.id !== id)
    saveState()
    return true
  }

  async function refreshDeletedPrescriptions() {
    const list = await consultationsApi.deletedPrescriptions()
    deletedPrescriptions.value = Array.isArray(list) ? list : []
    return deletedPrescriptions.value
  }

  async function restoreDeletedPrescription(consultationId, prescriptionId) {
    const updated = await consultationsApi.restoreDeletedPrescription(consultationId, prescriptionId)
    upsertConsultation(updated)
    await refreshDeletedPrescriptions().catch((error) => { console.warn('回收站刷新失败:', error.message) })
    await refreshInventoryAfterPrescriptionChange()
    saveState()
    return updated
  }

  async function permanentlyDeletePrescription(consultationId, prescriptionId, options = {}) {
    const updated = await consultationsApi.hardDeletePrescription(consultationId, prescriptionId, options)
    upsertConsultation(updated)
    await refreshDeletedPrescriptions().catch((error) => { console.warn('回收站刷新失败:', error.message) })
    await refreshInventoryAfterPrescriptionChange()
    saveState()
    return updated
  }

  const deletedConsultations = computed(() => consultations.value.filter((c) => c.deletedAt))

  const todayConsultations = computed(() => {
    const today = todayDate()
    return consultations.value.filter((c) => c.date === today && !c.deletedAt)
  })

  const pendingPrescriptions = computed(() =>
    consultations.value.filter(
      (c) => hasAnyPendingPrescription(c) && !c.deletedAt,
    ),
  )

  const pendingPayments = computed(() =>
    consultations.value.filter((c) => c.status !== 'draft' && !c.deletedAt && getOutstandingAmount(c) > 0),
  )

  async function markDispensingComplete(id) {
    const updated = await consultationsApi.dispense(id)
    upsertConsultation(updated)
    return updated
  }

  async function syncPrescription(id, payload) {
    const updated = await consultationsApi.syncPrescription(id, payload)
    upsertConsultation(updated)
    await refreshInventoryAfterPrescriptionChange()
    return updated
  }

  async function completePrescription(id, prescriptionId, payload = {}) {
    const updated = await consultationsApi.completePrescription(id, prescriptionId, payload)
    upsertConsultation(updated)
    await refreshInventoryAfterPrescriptionChange()
    return updated
  }

  async function deletePrescription(id, prescriptionId, payload = {}) {
    const updated = await consultationsApi.deletePrescription(id, prescriptionId, payload)
    upsertConsultation(updated)
    await refreshDeletedPrescriptions().catch((error) => { console.warn('回收站刷新失败:', error.message) })
    await refreshInventoryAfterPrescriptionChange()
    return updated
  }

  async function reopenPrescription(id, prescriptionId) {
    const updated = await consultationsApi.reopenPrescription(id, prescriptionId)
    upsertConsultation(updated)
    await refreshInventoryAfterPrescriptionChange()
    return updated
  }

  async function dispensePrescription(id, prescriptionId) {
    const updated = await consultationsApi.dispensePrescription(id, prescriptionId)
    upsertConsultation(updated)
    return updated
  }

  init()

  return {
    consultations, todayConsultations, pendingPrescriptions, pendingPayments,
    deletedConsultations, deletedPrescriptions,
    hasDispensingCompleted,
    getOutstandingAmount,
    getPaymentStatus,
    refreshFromApi,
    refreshConsultationFromApi,
    getConsultation, getPatientConsultations, getPractitionerConsultations, getLastConsultation,
    createConsultation, updateConsultation, completeConsultation, reactivateConsultation, markAsPaid, updateInvoicePricing,
    deleteConsultation, restoreConsultation, physicalDeleteConsultation,
    refreshDeletedPrescriptions, restoreDeletedPrescription, permanentlyDeletePrescription,
    markDispensingComplete, syncPatientHistorySnapshot,
    syncPrescription, completePrescription, deletePrescription, reopenPrescription, dispensePrescription,
  }
})
