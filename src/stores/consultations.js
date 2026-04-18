import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { emptyDiff, normalizeDiff } from '../utils/sampleData'
import { consultationsApi } from '../utils/api'
import { useInventoryStore } from './inventory'
import { readStoredJson, writeStoredJson } from '../utils/storage'
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
  const inventoryStore = useInventoryStore()

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
    const list = await consultationsApi.list()
    consultations.value = (Array.isArray(list) ? list : []).map(normalizeConsultation)
    saveState()
    return consultations.value
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
      parentConsultationId: data.parentConsultationId || null,
      date: data.date || new Date().toISOString().split('T')[0],
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
    consultations.value.push(created)
    saveState()
    return created
  }

  async function updateConsultation(id, updates, userId) {
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx === -1) return false
    const updated = await consultationsApi.update(id, updates)
    // 合并API返回和本地更新数据，确保处方等嵌套数据不丢失
    consultations.value[idx] = {
      ...consultations.value[idx],
      ...updates,
      ...updated,
      // 优先使用本地传入的处方数据（API可能不返回完整的嵌套对象）
      prescriptions: updates.prescriptions || updated.prescriptions || consultations.value[idx].prescriptions || [],
      acupuncture: updates.acupuncture || updated.acupuncture || consultations.value[idx].acupuncture || [],
      services: updates.services || updated.services || consultations.value[idx].services || [],
      documents: updates.documents || updated.documents || consultations.value[idx].documents || [],
      diff: updates.diff || updated.diff || consultations.value[idx].diff || {},
    }
    saveState()
    return consultations.value[idx]
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
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx !== -1) consultations.value[idx] = updated
    saveState()
    return true
  }

  async function markAsPaid(id, paymentInfo = {}) {
    const updated = await consultationsApi.createPayment(id, paymentInfo)
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx === -1) return null
    consultations.value[idx] = updated
    saveState()
    return updated
  }

  async function deleteConsultation(id) {
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx === -1) return false
    const updated = await consultationsApi.softDelete(id)
    consultations.value[idx] = updated
    saveState()
    await refreshInventoryAfterPrescriptionChange()
    return true
  }

  async function restoreConsultation(id) {
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx !== -1) {
      const updated = await consultationsApi.restore(id)
      consultations.value[idx] = updated
      saveState()
      await refreshInventoryAfterPrescriptionChange()
    }
  }

  async function physicalDeleteConsultation(id) {
    await consultationsApi.hardDelete(id)
    consultations.value = consultations.value.filter((c) => c.id !== id)
    saveState()
    return true
  }

  const deletedConsultations = computed(() => consultations.value.filter((c) => c.deletedAt))

  const todayConsultations = computed(() => {
    const today = new Date().toISOString().split('T')[0]
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
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx !== -1) consultations.value[idx] = updated
    saveState()
    return updated
  }

  async function syncPrescription(id, payload) {
    const updated = await consultationsApi.syncPrescription(id, payload)
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx !== -1) consultations.value[idx] = updated
    saveState()
    await refreshInventoryAfterPrescriptionChange()
    return updated
  }

  async function completePrescription(id, prescriptionId, payload = {}) {
    const updated = await consultationsApi.completePrescription(id, prescriptionId, payload)
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx !== -1) consultations.value[idx] = updated
    saveState()
    await refreshInventoryAfterPrescriptionChange()
    return updated
  }

  async function deletePrescription(id, prescriptionId, payload = {}) {
    const updated = await consultationsApi.deletePrescription(id, prescriptionId, payload)
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx !== -1) consultations.value[idx] = updated
    saveState()
    await refreshInventoryAfterPrescriptionChange()
    return updated
  }

  async function reopenPrescription(id, prescriptionId) {
    const updated = await consultationsApi.reopenPrescription(id, prescriptionId)
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx !== -1) consultations.value[idx] = updated
    saveState()
    await refreshInventoryAfterPrescriptionChange()
    return updated
  }

  async function dispensePrescription(id, prescriptionId) {
    const updated = await consultationsApi.dispensePrescription(id, prescriptionId)
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx !== -1) consultations.value[idx] = updated
    saveState()
    return updated
  }

  init()

  return {
    consultations, todayConsultations, pendingPrescriptions, pendingPayments,
    deletedConsultations,
    hasDispensingCompleted,
    getOutstandingAmount,
    getPaymentStatus,
    refreshFromApi,
    getConsultation, getPatientConsultations, getPractitionerConsultations, getLastConsultation,
    createConsultation, updateConsultation, completeConsultation, markAsPaid,
    deleteConsultation, restoreConsultation, physicalDeleteConsultation,
    markDispensingComplete, syncPatientHistorySnapshot,
    syncPrescription, completePrescription, deletePrescription, reopenPrescription, dispensePrescription,
  }
})
