import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { emptyDiff } from '../utils/sampleData'
import { consultationsApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

function genConsultId() {
  const n = Math.random().toString(36).substring(2, 7).toUpperCase()
  const m = Math.random().toString(36).substring(2, 7).toUpperCase()
  return `ORD-${n}-${m}`
}

export const useConsultationsStore = defineStore('consultations', () => {
  const consultations = ref([])

  function init() {
    consultations.value = readStoredJson('tcm_consultations', []) || []
  }

  function saveState() {
    writeStoredJson('tcm_consultations', consultations.value)
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
    return consultations.value.filter((c) => c.practitionerId === practitionerId)
  }

  function getLastConsultation(patientId) {
    const list = getPatientConsultations(patientId)
    return list.length >= 1 ? list[0] : null
  }

  async function createConsultation(data) {
    const newConsult = {
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
      diff: data.diff || emptyDiff(),
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
    consultations.value[idx] = updated
    saveState()
    return updated
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
    const updated = await consultationsApi.paid(id, paymentInfo)
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
    return true
  }

  async function restoreConsultation(id) {
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx !== -1) {
      const updated = await consultationsApi.restore(id)
      consultations.value[idx] = updated
      saveState()
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
      (c) => c.status === 'paid' && c.prescriptionType !== 'none' && !c.dispensingCompleted && !c.deletedAt,
    ),
  )

  const pendingPayments = computed(() =>
    consultations.value.filter((c) => c.status === 'completed' && !c.deletedAt),
  )

  async function markDispensingComplete(id) {
    const updated = await consultationsApi.dispense(id)
    const idx = consultations.value.findIndex((c) => c.id === id)
    if (idx !== -1) consultations.value[idx] = updated
    saveState()
    return updated
  }

  init()

  return {
    consultations, todayConsultations, pendingPrescriptions, pendingPayments,
    deletedConsultations,
    getConsultation, getPatientConsultations, getPractitionerConsultations, getLastConsultation,
    createConsultation, updateConsultation, completeConsultation, markAsPaid,
    deleteConsultation, restoreConsultation, physicalDeleteConsultation,
    markDispensingComplete, syncPatientHistorySnapshot,
  }
})
