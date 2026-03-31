<script setup>
import { ref, computed, onMounted, onBeforeUnmount, reactive, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useConsultationsStore } from '../../stores/consultations'
import { usePatientsStore } from '../../stores/patients'
import { useAuthStore } from '../../stores/auth'
import { useInventoryStore } from '../../stores/inventory'
import { useSettingsStore } from '../../stores/settings'
import { useAppointmentsStore } from '../../stores/appointments'
import { useBranchesStore } from '../../stores/branches'
import { useFormulasStore } from '../../stores/formulas'
import { useAcupointsStore } from '../../stores/acupoints'
import { useHerbDictStore } from '../../stores/herbDict'
import { hasPermission } from '../../utils/permissions'
import { formatDate, formatDateTime } from '../../utils/dateUtils'
import { TCM_OPTIONS, CHIEF_COMPLAINTS, emptyDiff, normalizeDiff } from '../../utils/sampleData'
import { printConsultationReport, printPrescription } from '../../utils/pdfExport'
import { useEmailSimulator } from '../../utils/emailSimulator'
import { filesApi, consultationsApi } from '../../utils/api'
import { calculatePrescription, recalcWithSupplier } from '../../utils/prescriptionCalc'
import { rehydrateCopiedPrescriptions } from '../../utils/consultationCopy'
import { localizeMixedText } from '../../utils/localizeMixedText'
import { ElMessage, ElMessageBox } from 'element-plus'
import ConsultationComparePanel from './ConsultationComparePanel.vue'

const { t, locale } = useI18n()

const branchesStore = useBranchesStore()
const { showEmailDialog, emailData, openEmailPreview, sendEmail, buildConsultationReportEmail } = useEmailSimulator()

const route = useRoute()
const router = useRouter()
const consultStore = useConsultationsStore()
const patientsStore = usePatientsStore()
const authStore = useAuthStore()
const inventoryStore = useInventoryStore()
const settingsStore = useSettingsStore()
const appointmentsStore = useAppointmentsStore()
const formulasStore = useFormulasStore()
const acupointsStore = useAcupointsStore()
const herbDictStore = useHerbDictStore()
const isMobile = inject('isMobile', ref(false))

const patientId = route.params.patientId
const consultId = route.params.id
const isNew = route.name === 'consultation-new'

const patient = computed(() => patientsStore.getPatient(patientId))
const roles = computed(() => authStore.roles)
const isReadOnly = computed(() => {
  if (!hasPermission(roles.value, 'consultation.edit')) return true
  if (form.value.lockedAt) return !roles.value.includes('admin')
  return false
})
const canMarkPaid = computed(() => hasPermission(roles.value, 'invoice.manage'))
const canDeleteConsultation = computed(() => hasPermission(roles.value, 'consultation.delete'))

const lastConsultation = computed(() =>
  isNew ? consultStore.getLastConsultation(patientId) : null,
)

const differentiationNameSuggestions = computed(() => {
  const names = new Set()
  for (const consult of consultStore.consultations) {
    const conclusions = Array.isArray(consult?.diff?.conclusions) ? consult.diff.conclusions : []
    for (const item of conclusions) {
      const name = String(item?.name || '').trim()
      if (name) names.add(name)
    }
  }
  return [...names]
})

const differentiationTreatmentSuggestions = computed(() => {
  const treatments = new Set()
  for (const consult of consultStore.consultations) {
    const conclusions = Array.isArray(consult?.diff?.conclusions) ? consult.diff.conclusions : []
    for (const item of conclusions) {
      const treatment = String(item?.treatment || '').trim()
      if (treatment) treatments.add(treatment)
    }
  }
  return [...treatments]
})

// ============ Form Defaults ============
const defaultForm = () => ({
  patientId,
  practitionerId: authStore.userId,
  parentConsultationId: null,
  date: new Date().toISOString().split('T')[0],
  status: 'draft',
  // Summary
  chiefComplaint: '', chiefComplaintDuration: '', chiefComplaintDescription: '',
  progressOfDisease: '',
  summary: '',
  // Differentiation
  diff: emptyDiff(),
  differentiation: '',
  // Treatments
  acupuncture: [],
  prescriptions: [],
  herbals: [],
  formulaName: '',
  prescriptionType: 'none',
  prognosis: '',
  feedback: '',
  previousPrognosisReview: '',
  // Pricing
  servicePriceList: '',
  services: [],
  consultationFee: 0,
  consultationFeeTaxable: true,
  overrideTaxRate: null, // null=使用系统默认, 0=0%, 0.13=13%
  discountType: 'none',
  discountValue: 0,
  taxable: false,
  includeRxAmount: false,
  add3rdParty: false,
  currency: 'CAD',
  comments: '',
  totalAmount: 0, taxAmount: 0, totalWithoutTax: 0,
  documents: [],
  appointmentId: null,
  historyAndMedication: '',
  historyAndMedicationSnapshot: '',
  historyAndMedicationSourceConsultId: null,
  historyAndMedicationSourceConsultDate: '',
  version: 1, modifications: [], lockedAt: null, createdAt: '',
  rateForLast: 0,
  branchId: null,
})

const form = ref(defaultForm())
const consultation = ref(null)
const activeTab = ref('summary')
const saving = ref(false)
const showCompare = ref(false)
const lastSavedSnapshot = ref('')
const unsavedTrackingReady = ref(false)
const rxEditorSnapshot = ref('')
const bypassUnsavedPrompt = ref(false)

function cloneJson(value, fallback = null) {
  if (value === undefined) return fallback
  return JSON.parse(JSON.stringify(value))
}

function buildFormFromConsultation(record = {}) {
  const nextForm = {
    ...defaultForm(),
    ...record,
    diff: normalizeDiff(record.diff || {}),
    acupuncture: [...(record.acupuncture || [])],
    prescriptions: (record.prescriptions || []).map((rx) => ({
      ...rx,
      items: (rx.items || []).map((item) => ({ ...item })),
    })),
    herbals: (record.herbals || []).map((item) => ({ ...item })),
    services: [...(record.services || [])],
    documents: [...(record.documents || [])],
    modifications: [...(record.modifications || [])],
  }
  nextForm.servicePriceList = normalizeServicePriceListSelection(nextForm.servicePriceList)
  if (nextForm.diff?.tongueImage && !nextForm.diff?.tongueImageResource) {
    nextForm.diff.tongueImageResource = nextForm.diff.tongueImage
  }
  return nextForm
}

function applySavedConsultation(record) {
  consultation.value = record
  form.value = buildFormFromConsultation(record)
}

function buildPersistPayload(source = form.value) {
  const nextDiff = cloneJson(source.diff || {}, {})
  if (nextDiff.tongueImageResource) {
    nextDiff.tongueImage = nextDiff.tongueImageResource
  }
  return cloneJson({
    ...source,
    diff: nextDiff,
    summary: source.chiefComplaintDescription || source.summary,
    totalWithoutTax: totalWithoutTax.value,
    taxAmount: taxAmount.value,
    totalAmount: totalAmount.value,
    branchId: source.branchId || branchesStore.currentBranchId || null,
  }, {})
}

function buildFormSnapshot() {
  return JSON.stringify(buildPersistPayload())
}

function buildRxDraftSnapshot() {
  return JSON.stringify(cloneJson({
    ...rxForm.value,
    items: (rxForm.value.items || []).map((item) => ({ ...item })),
  }, {}))
}

function syncSavedSnapshot() {
  lastSavedSnapshot.value = buildFormSnapshot()
  unsavedTrackingReady.value = true
}

const hasUnsavedConsultationChanges = computed(() =>
  unsavedTrackingReady.value && buildFormSnapshot() !== lastSavedSnapshot.value,
)

const hasUnsavedRxDialogChanges = computed(() =>
  showRxDialog.value && buildRxDraftSnapshot() !== rxEditorSnapshot.value,
)

const hasPendingUnsavedChanges = computed(() =>
  hasUnsavedConsultationChanges.value || hasUnsavedRxDialogChanges.value,
)

function syncRxBaseline() {
  rxEditorSnapshot.value = buildRxDraftSnapshot()
}

function resetRxEditorState() {
  rxEditorSnapshot.value = ''
  editingRxIdx.value = -1
  formulaSearch.value = ''
}

async function navigateWithoutUnsavedPrompt(navigate) {
  bypassUnsavedPrompt.value = true
  try {
    return await navigate()
  } finally {
    bypassUnsavedPrompt.value = false
  }
}

function localizeMixedLabel(text = '') {
  return localizeMixedText(text, locale.value)
}

function normalizePrescriptionPreference(value) {
  const preference = String(value || '').trim()
  return ['powder', 'raw_herbs', 'pills'].includes(preference) ? preference : 'raw_herbs'
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function resolveSelectedPriceLists(selection = form.value.servicePriceList) {
  const selected = String(selection || '').trim()
  if (!selected) return settingsStore.activePriceLists
  const byId = settingsStore.activePriceLists.filter((pl) => String(pl.id) === selected)
  if (byId.length > 0) return byId
  return settingsStore.activePriceLists.filter((pl) => String(pl.name || '').trim() === selected)
}

function normalizeServicePriceListSelection(selection) {
  const selected = String(selection || '').trim()
  if (!selected) return ''
  const byId = settingsStore.activePriceLists.filter((pl) => String(pl.id) === selected)
  if (byId.length === 1) return byId[0].id
  const byName = settingsStore.activePriceLists.filter((pl) => String(pl.name || '').trim() === selected)
  if (byName.length === 1) return byName[0].id
  return selected
}

function formatPerDoseSummary(row, quantity) {
  if (row.packetsPerDose != null && row.convertedQty != null && row.convertedUnit) {
    if (locale.value === 'zh-CN') {
      return `共 ${row.convertedQty}${row.convertedUnit} / ${quantity} 剂`
    }
    return `Total ${row.convertedQty}${row.convertedUnit} / ${quantity} doses`
  }
  const unit = row.unit || 'g'
  if (locale.value === 'zh-CN') {
    return `单剂 ${row.dosage}${unit} ×${quantity}`
  }
  return `Per dose ${row.dosage}${unit} ×${quantity}`
}

// ============ History and Medication ============
const historyMedExpanded = ref(true)
const editingHistoryMed = ref(false)
const editHistoryMedText = ref('')

// Build a strict first-consultation-driven history snapshot
const sortedPatientConsultations = computed(() => {
  const allConsults = consultStore.getPatientConsultations(patientId)
  if (!allConsults || allConsults.length === 0) return []
  return [...allConsults].sort((a, b) => {
    const dateDiff = new Date(a.date) - new Date(b.date)
    if (dateDiff !== 0) return dateDiff
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
  })
})

const firstConsultation = computed(() => sortedPatientConsultations.value[0] || null)
const currentConsultationId = computed(() => consultation.value?.id || consultId || form.value.id || null)

const firstConsultDate = computed(() => firstConsultation.value?.date || '')

const isCurrentFirstConsultation = computed(() => {
  if (!firstConsultation.value) return true
  return firstConsultation.value.id === currentConsultationId.value
})

function getConsultationHistoryText(consultationRecord) {
  return consultationRecord?.historyAndMedicationSnapshot
    || consultationRecord?.historyAndMedication
    || ''
}

const historyMedSourceText = computed(() => {
  if (firstConsultation.value) {
    const firstConsultText = getConsultationHistoryText(firstConsultation.value)
    if (firstConsultText) return firstConsultText
  }
  return form.value.historyAndMedicationSnapshot
    || form.value.historyAndMedication
    || patient.value?.historyAndMedication
    || ''
})

const historyMedSourceConsultDate = computed(() => {
  return firstConsultation.value?.date
    || form.value.historyAndMedicationSourceConsultDate
    || form.value.date
    || ''
})

const historyMedSourceLabel = computed(() => {
  if (!firstConsultation.value) return 'Not linked to first consultation'
  if (!historyMedSourceConsultDate.value) return 'Source: first consultation'
  return `Source: first consultation (${historyMedSourceConsultDate.value})`
})

const historyMedSourceLabelText = computed(() => {
  if (!firstConsultation.value) return 'Not linked to first consultation'
  return 'Source: first consultation:'
})

function applyHistorySnapshotToForm(snapshotText = historyMedSourceText.value) {
  const sourceConsultation = firstConsultation.value
  form.value.historyAndMedication = snapshotText || ''
  form.value.historyAndMedicationSnapshot = snapshotText || ''
  form.value.historyAndMedicationSourceConsultId = sourceConsultation?.id || currentConsultationId.value || null
  form.value.historyAndMedicationSourceConsultDate = sourceConsultation?.date || form.value.date || ''
}

function startEditHistoryMed() {
  editHistoryMedText.value = historyMedSourceText.value
  editingHistoryMed.value = true
}

async function saveHistoryMed() {
  if (patient.value) {
    await patientsStore.updatePatient(patientId, {
      historyAndMedication: editHistoryMedText.value,
      historySourceConsultId: patient.value?.historySourceConsultId || consultId || form.value.id || null,
      historySourceConsultDate: patient.value?.historySourceConsultDate || firstConsultDate.value || form.value.date || '',
    })
    ElMessage.success(t('consultation.historyMedicationUpdated'))
  }
  editingHistoryMed.value = false
}

function onCopySection(data) {
  const { diff, prescriptions, ...rest } = data || {}
  if (diff) {
    form.value.diff = { ...form.value.diff, ...diff }
  }
  Object.assign(form.value, rest)
  if (Array.isArray(prescriptions)) {
    applyCopiedPrescriptions(prescriptions)
  }
  form.value.servicePriceList = normalizeServicePriceListSelection(form.value.servicePriceList)
  ElMessage.success(t('consultation.copiedToRecord'))
}

function onUpdateField(data) {
  if (data.diff) {
    form.value.diff = { ...form.value.diff, ...data.diff }
  } else {
    Object.assign(form.value, data)
  }
  if (Object.prototype.hasOwnProperty.call(data || {}, 'servicePriceList')) {
    form.value.servicePriceList = normalizeServicePriceListSelection(form.value.servicePriceList)
  }
}

function buildIntakeNarrative(intake) {
  const lines = []
  const fields = [
    ['Allergies', intake.allergies],
    ['Current medications', intake.currentMedications],
    ['Past medical history', intake.pastMedicalHistory || intake.medicalHistory],
    ['Family history', intake.familyHistory],
    ['Lifestyle', intake.lifestyle],
    ['Additional notes', intake.additionalNotes],
  ]
  for (const [label, value] of fields) {
    const text = Array.isArray(value) ? value.join(', ') : String(value || '').trim()
    if (text) lines.push(`${label}: ${text}`)
  }
  return lines.join('\n')
}

function applyIntakePrefill(intake, appointmentId = null) {
  if (!intake || typeof intake !== 'object') return

  if (intake.chiefComplaint) form.value.chiefComplaint = intake.chiefComplaint
  if (intake.chiefComplaintDuration) form.value.chiefComplaintDuration = intake.chiefComplaintDuration
  if (intake.chiefComplaintDescription) form.value.chiefComplaintDescription = intake.chiefComplaintDescription
  if (intake.progressOfDisease) form.value.progressOfDisease = intake.progressOfDisease
  if (intake.diff) {
    form.value.diff = normalizeDiff({ ...form.value.diff, ...intake.diff })
  }

  const narrative = buildIntakeNarrative(intake)
  if (narrative) {
    if (form.value.progressOfDisease && !form.value.progressOfDisease.includes(narrative)) {
      form.value.progressOfDisease = `${form.value.progressOfDisease}\n${narrative}`.trim()
    } else if (!form.value.progressOfDisease) {
      form.value.progressOfDisease = narrative
    }
  }

  if (appointmentId) {
    form.value.appointmentId = appointmentId
  }
}

async function refreshTongueImagePreview() {
  const resource = form.value.diff?.tongueImageResource || form.value.diff?.tongueImage
  if (!resource) return
  try {
    form.value.diff.tongueImage = await filesApi.resolveUrl(resource)
  } catch (error) {
    console.warn('Failed to refresh tongue image preview:', error)
  }
}

async function saveHistoryMedStrict() {
  const nextText = editHistoryMedText.value || ''
  if (!firstConsultation.value) {
    applyHistorySnapshotToForm(nextText)
    if (patient.value) {
      await patientsStore.updatePatient(patientId, {
        historyAndMedication: nextText,
      })
    }
    ElMessage.success(t('consultation.historyMedicationUpdated'))
    editingHistoryMed.value = false
    return
  }

  const targetConsultation = firstConsultation.value
  const updatedSource = await consultStore.updateConsultation(targetConsultation.id, {
    ...targetConsultation,
    historyAndMedication: nextText,
    historyAndMedicationSnapshot: nextText,
    historyAndMedicationSourceConsultId: targetConsultation.id,
    historyAndMedicationSourceConsultDate: targetConsultation.date || '',
  })

  const sourceSnapshot = updatedSource?.historyAndMedicationSnapshot || nextText
  const sourceConsultId = updatedSource?.id || targetConsultation.id
  const sourceConsultDate = updatedSource?.date || targetConsultation.date || ''

  consultStore.syncPatientHistorySnapshot(patientId, sourceSnapshot, sourceConsultId, sourceConsultDate)
  applyHistorySnapshotToForm(sourceSnapshot)

  if (patient.value) {
    await patientsStore.updatePatient(patientId, {
      historyAndMedication: sourceSnapshot,
      historySourceConsultId: sourceConsultId,
      historySourceConsultDate: sourceConsultDate,
    })
  }

  ElMessage.success(t('consultation.historyMedicationSynchronized'))
  editingHistoryMed.value = false
}

onMounted(() => {
  if (!isNew && consultId) {
    const existing = consultStore.getConsultation(consultId)
    if (existing) {
      applySavedConsultation(existing)
    }
  } else if (isNew) {
    const copyRaw = sessionStorage.getItem('tcm_copy_consult')
    if (copyRaw) {
      try {
        const copyData = JSON.parse(copyRaw)
        Object.assign(form.value, copyData)
        if (copyData.diff) form.value.diff = normalizeDiff(copyData.diff)
        if (copyData.acupuncture) form.value.acupuncture = [...copyData.acupuncture]
        if (copyData.prescriptions) {
          applyCopiedPrescriptions(copyData.prescriptions)
        }
        if (copyData.services) form.value.services = [...copyData.services]
        form.value.servicePriceList = normalizeServicePriceListSelection(form.value.servicePriceList)
        ElMessage.info(t('consultation.autofilled'))
      } catch (error) {
        console.warn('Failed to parse copied consultation data:', error)
      }
      sessionStorage.removeItem('tcm_copy_consult')
    }

    const patientAppts = appointmentsStore.getPatientAppointments(patientId)
    const latestAppt = patientAppts.find((appointment) => {
      const intake = appointment.intakeFormData
      if (!intake || typeof intake !== 'object') return false
      return Object.values(intake).some((value) => {
        if (Array.isArray(value)) return value.length > 0
        if (value && typeof value === 'object') return Object.keys(value).length > 0
        return String(value || '').trim() !== ''
      })
    })
    const appointmentIdForPrefill = latestAppt?.id && latestAppt.status !== 'completed' && latestAppt.status !== 'cancelled'
      ? latestAppt.id
      : null

    if (patient.value?.latestIntakeFormData) {
      applyIntakePrefill(patient.value.latestIntakeFormData, appointmentIdForPrefill)
    } else if (latestAppt?.intakeFormData) {
      applyIntakePrefill(latestAppt.intakeFormData, appointmentIdForPrefill)
    }
  }

  refreshTongueImagePreview()
  applyHistorySnapshotToForm()
  syncSavedSnapshot()
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
const showRxDialog = ref(false)
const editingRxIdx = ref(-1)
const formulaSearch = ref('')
const formulaSuggestions = computed(() => {
  if (!formulaSearch.value || formulaSearch.value.trim() === '') return []
  const q = formulaSearch.value.trim().toLowerCase()
  return (formulasStore.formulas || []).filter(f => f.name && f.name.toLowerCase().includes(q))
})
const rxForm = ref({
  formulaName: '',
  prescriptionType: normalizePrescriptionPreference(authStore.currentUser?.prescriptionPreference),
  quantity: 7,
  direction: TCM_OPTIONS.direction[0] || 'Take 1 bag twice a day',
  whereToGet: TCM_OPTIONS.whereToGet[0] || 'Clinic',
  preferredUnit: 'g',
  items: [],
  comments: '',
})

function openNewRx() {
  editingRxIdx.value = -1
  const defaultPreference = normalizePrescriptionPreference(authStore.currentUser?.prescriptionPreference)
  rxForm.value = {
    formulaName: '',
    prescriptionType: defaultPreference,
    quantity: 7,
    direction: TCM_OPTIONS.direction[0] || 'Take 1 bag twice a day',
    whereToGet: TCM_OPTIONS.whereToGet[0] || 'Clinic',
    preferredUnit: defaultPreference === 'powder' ? 'bag' : 'g',
    items: [],
    comments: '',
  }
  syncRxBaseline()
  showRxDialog.value = true
}

function openEditRx(idx) {
  editingRxIdx.value = idx
  const oldRx = form.value.prescriptions[idx]
  rxForm.value = {
    ...oldRx,
    items: (oldRx.items || []).map(i => ({ ...i }))
  }
  syncRxBaseline()
  showRxDialog.value = true
}

function getPrescriptionTypeLabel(type) {
  const labels = {
    powder: 'Powder',
    raw_herbs: 'Raw herbs',
    pills: 'Pills',
  }
  return labels[type] || type || '-'
}

function formatSupplierDisplay(supplierName, gramsPerPacket) {
  const supplier = String(supplierName || '').trim()
  if (!supplier) return '-'

  const grams = Number(gramsPerPacket)
  if (Number.isFinite(grams) && grams > 0) {
    return `${supplier}(${grams}g)`
  }
  return supplier
}

function formatSupplierOption(candidate) {
  return formatSupplierDisplay(candidate?.supplier || 'Supplier', candidate?.gramsPerPacket)
}

function hasDispensingCompleted(source = form.value) {
  if (!source) return false
  if (source.dispensingCompleted) return true
  return Array.isArray(source.prescriptions)
    && source.prescriptions.some((prescription) => prescription?.dispensingCompleted)
}

function resetDispensingState(target = form.value) {
  if (!target) return
  target.dispensingCompleted = false
  target.dispensingCompletedAt = null
  target.dispensedBy = null
  target.inventoryDeductedAt = null
  target.inventoryDeductedBy = null

  if (Object.prototype.hasOwnProperty.call(target, 'inventoryDeductedAtPayment')) {
    target.inventoryDeductedAtPayment = false
  }
  if (Object.prototype.hasOwnProperty.call(target, 'inventoryDeductedAtSave')) {
    target.inventoryDeductedAtSave = false
  }
  if (Array.isArray(target.prescriptions)) {
    target.prescriptions.forEach((prescription) => {
      prescription.dispensingCompleted = false
    })
  }
}

function isPrescriptionDispensed(row) {
  return hasDispensingCompleted(form.value) || Boolean(row?.dispensingCompleted)
}

function syncFormFromPrimaryPrescription() {
  const first = form.value.prescriptions[0]
  if (first) {
    form.value.herbals = (first.items || []).map(i => ({
      name: i.name,
      dosage: i.dosage,
      unit: i.unit,
      herbDictId: i.herbDictId || null,
      inventoryId: i.inventoryId || null,
      convertedQty: i.convertedQty ?? null,
      convertedUnit: i.convertedUnit || '',
      packetsPerDose: i.packetsPerDose ?? null,
      supplierId: i.supplierId || null,
      supplierName: i.supplierName || '',
    }))
    form.value.formulaName = first.formulaName
    form.value.prescriptionType = first.prescriptionType || 'raw_herbs'
    return
  }
  form.value.herbals = []
  form.value.formulaName = ''
  form.value.prescriptionType = 'none'
}

function applyCopiedPrescriptions(sourcePrescriptions = []) {
  form.value.prescriptions = rehydrateCopiedPrescriptions(sourcePrescriptions, inventoryStore.items)
  syncFormFromPrimaryPrescription()
  resetDispensingState(form.value)
}

const rxDrawerSize = computed(() => (isMobile.value ? '100%' : '640px'))
const sideDrawerSize = computed(() => (isMobile.value ? '100%' : '520px'))

async function persistConsultationDraft({ silent = false, syncRoute = true } = {}) {
  saving.value = true
  try {
    applyHistorySnapshotToForm()
    if (form.value.status === 'paid' && form.value.prescriptionType !== 'none' && form.value.prescriptions.length > 0) {
      resetDispensingState(form.value)
    }
    const data = buildPersistPayload()
    const targetId = currentConsultationId.value

    if (!targetId) {
      const created = await consultStore.createConsultation(data)
      applySavedConsultation(created)
      refreshTongueImagePreview()
      syncSavedSnapshot()
      if (syncRoute) {
        await navigateWithoutUnsavedPrompt(() => router.replace(`/patients/${patientId}/consultations/${created.id}`))
      }
      if (!silent) {
        ElMessage.success(t('consultation.draftSaved'))
      }
      return created
    }

    const updated = await consultStore.updateConsultation(targetId, data)
    if (!updated) {
      throw new Error(t('common.operationFailed'))
    }
    applySavedConsultation(updated)
    refreshTongueImagePreview()
    syncSavedSnapshot()
    if (!silent) {
      ElMessage.success(t('consultation.saved'))
    }
    return updated
  } catch (e) {
    if (!silent) {
      ElMessage.error(e.message || t('common.operationFailed'))
    }
    throw e
  } finally {
    saving.value = false
  }
}

async function saveRx() {
  const isEditing = editingRxIdx.value >= 0
  const oldRx = isEditing ? form.value.prescriptions[editingRxIdx.value] : null

  const rx = {
    ...rxForm.value,
    id: isEditing ? (oldRx?.id || 'rx-' + Date.now()) : 'rx-' + Date.now(),
    subtotal: rxSubtotal.value,
    perDoseSubtotal: rxPerDoseSubtotal.value,
    dispensingCompleted: false,
  }

  if (isEditing) {
    form.value.prescriptions.splice(editingRxIdx.value, 1, rx)
  } else {
    form.value.prescriptions.push(rx)
  }
  if (form.value.status === 'paid' || hasDispensingCompleted(form.value) || oldRx?.dispensingCompleted) {
    resetDispensingState(form.value)
  }
  syncFormFromPrimaryPrescription()

  if (rx.prescriptionType && rx.prescriptionType !== 'none') {
    const insufficientItems = rx.items.filter(i => i.stockSufficient === false)
    if (insufficientItems.length > 0) {
      const names = insufficientItems.map(i => i.name).join(', ')
      ElMessage.warning(t('consultation.stockInsufficient', { names }))
    }
  }

  try {
    await persistConsultationDraft({ silent: true })
    showRxDialog.value = false
  } catch (e) {
    ElMessage.error(e.message || t('common.operationFailed'))
  }
}

async function deleteRx(idx) {
  form.value.prescriptions.splice(idx, 1)
  if (form.value.status === 'paid' || hasDispensingCompleted(form.value)) {
    resetDispensingState(form.value)
  }
  syncFormFromPrimaryPrescription()
}

function handlePrintRx(idx) {
  const practitioner = authStore.users.find(u => u.id === form.value.practitionerId)
  const clinicName = settingsStore.clinicName || 'Clinic'
  printPrescription(form.value, patient.value, practitioner, clinicName, idx)
}

function addRxItem() {
  rxForm.value.items.push({ name: '', dosage: 0, unit: 'g', category: '', guijing: '', nature: '', taste: '', pricePerUnit: 0, subtotal: 0 })
}

function removeRxItem(idx) {
  rxForm.value.items.splice(idx, 1)
}

const rxSubtotal = computed(() =>
  roundMoney(
    rxForm.value.items.reduce((sum, item) => {
      if (item?.subtotal != null) return sum + Number(item.subtotal || 0)
      const quantity = item?.convertedQty != null
        ? Number(item.convertedQty || 0)
        : Number(item?.dosage || 0) * Number(rxForm.value.quantity || 1)
      return sum + quantity * Number(item?.pricePerUnit || 0)
    }, 0),
  )
)

const rxPerDoseSubtotal = computed(() => {
  const quantity = Number(rxForm.value.quantity || 1)
  if (quantity <= 0) return rxSubtotal.value
  return roundMoney(rxSubtotal.value / quantity)
})

// Apply a formula to the prescription dialog
function applyFormulaToDialog(formula) {
  rxForm.value.formulaName = formula.name

  const prescType = rxForm.value.prescriptionType || 'raw_herbs'
  const qty = rxForm.value.quantity || 7

  if (prescType === 'none') {
    // Service-only prescriptions do not perform powder/raw-herb conversion
    rxForm.value.items = (formula.items || []).map(h => ({
      name: h.herbName, herbDictId: h.herbDictId || null, dosage: h.dosage, unit: h.unit || 'g',
      convertedQty: null, convertedUnit: '', supplierName: '', supplierId: null,
      category: '', guijing: '', nature: '', taste: '', pricePerUnit: 0, subtotal: 0,
    }))
  } else {
    const result = calculatePrescription(
      formula.items || [],
      qty,
      prescType,
      inventoryStore.items,
      null,
    )
    rxForm.value.items = result.items.map(r => ({
      name: r.name,
      herbDictId: r.herbDictId || null,
      dosage: r.originalDosage,
      unit: r.originalUnit,
      convertedQty: r.convertedQty,
      convertedUnit: r.convertedUnit,
      packetsPerDose: r.packetsPerDose,
      gramsPerPacket: r.gramsPerPacket,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      inventoryId: r.inventoryId,
      inventoryStock: r.inventoryStock,
      stockSufficient: r.stockSufficient,
      outOfStock: r.outOfStock,  // Bug 8
      allCandidates: r.allCandidates,
      category: '', guijing: '', nature: '', taste: '',
      pricePerUnit: r.pricePerUnit,
      subtotal: r.subtotal,
    }))
  }
  formulaSearch.value = ''
  ElMessage.success(t('consultation.formulaImported', { name: formula.name }))
}

// Recalculate prescription dialog items
function recalcRxItems() {
  const prescType = rxForm.value.prescriptionType || 'raw_herbs'
  const qty = rxForm.value.quantity || 7
  if (prescType === 'none' || rxForm.value.items.length === 0) return

  const formulaItems = rxForm.value.items.map(i => ({
    herbName: i.name,
    herbDictId: i.herbDictId,
    dosage: i.dosage,
    unit: i.unit || 'g',
  }))
  const result = calculatePrescription(
    formulaItems, qty, prescType, inventoryStore.items, null,
  )
  result.items.forEach((r, idx) => {
    if (rxForm.value.items[idx]) {
      const item = rxForm.value.items[idx]
      item.convertedQty = r.convertedQty
      item.convertedUnit = r.convertedUnit
      item.packetsPerDose = r.packetsPerDose
      item.gramsPerPacket = r.gramsPerPacket
      item.supplierId = r.supplierId
      item.supplierName = r.supplierName
      item.inventoryId = r.inventoryId
      item.inventoryStock = r.inventoryStock
      item.stockSufficient = r.stockSufficient
      item.outOfStock = r.outOfStock
      item.allCandidates = r.allCandidates
      item.pricePerUnit = r.pricePerUnit
      item.subtotal = r.subtotal
    }
  })
}

// Replace an item with a specific inventory candidate
  function switchSupplier(itemIdx, newInventoryItem) {
    const item = rxForm.value.items[itemIdx]
  if (!item || !newInventoryItem) return
  const updated = recalcWithSupplier(
    item,
    rxForm.value.quantity || 7,
    rxForm.value.prescriptionType || 'raw_herbs',
    newInventoryItem,
  )
  Object.assign(item, updated)
}

// ============ Search Helpers ============
function queryHerbs(queryString, cb) {
  const matches = herbDictStore.findByName(queryString)
  cb(matches.map(h => ({ value: h.name, id: h.id })))
}
function handleHerbSelect(item, row) {
  row.name = item.value
  row.herbDictId = item.id
  recalcRxItems()
}

// ============ Acupuncture ============
function addAcu() { form.value.acupuncture.push({ point: '', side: 'bilateral', notes: '' }) }
function removeAcu(i) { form.value.acupuncture.splice(i, 1) }

// ============ Services ============
function addService() { form.value.services.push({ name: '', price: 0, quantity: 1, manualDiscount: 0, taxable: true }) }
function removeService(i) { form.value.services.splice(i, 1) }

// Aggregate items from the selected price list, or all active price lists when none is selected.
const priceListServiceOptions = computed(() => {
  const lists = resolveSelectedPriceLists()
  const multipleLists = lists.length > 1
  const options = []
  for (const pl of lists) {
    for (const [index, item] of (pl.items || []).entries()) {
      const name = String(item?.name || '').trim()
      if (!name) continue
      const optionKey = `${pl.id || pl.name || 'price-list'}::${index}::${name}`
      options.push({
        key: optionKey,
        value: optionKey,
        name,
        price: Number(item?.price || 0),
        taxable: item?.taxable !== false,
        priceListName: pl.name || '',
        showSource: multipleLists,
      })
    }
  }
  return options
})

function onServiceSelect(row, selectedValue) {
  const match = priceListServiceOptions.value.find(o => o.value === selectedValue)
  if (match) {
    row.name = match.name
    row.price = match.price
    row.taxable = match.taxable
  }
}

// ============ Totals ============
const effectiveTaxRate = computed(() => {
  if (form.value.overrideTaxRate !== null && form.value.overrideTaxRate !== undefined) {
    return form.value.overrideTaxRate
  }
  return settingsStore.taxRate
})
function getServiceExtended(sv) {
  return (sv.price || 0) * (sv.quantity || 1) - (sv.manualDiscount || 0)
}
function getServiceTax(sv) {
  return sv.taxable ? getServiceExtended(sv) * effectiveTaxRate.value : 0
}
const totalService = computed(() =>
  form.value.services.reduce((s, sv) => s + getServiceExtended(sv), 0),
)
const totalServiceTax = computed(() =>
  form.value.services.reduce((s, sv) => s + getServiceTax(sv), 0),
)
// 处方总额：单剂价格 × 数量
const totalRxAmount = computed(() =>
  form.value.prescriptions.reduce((sum, rx) => sum + Number(rx?.subtotal || 0), 0)
)
const totalWithoutTax = computed(() => {
  let base = (form.value.consultationFee || 0) + totalService.value
  // Optionally include prescription subtotals in the consultation total
  if (form.value.includeRxAmount) {
    base += totalRxAmount.value
  }
  if (form.value.discountType === 'percentage') base *= (1 - (form.value.discountValue || 0) / 100)
  else if (form.value.discountType === 'amount') base -= (form.value.discountValue || 0)
  return Math.max(0, base)
})
const discountFactor = computed(() => {
  const rawBase = (form.value.consultationFee || 0) + totalService.value
    + (form.value.includeRxAmount ? totalRxAmount.value : 0)
  if (rawBase <= 0) return 1
  if (form.value.discountType === 'percentage') return Math.max(0, 1 - (form.value.discountValue || 0) / 100)
  if (form.value.discountType === 'amount') return Math.max(0, (rawBase - (form.value.discountValue || 0)) / rawBase)
  return 1
})
const consultationFeeTax = computed(() => form.value.consultationFeeTaxable !== false ? (form.value.consultationFee || 0) * effectiveTaxRate.value : 0)
const taxAmount = computed(() => (totalServiceTax.value + consultationFeeTax.value) * discountFactor.value)
const totalAmount = computed(() => totalWithoutTax.value + taxAmount.value)

// ============ Save / Finalize ============
async function saveDraft() {
  await persistConsultationDraft()
}

async function completeConsultation() {
  if (!form.value.chiefComplaint) return ElMessage.warning(t('consultation.fillChiefComplaint'))
  try {
    const saved = await persistConsultationDraft({ silent: true })
    const id = saved?.id || currentConsultationId.value
    if (id) {
      await consultStore.completeConsultation(id)
      if (form.value.appointmentId) {
        try {
          await appointmentsStore.completeAppointment(form.value.appointmentId)
        } catch (e) {
          console.warn('Failed to complete linked appointment:', e)
        }
      }
      ElMessage.success(t('consultation.completed'))
      consultationsApi.generateReport(id).catch(() => {})
      await navigateWithoutUnsavedPrompt(() => router.push(`/patients/${patientId}`))
    }
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function markPaid() {
  try {
    await ElMessageBox.confirm(t('consultation.confirmPayLock'), t('consultation.confirmPayTitle'), { type: 'warning' })
    const saved = await persistConsultationDraft({ silent: true })
    const id = saved?.id || currentConsultationId.value
    if (id) {
      const updated = await consultStore.markAsPaid(id, { paymentMethod: 'manual' })
      if (updated) {
        applySavedConsultation(updated)
        syncSavedSnapshot()
      }
      await inventoryStore.refreshFromApi()
      ElMessage.success(t('consultation.paidAndLocked'))
      await navigateWithoutUnsavedPrompt(() => router.push(`/patients/${patientId}`))
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message)
  }
}

async function deleteConsultation() {
  try {
    await ElMessageBox.confirm(t('consultation.confirmDelete'), t('consultation.confirmDeleteTitle'), { type: 'warning' })
    const id = consultId || consultation.value?.id
    if (id) {
      const ok = await consultStore.deleteConsultation(id)
      if (ok) { ElMessage.success(t('consultation.deleted')); await navigateWithoutUnsavedPrompt(() => router.push(`/patients/${patientId}`)) }
      else ElMessage.error(t('consultation.cannotDeletePaid'))
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message)
  }
}

function getUnsavedLeaveMessageKey() {
  if (hasUnsavedRxDialogChanges.value && !hasUnsavedConsultationChanges.value) {
    return 'consultation.unsavedPrescriptionLeaveMessage'
  }
  return 'consultation.unsavedLeaveMessage'
}

async function confirmUnsavedChanges(messageKey = getUnsavedLeaveMessageKey()) {
  try {
    await ElMessageBox.confirm(
      t(messageKey),
      t('consultation.unsavedLeaveTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
      },
    )
    return true
  } catch (e) {
    return false
  }
}

async function requestCloseRxDialog() {
  if (hasUnsavedRxDialogChanges.value) {
    const confirmed = await confirmUnsavedChanges('consultation.unsavedPrescriptionLeaveMessage')
    if (!confirmed) return
  }
  showRxDialog.value = false
}

async function handleRxDrawerBeforeClose(done) {
  if (hasUnsavedRxDialogChanges.value) {
    const confirmed = await confirmUnsavedChanges('consultation.unsavedPrescriptionLeaveMessage')
    if (!confirmed) return
  }
  done()
}

function handleRxDialogClosed() {
  resetRxEditorState()
}

function handleBeforeUnload(event) {
  if (bypassUnsavedPrompt.value || !hasPendingUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(async () => {
  if (bypassUnsavedPrompt.value || !hasPendingUnsavedChanges.value) return true
  return confirmUnsavedChanges()
})


async function handleExportPdf() {
  await handleGeneratePdf()
}
const CURRENCY_SYMBOLS = { CAD: '$', USD: '$', CNY: 'CNY' }
const cs = computed(() => CURRENCY_SYMBOLS[form.value.currency] || 'CNY')

const SIDE_OPTIONS = [
  { label: 'Bilateral', value: 'bilateral' },
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
]

// ============ ?============
function handleTongueUpload(file) {
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.warning(t('consultation.imageMaxSize'))
    return false
  }
  const rawFile = file.raw || file
  filesApi.upload(rawFile, {
    patientId,
    consultationId: form.value.id || undefined,
    fileType: 'tongue_image',
  }).then((res) => {
    form.value.diff.tongueImageResource = res.resource || res.filePath || null
    form.value.diff.tongueImage = res.url || res.filePath || res.fileName
    ElMessage.success(t('consultation.tongueImageUploaded'))
  }).catch((e) => {
    ElMessage.error(e.message || t('consultation.uploadFailed'))
  })
  return false
}

function removeTongueImage() {
  form.value.diff.tongueImage = null
  form.value.diff.tongueImageResource = null
}

// ============ ?============
function handleDocUpload(file) {
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning(t('consultation.fileMaxSize'))
    return false
  }
  const rawFile = file.raw || file
  filesApi.upload(rawFile, {
    patientId,
    consultationId: form.value.id || undefined,
    fileType: 'document',
  }).then((res) => {
    form.value.documents.push({
      id: res.fileId || 'doc-' + Date.now(),
      name: res.originalName || rawFile.name,
      type: rawFile.type || 'application/octet-stream',
      size: rawFile.size,
      resource: res.resource || res.filePath || null,
      url: res.url || res.filePath || res.fileName,
      uploadedAt: new Date().toISOString(),
    })
    ElMessage.success(t('consultation.fileUploaded'))
  }).catch((e) => {
    ElMessage.error(e.message || t('consultation.uploadFailed'))
  })
  return false
}

function removeDocument(idx) {
  form.value.documents.splice(idx, 1)
}

async function previewDocument(doc) {
  const src = doc.resource || doc.url || doc.data
  if (src) {
    try {
      await filesApi.open(src)
    } catch (e) {
      ElMessage.error(e.message || t('consultation.uploadFailed'))
    }
  }
}

function checkStorageCapacity() {
  try {
    const used = new Blob(Object.values(localStorage)).size
    const limit = 5 * 1024 * 1024
    if (used > limit * 0.8) {
      ElMessage.warning(t('consultation.storageWarning', { size: (used / 1024 / 1024).toFixed(1) }))
    }
  } catch (e) { /* ignore */ }
}

// ============ PDF ?============
async function handleGeneratePdf() {
  const id = consultId || consultation.value?.id
  if (!id) {
    ElMessage.warning(t('consultation.saveBefore'))
    return
  }
  try {
    const res = await consultationsApi.generateReport(id)
    const pdfUrl = res.url || res.pdfUrl
    if (pdfUrl) {
      await filesApi.open(pdfUrl)
    } else {
      const practitioner = authStore.users.find(u => u.id === form.value.practitionerId)
      printConsultationReport(form.value, patient.value, practitioner, settingsStore.clinicName)
    }
  } catch (e) {
    ElMessage.error(t('consultation.pdfFailed') + (e.message || ''))
    // fallback to client-side print
    const practitioner = authStore.users.find(u => u.id === form.value.practitionerId)
    printConsultationReport(form.value, patient.value, practitioner, settingsStore.clinicName)
  }
}

// ============ ?============
function handleSendReport() {
  const emailContent = buildConsultationReportEmail(patient.value, form.value, settingsStore.clinicName)
  openEmailPreview(emailContent)
}
</script>

<template>
  <div v-if="patient" class="cv-wrap">
    <!-- Header -->
    <div class="cv-header">
      <div class="cv-header-left">
        <el-button text :icon="'ArrowLeft'" @click="$router.push(`/patients/${patientId}`)">{{ t('common.back') }}</el-button>
        <div class="cv-title">
          <el-avatar :size="28" style="background:#2d6a4f; font-size:12px; flex-shrink:0">{{ patient?.name?.charAt(0) || 'P' }}</el-avatar>
          <span class="cv-patient">{{ patient.name }}</span>
          <span class="cv-sep">_</span>
          <span class="cv-complaint">{{ form.chiefComplaint || (isNew ? t('consultation.newRecord') : t('consultation.record')) }}</span>
          <el-tag v-if="form.consultationId" size="small" type="info" style="margin-left:6px">{{ form.consultationId }}</el-tag>
          <el-tag :type="{draft:'info',completed:'warning',paid:'success'}[form.status]" size="small" style="margin-left:4px">{{ t('consultation.status_' + form.status) }}</el-tag>
          <el-tag v-if="form.lockedAt" size="small" type="danger" style="margin-left:4px">{{ t('consultation.locked') }}</el-tag>
          <el-tag v-if="form.version > 1" size="small" type="warning" style="margin-left:4px">v{{ form.version }}</el-tag>
        </div>
      </div>
      <div class="cv-header-right">
        <el-button size="small" @click="showCompare = true">{{ t('consultation.compareHistory') }}</el-button>
        <template v-if="!isReadOnly">
        <el-button size="small" :loading="saving" @click="saveDraft">{{ t('common.save') }}</el-button>
        <el-button v-if="form.status === 'draft' || isNew" size="small" type="success" @click="completeConsultation">{{ t('consultation.complete') }}</el-button>
        <el-button v-if="form.status === 'completed' && canMarkPaid" size="small" type="primary" @click="markPaid">{{ t('consultation.payAndLock') }}</el-button>
        <el-button v-if="!form.lockedAt && canDeleteConsultation" size="small" type="danger" text @click="deleteConsultation">{{ t('common.delete') }}</el-button>
        </template>
      </div>
    </div>

    <!-- Previous consultation reminder -->
    <el-alert
      v-if="isNew && lastConsultation?.prognosis"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom:12px"
    >
      <strong>{{ t('consultation.lastPrognosis', { date: formatDate(lastConsultation.date) }) }}</strong>
      {{ lastConsultation.prognosis }}
    </el-alert>

    <el-tabs v-model="activeTab" class="cv-tabs">

      <!-- Tab 1: Summary -->
      <el-tab-pane :label="t('consultation.tabSummary')" name="summary">
        <el-row :gutter="16">
          <!-- Left column -->
          <el-col :span="14">
            <!-- Medical history and medication -->
            <el-card class="section-card history-med-card" shadow="never"
              style="margin-bottom: 12px; border-left: 3px solid #e9a000;">
              <template #header>
                <div class="history-med-header" @click="historyMedExpanded = !historyMedExpanded" style="cursor: pointer;">
                  <span class="sec-header" style="color: #e9a000; display: flex; align-items: center; gap: 4px;">
                    <el-icon><Warning /></el-icon>
                    Medical History & Medication
                  </span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <el-tag v-if="firstConsultDate" size="small" type="info" effect="plain" style="font-size: 11px;">
                      First consult: {{ firstConsultDate }}
                    </el-tag>
                    <el-icon :style="{ transform: historyMedExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.3s' }">
                      <ArrowDown />
                    </el-icon>
                  </div>
                </div>
              </template>
              <transition name="el-collapse-transition">
                <div v-show="historyMedExpanded" class="history-med-body">
                  <!-- History editor -->
                  <div v-if="editingHistoryMed" style="display: flex; flex-direction: column; gap: 10px;">
                    <el-alert
                      v-if="firstConsultation && !isCurrentFirstConsultation"
                      type="warning"
                      :closable="false"
                      show-icon
                      title="Editing here will update the first consultation history for this patient."
                    />
                    <div style="display: flex; gap: 8px; align-items: center;">
                      <el-select
                        v-model="editHistoryMedText"
                        filterable
                        allow-create
                        :placeholder="t('patientDetail.historyPlaceholder') || 'Enter important history and medication notes'"
                        style="flex: 1"
                        default-first-option
                      >
                        <el-option label="No significant history or medication" value="No significant history or medication" />
                        <el-option label="Current medication reviewed" value="Current medication reviewed" />
                        <el-option label="Allergies and medication reviewed" value="Allergies and medication reviewed" />
                        <el-option label="Refer to first consultation notes" value="Refer to first consultation notes" />
                        <el-option v-if="firstConsultDate" :label="'Use first consultation notes (' + firstConsultDate + ')'" :value="historyMedSourceText" />
                      </el-select>
                    </div>
                    <el-input
                      v-model="editHistoryMedText"
                      type="textarea"
                      :rows="6"
                      placeholder="Enter important history and medication notes"
                      resize="vertical"
                      style="font-size: 13px;"
                    />
                    <div style="display: flex; gap: 8px; justify-content: flex-end;">
                      <el-button size="small" @click="editingHistoryMed = false">{{ t('common.cancel') }}</el-button>
                      <el-button size="small" type="primary" @click="saveHistoryMedStrict">
                        <el-icon style="margin-right: 2px"><Check /></el-icon>{{ t('common.save') }}
                      </el-button>
                    </div>
                  </div>
                  <!-- View Mode -->
                  <div v-else style="line-height: 1.8; font-size: 13px; color: #555;">
                    <div v-if="historyMedSourceText" style="white-space: pre-wrap; margin-bottom: 8px; min-height: 40px; padding: 8px 12px; background: #fffbe6; border-radius: 6px; border: 1px solid #fff1b8;">
                      {{ historyMedSourceText }}
                    </div>
                    <div v-if="historyMedSourceConsultDate" style="font-size: 12px; color: #888; margin-bottom: 8px;">
                      {{ historyMedSourceLabelText }} {{ historyMedSourceConsultDate }}
                    </div>
                    <div v-else style="color: #ccc; font-size: 13px; padding: 12px; text-align: center; border: 1px dashed #e0e0e0; border-radius: 6px;">
                      No history and medication notes yet
                    </div>
                    <div v-if="patient.notes" style="color: #888; border-top: 1px dashed #eee; padding-top: 6px; margin-top: 8px;">
                      <strong>{{ t('common.notes') }}</strong>{{ patient.notes }}
                    </div>
                    <div style="margin-top: 8px; text-align: right;">
                      <el-button v-if="!isReadOnly" size="small" text type="warning" @click="startEditHistoryMed">
                        <el-icon style="margin-right: 2px"><Edit /></el-icon>{{ t('common.edit') }}
                      </el-button>
                    </div>
                  </div>
                </div>
              </transition>
            </el-card>

            <el-card class="section-card">
              <template #header><span class="sec-header">CHIEF COMPLAINT</span></template>
              <el-form label-width="200px" label-position="left" size="small">
                <el-form-item label="Consultation ID">
                  <el-input :value="form.consultationId || t('consultation.generatedAfterSave')" readonly class="readonly-field" />
                </el-form-item>
                <el-form-item label="Date of Consultation *">
                  <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" :disabled="isReadOnly" style="width:200px" />
                </el-form-item>
                <el-form-item label="Chief Complaint *">
                  <el-select
                    v-model="form.chiefComplaint"
                    filterable allow-create clearable
                    :placeholder="t('consultation.selectOrInputComplaint')"
                    style="width:100%"
                    :disabled="isReadOnly"
                    @change="(val) => { if (val && !CHIEF_COMPLAINTS.includes(val) && !settingsStore.customChiefComplaints.includes(val)) settingsStore.addCustomChiefComplaint(val) }"
                  >
                    <el-option v-for="c in [...CHIEF_COMPLAINTS, ...settingsStore.customChiefComplaints]" :key="c" :label="c" :value="c" />
                  </el-select>
                </el-form-item>
                <el-form-item label="Chief Complaint Duration">
                  <el-select v-model="form.chiefComplaintDuration" :placeholder="t('consultation.selectDuration')" style="width:100%" :disabled="isReadOnly">
                    <el-option v-for="d in TCM_OPTIONS.chiefComplaintDuration" :key="d" :label="d" :value="d" />
                  </el-select>
                </el-form-item>
                <el-form-item label="Chief Complaint Description">
                  <el-input v-model="form.chiefComplaintDescription" type="textarea" :rows="4"
                    :placeholder="t('consultation.descPlaceholder')" :readonly="isReadOnly" />
                </el-form-item>
                <el-form-item label="Progress of the Disease">
                  <el-input v-model="form.progressOfDisease" type="textarea" :rows="3"
                    :placeholder="t('consultation.progressPlaceholder')" :readonly="isReadOnly" />
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>

          <!-- Prognosis & Feedback -->
          <el-col :span="10">
            <el-card class="section-card">
              <template #header>
                <span class="sec-header">
                  Feedback for Last Treatment
                  <el-icon style="margin-left:4px; color:#999"><Lock /></el-icon>
                </span>
              </template>
              <el-form label-position="top" size="small">
                <el-form-item label="Prognosis for Last Treatment">
                  <el-input
                    :value="lastConsultation?.prognosis || consultation?.previousPrognosisReview || ''"
                    type="textarea" :rows="4" readonly class="readonly-field"
                    :placeholder="t('consultation.lastPrognosisPlaceholder')"
                  />
                </el-form-item>
                <el-form-item label="Rate for Last Treatment">
                  <el-rate v-model="form.rateForLast" :disabled="isReadOnly" allow-half />
                </el-form-item>
                <el-form-item label="Basic Condition">
                  <el-input v-model="form.previousPrognosisReview" type="textarea" :rows="3"
                    :placeholder="t('consultation.reviewPlaceholder')" :readonly="isReadOnly" />
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- Tab 2: Differentiation -->

      <el-tab-pane :label="t('consultation.tabDifferentiation')" name="differentiation">
        <div class="diff-sections">

          <!-- Section: Exterior & Head 表&头部 -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">{{ localizeMixedLabel('Exterior & Head 表头部') }}</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="200px" label-position="left" size="small">
                  <el-form-item :label="localizeMixedLabel('Cold/Heat 寒热')">
                    <el-select v-model="form.diff.coldHeat" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.coldHeat" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Sweat 汗出')">
                    <el-select v-model="form.diff.sweat" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.sweat" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Head Discomfort 头部不适')">
                    <el-select v-model="form.diff.headDiscomfort" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.headDiscomfort" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Head Position 位置')">
                    <el-select v-model="form.diff.headPosition" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.headPosition" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Eye 眼睛')">
                    <el-select v-model="form.diff.eye" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.eye" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Ears 耳朵')">
                    <el-select v-model="form.diff.ear" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.ear" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Noses 鼻子')">
                    <el-select v-model="form.diff.nose" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.nose" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Mouth 口')">
                    <el-select v-model="form.diff.mouth" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.mouth" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Taste 味道')">
                    <el-select v-model="form.diff.taste" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.taste" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <el-form label-width="220px" label-position="left" size="small">
                  <el-form-item :label="localizeMixedLabel('Body Discomforts 身体不适')">
                    <el-select v-model="form.diff.bodyDiscomforts" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.bodyDiscomforts" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Body Discomforts Location 位置')">
                    <el-select v-model="form.diff.bodyDiscomfortsLocation" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.bodyDiscomfortsLocation" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Skin Issues 皮肤')">
                    <el-select v-model="form.diff.skinIssues" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.skinIssues" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                </el-form>
                <div class="diff-right-label">{{ localizeMixedLabel('Other Exterior Symptom 其它表证') }}</div>
                <el-input v-model="form.diff.otherExterior" type="textarea" :rows="6" :readonly="isReadOnly" placeholder="---" />
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Chest 心胸 -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">{{ localizeMixedLabel('Chest 心胸') }}</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="200px" label-position="left" size="small">
                  <el-form-item :label="localizeMixedLabel('Chest 心胸')">
                    <el-select v-model="form.diff.chest" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.chest" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Hypochondriac 两胁')">
                    <el-select v-model="form.diff.hypochondriac" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.hypochondriac" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Sleep 睡觉')">
                    <el-select v-model="form.diff.sleep" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.sleep" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Anxiety/Stress 心烦/压力 (1-10)')">
                    <el-input-number v-model="form.diff.anxietyStress" :min="1" :max="10" :disabled="isReadOnly" style="width:120px" />
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <div class="diff-right-label">{{ localizeMixedLabel('Other Chest Syndrome 其它心胸症状') }}</div>
                <el-input v-model="form.diff.otherChest" type="textarea" :rows="8" :readonly="isReadOnly" placeholder="---" />
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Abdomen 腹部 -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">{{ localizeMixedLabel('Abdomen 腹部') }}</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="200px" label-position="left" size="small">
                  <el-form-item :label="localizeMixedLabel('Appetite 胃口')">
                    <el-select v-model="form.diff.appetite" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.appetite" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Thirst 口渴')">
                    <el-select v-model="form.diff.thirst" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.thirst" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Abdomen 腹部')">
                    <el-select v-model="form.diff.abdomen" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.abdomen" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <div class="diff-right-label">{{ localizeMixedLabel('Other Abdominal Symptoms 其它腹部症状') }}</div>
                <el-input v-model="form.diff.otherAbdomen" type="textarea" :rows="6" :readonly="isReadOnly" placeholder="---" />
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Lower Abdomen 下腹 -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">{{ localizeMixedLabel('Lower Abdomen 下腹') }}</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="200px" label-position="left" size="small">
                  <el-form-item :label="localizeMixedLabel('Bowel Movement 大便')">
                    <el-select v-model="form.diff.bowelMovement" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.bowelMovement" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Urine 小便')">
                    <el-select v-model="form.diff.urine" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.urine" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <div class="diff-right-label">{{ localizeMixedLabel('Other Lower Abdomen Symptoms 其它下腹症状') }}</div>
                <el-input v-model="form.diff.otherLowerAbdomen" type="textarea" :rows="5" :readonly="isReadOnly" placeholder="---" />
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Female 妇科 -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">{{ localizeMixedLabel('Female 妇科') }}</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="220px" label-position="left" size="small">
                  <el-form-item :label="localizeMixedLabel('Period Cycle 经期长 (days)')">
                    <el-input-number v-model="form.diff.periodCircle" :min="0" :disabled="isReadOnly" style="width:120px" />
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Period Duration 每期持续 (days)')">
                    <el-input-number v-model="form.diff.periodDuration" :min="0" :disabled="isReadOnly" style="width:120px" />
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Blood Quality 经血情况')">
                    <el-select v-model="form.diff.bloodQuality" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.bloodQuality" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('PMS 经期相关症状')">
                    <el-select v-model="form.diff.pms" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.pms" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <div class="diff-right-label">{{ localizeMixedLabel('Other Female Symptoms 其它妇科症状') }}</div>
                <el-input v-model="form.diff.otherFemale" type="textarea" :rows="6" :readonly="isReadOnly" placeholder="---" />
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Pulse 脉 -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">{{ localizeMixedLabel('Pulse 脉') }}</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="220px" label-position="left" size="small">
                  <el-form-item :label="localizeMixedLabel('All Position 六部')">
                    <el-select v-model="form.diff.pulse" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.pulse" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Right Hand 单右手脉')">
                    <el-select v-model="form.diff.pulseRightHand" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.pulse" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Left Hand 单左手脉')">
                    <el-select v-model="form.diff.pulseLeftHand" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.pulse" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Both Cun 双寸脉')">
                    <el-select v-model="form.diff.pulseBothCun" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.pulse" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Both Guan 双关脉')">
                    <el-select v-model="form.diff.pulseBothGuan" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.pulse" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Both Chi 双尺脉')">
                    <el-select v-model="form.diff.pulseBothChi" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.pulse" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Single Position 单部脉补充信息')">
                    <el-input v-model="form.diff.detailedPulse" type="textarea" :rows="3" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <el-form label-width="220px" label-position="left" size="small">
                  <el-form-item :label="localizeMixedLabel('Pathological Channel 病变经络')">
                    <el-select v-model="form.diff.pathologicalChannel" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.pathologicalChannel" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Pathological Changes 病变详情')">
                    <el-input v-model="form.diff.pathologicalChanges" type="textarea" :rows="4" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                </el-form>
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Tongue 舌 -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">{{ localizeMixedLabel('Tongue 舌') }}</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="200px" label-position="left" size="small">
                  <el-form-item :label="localizeMixedLabel('Tongue Color 舌色')">
                    <el-select v-model="form.diff.tongueColor" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.tongueColor" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Tongue Body/Shape 舌体/形')">
                    <el-select v-model="form.diff.tongueBody" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.tongueBody" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Tongue Coating 舌苔')">
                    <el-select v-model="form.diff.tongueCoating" multiple clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.tongueCoating" :key="o" :label="localizeMixedLabel(o)" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="localizeMixedLabel('Other Tongue Details 其它舌头信息')">
                    <el-input v-model="form.diff.otherTongue" type="textarea" :rows="3" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <div class="diff-right-label">Tongue Image</div>
                <div v-if="form.diff.tongueImage" class="tongue-img-preview">
                  <el-image :src="form.diff.tongueImage" style="max-width:200px; border-radius:8px" />
                  <el-button v-if="!isReadOnly" size="small" type="danger" text @click="removeTongueImage" style="margin-top:4px">{{ t('consultation.deleteImage') }}</el-button>
                </div>
                <div v-else class="tongue-upload-area">
                  <el-icon style="font-size:32px; color:#ccc"><Picture /></el-icon>
                  <p style="color:#aaa; font-size:13px; margin-top:8px">{{ t('consultation.tongueImageHint') }}</p>
                  <el-upload
                    v-if="!isReadOnly"
                    :auto-upload="false"
                    :show-file-list="false"
                    accept="image/*"
                    :on-change="handleTongueUpload"
                  >
                    <el-button size="small">{{ t('consultation.chooseFile') }}</el-button>
                  </el-upload>
                  <p v-else style="color:#ccc; font-size:12px">{{ t('consultation.noFileSelected') }}</p>
                </div>
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Differentiation Conclusion (image9) -->
          <el-card class="diff-card">
            <template #header>
              <div class="diff-card-header">
                <span class="diff-header">Differentiation Conclusion</span>
                <el-button v-if="!isReadOnly" size="small" @click="form.diff.conclusions.push({ name: '', treatment: '' })">
                  <el-icon><Plus /></el-icon> Add Existing Differentiation
                </el-button>
              </div>
            </template>
            <el-table :data="form.diff.conclusions" size="small" empty-text="We didn't find anything to show here">
              <el-table-column label="Differentiation Name" min-width="180">
                <template #default="{ row }">
                  <el-select
                    v-if="!isReadOnly"
                    v-model="row.name"
                    filterable
                    allow-create
                    default-first-option
                    clearable
                    :placeholder="t('consultation.diffName')"
                    size="small"
                    style="width:100%"
                  >
                    <el-option
                      v-for="option in differentiationNameSuggestions"
                      :key="option"
                      :label="option"
                      :value="option"
                    />
                  </el-select>
                  <span v-else>{{ row.name }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Treatment" min-width="180">
                <template #default="{ row }">
                  <el-select
                    v-if="!isReadOnly"
                    v-model="row.treatment"
                    filterable
                    allow-create
                    default-first-option
                    clearable
                    :placeholder="t('consultation.treatmentMethod')"
                    size="small"
                    style="width:100%"
                  >
                    <el-option
                      v-for="option in differentiationTreatmentSuggestions"
                      :key="option"
                      :label="option"
                      :value="option"
                    />
                  </el-select>
                  <span v-else>{{ row.treatment }}</span>
                </template>
              </el-table-column>
              <el-table-column v-if="!isReadOnly" width="60">
                <template #default="{ $index }">
                  <el-button type="danger" text size="small" :icon="'Delete'" @click="form.diff.conclusions.splice($index, 1)" />
                </template>
              </el-table-column>
            </el-table>
            <div class="table-rows-count">Rows: {{ form.diff.conclusions.length }}</div>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- Tab 3: Treatments -->

      <el-tab-pane :label="t('consultation.tabTreatment')" name="treatments">

        <!-- Acupuncture Points sub-section -->
        <el-card class="section-card" style="margin-bottom:12px">
          <template #header>
            <div class="diff-card-header">
              <span class="sec-header">Acu Points</span>
              <el-button v-if="!isReadOnly" size="small" @click="addAcu">
                <el-icon><Plus /></el-icon> Add Acupoint
              </el-button>
            </div>
          </template>
          <el-table :data="form.acupuncture" size="small" empty-text="We didn't find anything to show here">
            <el-table-column label="Name" min-width="160">
              <template #default="{ row }">
                <el-select v-if="!isReadOnly" v-model="row.point" filterable allow-create size="small" style="width:100%">
                  <el-option v-for="pt in acupointsStore.acupointNames" :key="pt" :label="pt" :value="pt" />
                </el-select>
                <span v-else>{{ row.point }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Side" width="200">
              <template #default="{ row }">
                <el-radio-group v-if="!isReadOnly" v-model="row.side" size="small">
                  <el-radio-button v-for="s in SIDE_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</el-radio-button>
                </el-radio-group>
                <span v-else>{{ row.side }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Notes" min-width="160">
              <template #default="{ row }">
                <el-input v-if="!isReadOnly" v-model="row.notes" size="small" :placeholder="t('common.notes')" />
                <span v-else>{{ row.notes }}</span>
              </template>
            </el-table-column>
            <el-table-column v-if="!isReadOnly" width="60">
              <template #default="{ $index }">
                <el-button type="danger" text size="small" :icon="'Delete'" @click="removeAcu($index)" />
              </template>
            </el-table-column>
          </el-table>
          <div class="table-rows-count">Rows: {{ form.acupuncture.length }}</div>
        </el-card>

        <!-- Prescriptions sub-section -->
        <el-card class="section-card" style="margin-bottom:12px">
          <template #header>
            <div class="diff-card-header">
              <span class="sec-header">Prescriptions</span>
              <el-button v-if="!isReadOnly" size="small" type="primary" @click="openNewRx">
                <el-icon><Plus /></el-icon> New Prescription
              </el-button>
            </div>
          </template>
          <div class="wide-table-wrap">
            <el-table :data="form.prescriptions" size="small" empty-text="We didn't find anything to show here">
              <el-table-column label="Name" min-width="200">
                <template #default="{ row }">
                  <span class="rx-name-cell">{{ row.formulaName || t('common.customFormula') }} - {{ row.items?.length || 0 }}{{ t('consultation.herbCount') }}</span>
                  <el-tag v-if="row.prescriptionType && row.prescriptionType !== 'none'" size="small" :type="row.prescriptionType === 'powder' ? 'warning' : row.prescriptionType === 'pills' ? '' : 'success'" style="margin-left:4px">
                    {{ getPrescriptionTypeLabel(row.prescriptionType) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="Direction" width="140">
                <template #default="{ row }">{{ row.direction }}</template>
              </el-table-column>
              <el-table-column label="Where To" width="120">
                <template #default="{ row }">{{ row.whereToGet?.split(' ')[0] }}</template>
              </el-table-column>
              <el-table-column label="Single Prescription" width="130" align="right">
                <template #default="{ row }">
                  <span style="font-weight:600">{{ cs }}{{ (row.subtotal || 0).toFixed(2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Quantity" width="80">
                <template #default="{ row }">{{ row.quantity }}</template>
              </el-table-column>
              <el-table-column label="Dispensed" width="90">
                <template #default="{ row }">
                  <el-tag :type="isPrescriptionDispensed(row) ? 'success' : 'warning'" size="small">
                    {{ isPrescriptionDispensed(row) ? t('consultation.dispensed') : t('consultation.pendingDispense') }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column v-if="!isReadOnly" width="160">
                <template #default="{ row, $index }">
                  <el-button size="small" text type="success" @click="handlePrintRx($index)"><el-icon><Printer /></el-icon> Print</el-button>
                  <el-button size="small" text type="primary" @click="openEditRx($index)">{{ t('common.edit') }}</el-button>
                  <el-button size="small" text type="danger" @click="deleteRx($index)">{{ t('common.delete') }}</el-button>
                </template>
              </el-table-column>
              <el-table-column v-else width="80">
                <template #default="{ row, $index }">
                  <el-button size="small" text type="success" @click="handlePrintRx($index)"><el-icon><Printer /></el-icon> Print</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="table-rows-count">Rows: {{ form.prescriptions.length }}</div>
        </el-card>

        <!-- Prognosis & Feedback (image11) -->
        <el-card class="section-card">
          <template #header><span class="sec-header">Prognosis &amp; Feedback</span></template>
          <el-row :gutter="16">
            <el-col :span="12">
              <div class="prog-label">Prognosis for Current Treatment</div>
              <el-input v-model="form.prognosis" type="textarea" :rows="10"
                :placeholder="t('consultation.prognosisPlaceholder')" :readonly="isReadOnly" />
            </el-col>
            <el-col :span="12">
              <div class="prog-label">
                Feedback for Current Treatment
                <el-icon v-if="form.lockedAt" style="margin-left:4px"><Lock /></el-icon>
              </div>
              <el-input v-model="form.feedback" type="textarea" :rows="10"
                :placeholder="t('consultation.feedbackPlaceholder')"
                :readonly="isReadOnly || !form.lockedAt" />
            </el-col>
          </el-row>
        </el-card>
      </el-tab-pane>

      <!-- Tab 4: Pricing -->

      <el-tab-pane :label="t('consultation.tabPricing')" name="pricing">

        <!-- Service Price List -->
        <el-card class="section-card" style="margin-bottom:12px">
          <el-form label-width="200px" label-position="left" size="small">
            <el-form-item label="Service Price List *">
              <el-select
                v-model="form.servicePriceList"
                :disabled="isReadOnly"
                placeholder="Select price list"
                clearable
                size="small"
                style="width:200px"
              >
                <el-option
                  v-for="pl in settingsStore.activePriceLists"
                  :key="pl.id"
                  :label="pl.name"
                  :value="pl.id"
                />
              </el-select>
            </el-form-item>
          </el-form>

          <!-- Services sub-table -->
          <div class="subsection-header">
            <span class="subsec-label">Services</span>
            <el-button v-if="!isReadOnly" size="small" @click="addService">
              <el-icon><Plus /></el-icon> New Service
            </el-button>
          </div>
          <el-table :data="form.services" size="small" :empty-text="t('consultation.noServices')">
            <el-table-column label="Service" min-width="200">
              <template #default="{ row }">
                <el-select
                  v-if="!isReadOnly"
                  v-model="row.name"
                  filterable
                  allow-create
                  default-first-option
                  size="small"
                  :placeholder="t('consultation.serviceNamePlaceholder')"
                  style="width:100%"
                  @change="onServiceSelect(row, $event)"
                >
                  <el-option
                    v-for="opt in priceListServiceOptions"
                    :key="opt.key"
                    :label="opt.name"
                    :value="opt.value"
                  >
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px">
                      <span>
                        {{ opt.name }}
                        <span v-if="opt.showSource" style="color:#888; font-size:12px"> · {{ opt.priceListName }}</span>
                      </span>
                      <span style="color:#888; font-size:12px; white-space:nowrap">
                        CNY {{ opt.price }}
                        <el-tag v-if="opt.taxable" size="small" type="warning" style="margin-left:4px">Tax</el-tag>
                      </span>
                    </div>
                  </el-option>
                </el-select>
                <span v-else>{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Unit" width="80">
              <template #default>time</template>
            </el-table-column>
            <el-table-column label="Price Per" width="120">
              <template #default="{ row }">
                <el-input-number v-if="!isReadOnly" v-model="row.price" :min="0" size="small" style="width:100px" />
                <span v-else>{{ cs }}{{ row.price }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Qty" width="80">
              <template #default="{ row }">
                <el-input-number v-if="!isReadOnly" v-model="row.quantity" :min="1" size="small" style="width:70px" />
                <span v-else>{{ row.quantity }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Manual Discount" width="110">
              <template #default="{ row }">
                <el-input-number v-if="!isReadOnly" v-model="row.manualDiscount" :min="0" size="small" style="width:90px" />
                <span v-else>{{ cs }}{{ row.manualDiscount }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Extended" width="100" align="right">
              <template #default="{ row }">
                <span style="font-weight:600">{{ cs }}{{ getServiceExtended(row).toFixed(2) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Taxable" width="70">
              <template #default="{ row }">
                <el-checkbox v-if="!isReadOnly" v-model="row.taxable" />
                <el-icon v-else-if="row.taxable"><Select /></el-icon>
              </template>
            </el-table-column>
            <el-table-column label="Tax" width="90" align="right">
              <template #default="{ row }">
                <span v-if="row.taxable" style="color:#888; font-size:12px">{{ cs }}{{ getServiceTax(row).toFixed(2) }}</span>
                <span v-else style="color:#ccc">-</span>
              </template>
            </el-table-column>
            <el-table-column v-if="!isReadOnly" width="60">
              <template #default="{ $index }">
                <el-button type="danger" text size="small" :icon="'Delete'" @click="removeService($index)" />
              </template>
            </el-table-column>
          </el-table>
          <div class="table-rows-count">
            Total Service: <strong>{{ cs }}{{ totalService.toFixed(2) }}</strong>
            <el-icon style="margin-left:4px"><Lock /></el-icon>
          </div>
        </el-card>

        <!-- Pricing Info (image13, 16) -->
        <el-card class="section-card">
          <el-row :gutter="24">
            <el-col :span="12">
              <el-form label-width="200px" label-position="left" size="small">
                <el-form-item label="Currency">
                  <el-select v-model="form.currency" style="width:160px" :disabled="isReadOnly">
                    <el-option label="Canadian Dollar CAD" value="CAD" />
                    <el-option label="US Dollar USD" value="USD" />
                    <el-option label="Chinese Yuan CNY" value="CNY" />
                  </el-select>
                </el-form-item>
                <el-form-item label="Discount Type *">
                  <div class="discount-btns">
                    <el-button :type="form.discountType === 'percentage' ? 'primary' : ''" size="small"
                      @click="!isReadOnly && (form.discountType = 'percentage')">Percentage %</el-button>
                    <el-button :type="form.discountType === 'amount' ? 'primary' : ''" size="small"
                      @click="!isReadOnly && (form.discountType = 'amount')">Amount {{ cs }}</el-button>
                    <el-button :type="form.discountType === 'none' ? 'primary' : ''" size="small"
                      @click="!isReadOnly && (form.discountType = 'none')">No Disc.</el-button>
                  </div>
                  <el-input-number v-if="form.discountType !== 'none' && !isReadOnly"
                    v-model="form.discountValue" :min="0" size="small" style="width:120px; margin-left:8px" />
                </el-form-item>
                <el-form-item :label="localizeMixedLabel('Tax Rate 税率')">
                  <el-radio-group v-model="form.overrideTaxRate" :disabled="isReadOnly" size="small">
                    <el-radio-button :value="null">Default ({{ (settingsStore.taxRate * 100).toFixed(0) }}%)</el-radio-button>
                    <el-radio-button :value="0">{{ localizeMixedLabel('0% 免税') }}</el-radio-button>
                    <el-radio-button :value="0.13">13%</el-radio-button>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="Consultation Fee Taxable">
                  <el-switch v-model="form.consultationFeeTaxable" :disabled="isReadOnly" active-text="Yes" inactive-text="No" />
                </el-form-item>
                <el-form-item label="Include Prescription Amount?">
                  <el-switch v-model="form.includeRxAmount" :disabled="isReadOnly" active-text="Yes" inactive-text="No" />
                </el-form-item>
                <el-form-item label="Add 3rd Party">
                  <el-switch v-model="form.add3rdParty" :disabled="isReadOnly" active-text="Yes" inactive-text="No" />
                </el-form-item>
              </el-form>
            </el-col>
            <el-col :span="12">
              <div class="price-summary">
                <div class="price-row">
                  <span>Consultation Fee</span>
                  <div class="price-val">
                    <el-input-number v-if="!isReadOnly" v-model="form.consultationFee" :min="0" size="small" style="width:110px" />
                    <span v-else>{{ cs }}{{ form.consultationFee.toFixed(2) }}</span>
                  </div>
                </div>
                <div class="price-row">
                  <span>Total Service</span>
                  <span class="price-lock">{{ cs }}{{ totalService.toFixed(2) }} <el-icon><Lock /></el-icon></span>
                </div>
                <div class="price-row" v-if="form.includeRxAmount && form.prescriptions.length">
                  <span>{{ localizeMixedLabel('Prescription Amount 处方金额') }}</span>
                  <span class="price-lock">{{ cs }}{{ totalRxAmount.toFixed(2) }} <el-icon><Lock /></el-icon></span>
                </div>
                <div class="price-row" v-if="form.discountType !== 'none'">
                  <span>Discount</span>
                  <span style="color:#e63946">-{{ cs }}{{ form.discountType === 'percentage' ? ((form.consultationFee + totalService + (form.includeRxAmount ? totalRxAmount : 0)) * form.discountValue / 100).toFixed(2) : form.discountValue.toFixed(2) }}</span>
                </div>
                <div class="price-row total-before-tax">
                  <span>Total without Tax</span>
                  <span class="price-lock">{{ cs }}{{ totalWithoutTax.toFixed(2) }} <el-icon><Lock /></el-icon></span>
                </div>
                <div class="price-row tax-row">
                  <span>Tax {{ (effectiveTaxRate * 100).toFixed(0) }}% - {{ t('consultation.perItemTax') }}</span>
                  <span>{{ cs }}{{ taxAmount.toFixed(2) }}</span>
                </div>
                <div class="price-row grand-total">
                  <span>Grand Total</span>
                  <span>{{ cs }}{{ totalAmount.toFixed(2) }}</span>
                </div>
              </div>
            </el-col>
          </el-row>
          <el-divider />
          <el-form label-width="80px" size="small">
            <el-form-item label="Comments">
              <el-input v-model="form.comments" type="textarea" :rows="3" :readonly="isReadOnly" placeholder="---" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- Tab 5: Invoices -->

      <el-tab-pane :label="t('consultation.tabInvoice')" name="invoices">
        <el-card class="section-card" style="margin-bottom:12px">
          <!-- PDF actions -->
          <div class="pdf-links" style="margin-bottom:12px">
            <el-button size="small" @click="handleGeneratePdf">
              <el-icon><Document /></el-icon> {{ t('consultation.generatePdf') }}
            </el-button>
            <el-button size="small" @click="handleSendReport">
              <el-icon><Message /></el-icon> {{ t('consultation.sendReport') }}
            </el-button>
          </div>

          <el-table :data="form.lockedAt ? [form] : []" size="small" :empty-text="t('consultation.noInvoice')">
            <el-table-column label="Name" min-width="220">
              <template #default>
                <span class="link-text">INV-{{ form.consultationId?.slice(-8) || '------' }} - {{ patient.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Status Reason" width="100">
              <template #default><el-tag type="success" size="small">Paid</el-tag></template>
            </el-table-column>
            <el-table-column label="Status" width="90">
              <template #default><el-tag type="info" size="small">Active</el-tag></template>
            </el-table-column>
            <el-table-column label="Created On" width="160">
              <template #default>{{ formatDateTime(form.lockedAt) }}</template>
            </el-table-column>
          </el-table>
          <div class="table-rows-count">Rows: {{ form.lockedAt ? 1 : 0 }}</div>
        </el-card>

        <!-- Invoice PDF Preview (image17) -->
        <el-card v-if="form.lockedAt" class="section-card invoice-pdf-preview">
          <template #header>
            <div class="diff-card-header">
              <span class="sec-header">Invoice PDF Preview</span>
              <el-button size="small" @click="handleExportPdf">{{ t('consultation.exportPdf') }}</el-button>
            </div>
          </template>
          <div class="pdf-mock">
            <div class="pdf-header">
              <div class="pdf-logo">TCM CLINIC</div>
              <div class="pdf-inv-title">INVOICE</div>
            </div>
            <div class="pdf-meta">
              <div>
                <strong>{{ settingsStore.clinicName }}</strong><br>
                {{ settingsStore.clinicAddress }}<br>
                {{ settingsStore.clinicPhone }}
              </div>
              <div class="pdf-meta-right">
                <div>INVOICE # {{ form.consultationId }}</div>
                <div>DATE: {{ form.date }}</div>
              </div>
            </div>
            <div class="pdf-bill-to">
              <strong>BILL TO:</strong> {{ patient.name }}
              &nbsp;|&nbsp; {{ patient.emails?.[0] }}
              &nbsp;|&nbsp; {{ patient.mobilePhone || patient.phone }}
            </div>
            <table class="pdf-items">
              <thead>
                <tr><th>QTY</th><th>DESCRIPTION</th><th>UNIT PRICE</th><th>AMOUNT</th><th>TAX</th></tr>
              </thead>
              <tbody>
                <tr v-for="(s, i) in form.services" :key="i">
                  <td>{{ s.quantity }}</td>
                  <td>{{ s.name.toUpperCase() }}</td>
                  <td>{{ cs }}{{ s.price.toFixed(2) }}</td>
                  <td>{{ cs }}{{ getServiceExtended(s).toFixed(2) }}</td>
                  <td>{{ s.taxable ? cs + getServiceTax(s).toFixed(2) : '-' }}</td>
                </tr>
                <tr v-if="form.consultationFee > 0">
                  <td>1</td>
                  <td>CONSULTATION FEE</td>
                  <td>{{ cs }}{{ form.consultationFee.toFixed(2) }}</td>
                  <td>{{ cs }}{{ form.consultationFee.toFixed(2) }}</td>
                  <td>{{ form.consultationFeeTaxable !== false ? cs + consultationFeeTax.toFixed(2) : '-' }}</td>
                </tr>
              </tbody>
            </table>
            <div class="pdf-totals">
              <div>SUBTOTAL: {{ cs }}{{ totalWithoutTax.toFixed(2) }}</div>
              <div>TAX ({{ (effectiveTaxRate*100).toFixed(0) }}%): {{ cs }}{{ taxAmount.toFixed(2) }}</div>
              <div>GRAND TOTAL: <strong>{{ cs }}{{ totalAmount.toFixed(2) }}</strong></div>
              <div>BALANCE AMOUNT: <strong>{{ cs }}0</strong></div>
            </div>
            <div class="pdf-footer">THANK YOU FOR YOUR BUSINESS!</div>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- Tab 6: History -->

      <el-tab-pane :label="t('consultation.tabHistory')" name="history">
        <el-card class="section-card" style="margin-bottom:12px">
          <template #header><span class="sec-header">Version &amp; Modification History</span></template>
          <div class="version-info">
            <el-descriptions :column="3" size="small" border>
              <el-descriptions-item label="Current Version">v{{ form.version || 1 }}</el-descriptions-item>
              <el-descriptions-item label="Created">{{ formatDateTime(form.createdAt) || '-' }}</el-descriptions-item>
              <el-descriptions-item label="Locked">{{ form.lockedAt ? formatDateTime(form.lockedAt) : 'Not locked' }}</el-descriptions-item>
            </el-descriptions>
          </div>
          <div v-if="form.modifications && form.modifications.length > 0" style="margin-top:16px">
            <el-timeline>
              <el-timeline-item
                v-for="(mod, idx) in [...form.modifications].reverse()"
                :key="idx"
                :timestamp="formatDateTime(mod.date)"
                :type="mod.type === 'lock' ? 'danger' : 'primary'"
              >
                <div class="mod-entry">
                  <strong>{{ mod.action || mod.type }}</strong>
                  <span class="mod-user">{{ authStore.users.find(u => u.id === mod.userId)?.name || mod.userId }}</span>
                </div>
                <div v-if="mod.reason" class="mod-reason">{{ mod.reason }}</div>
                <div v-if="mod.changes" class="mod-changes">{{ mod.changes }}</div>
              </el-timeline-item>
            </el-timeline>
          </div>
          <el-empty v-else description="No modifications recorded" />
        </el-card>
      </el-tab-pane>

      <!-- Tab 7: Documents -->

      <el-tab-pane label="Documents" name="documents">
        <el-card class="section-card">
          <div class="doc-upload-area">
            <el-icon style="font-size:48px; color:#ccc"><Document /></el-icon>
            <p style="color:#aaa; margin:12px 0">{{ t('consultation.uploadHint') }}</p>
            <el-upload
              v-if="!isReadOnly"
              :auto-upload="false"
              :show-file-list="false"
              accept="image/*,.pdf,.doc,.docx"
              :on-change="handleDocUpload"
            >
              <el-button>
                <el-icon><Upload /></el-icon> {{ t('consultation.uploadFile') }}
              </el-button>
            </el-upload>
          </div>
          <div v-if="form.documents?.length" style="margin-top:16px">
            <el-table :data="form.documents" size="small">
              <el-table-column :label="t('consultation.fileName')" min-width="200">
                <template #default="{ row }">
                  <span class="link-text" @click="previewDocument(row)">{{ row.name }}</span>
                </template>
              </el-table-column>
              <el-table-column :label="t('consultation.fileType')" width="120">
                <template #default="{ row }">{{ row.type?.split('/')[1] || '-' }}</template>
              </el-table-column>
              <el-table-column :label="t('consultation.fileSize')" width="100">
                <template #default="{ row }">{{ row.size ? (row.size / 1024).toFixed(1) + 'KB' : '-' }}</template>
              </el-table-column>
              <el-table-column :label="t('consultation.uploadTime')" width="160">
                <template #default="{ row }">{{ formatDateTime(row.uploadedAt) }}</template>
              </el-table-column>
              <el-table-column v-if="!isReadOnly" width="80">
                <template #default="{ $index }">
                  <el-button size="small" text type="danger" @click="removeDocument($index)">{{ t('common.delete') }}</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-card>
      </el-tab-pane>

    </el-tabs>

    <!-- Prescription Drawer -->
    <el-drawer
      v-model="showRxDialog"
      title="New Prescription"
      :size="rxDrawerSize"
      direction="rtl"
      :close-on-press-escape="true"
      :destroy-on-close="false"
      :before-close="handleRxDrawerBeforeClose"
      @closed="handleRxDialogClosed"
    >
      <div class="rx-dialog-body">
        <el-form :model="rxForm" label-width="160px" size="small" style="margin-bottom:12px">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="Direction *">
                <el-select v-model="rxForm.direction" style="width:100%">
                  <el-option v-for="o in TCM_OPTIONS.direction" :key="o" :label="o" :value="o" />
                </el-select>
              </el-form-item>
              <el-form-item label="Where To Get *">
                <el-select v-model="rxForm.whereToGet" style="width:100%">
                  <el-option v-for="o in TCM_OPTIONS.whereToGet" :key="o" :label="o" :value="o" />
                </el-select>
              </el-form-item>
              <el-form-item label="Quantity *">
                <el-input-number v-model="rxForm.quantity" :min="1" @change="recalcRxItems" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="Preferred Unit *">
                <el-select v-model="rxForm.preferredUnit" style="width:100%" @change="(val) => { rxForm.prescriptionType = val.includes('bag') ? 'powder' : 'raw_herbs'; recalcRxItems(); }">
                  <el-option label="bag" value="bag" />
                  <el-option label="g" value="g" />
                </el-select>
              </el-form-item>
              <el-form-item label="Rx Type">
                <el-radio-group v-model="rxForm.prescriptionType" size="small" @change="(val) => { rxForm.preferredUnit = val === 'powder' ? 'bag' : 'g'; recalcRxItems(); }">
                  <el-radio-button value="raw_herbs">Raw</el-radio-button>
                  <el-radio-button value="powder">Powder</el-radio-button>
                  <el-radio-button value="pills">Pills</el-radio-button>
                  <el-radio-button value="none">Rx Only</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <!-- Formula selector (image26) -->
              <el-form-item label="Formula">
                <div style="position:relative; width:100%">
                  <el-input v-model="formulaSearch" :placeholder="t('consultation.formulaSearchPlaceholder')" clearable />
                  <div v-if="formulaSuggestions.length" class="formula-suggestions-dialog">
                    <div v-for="f in formulaSuggestions" :key="f.name" class="formula-item" @click="applyFormulaToDialog(f)">
                      <strong>{{ f.name }}</strong>
                      <span class="fherbs">{{ (f.items || []).map(h => h.herbName).join(', ') }}</span>
                    </div>
                  </div>
                </div>
              </el-form-item>
              <el-form-item label="Formula Name" v-if="rxForm.formulaName">
                <el-tag type="success">{{ rxForm.formulaName }}</el-tag>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>

        <!-- Prescription Items (image27) -->
        <div class="subsection-header">
            <span class="subsec-label">Prescription Items</span>
          <div>
            <el-button size="small" @click="addRxItem"><el-icon><Plus /></el-icon> {{ t('consultation.addHerb') }}</el-button>
          </div>
        </div>
        <div class="wide-table-wrap">
          <el-table :data="rxForm.items" size="small" max-height="360" style="margin-bottom:8px">
          <el-table-column label="?Herb" min-width="110">
            <template #default="{ row }">
              <el-autocomplete
                v-model="row.name"
                :fetch-suggestions="queryHerbs"
                size="small"
                :placeholder="t('consultation.herbNamePlaceholder')"
                @select="(item) => handleHerbSelect(item, row)"
                style="width:100%"
                @change="recalcRxItems"
              />
            </template>
          </el-table-column>
          <el-table-column :label="localizeMixedLabel('Dosage(g) 剂量')" width="110">
            <template #default="{ row }">
              <el-input-number v-model="row.dosage" :min="0" :step="1" size="small" style="width:95px" @change="recalcRxItems" />
            </template>
          </el-table-column>
          <el-table-column :label="localizeMixedLabel('Converted 转换')" width="140" v-if="rxForm.prescriptionType !== 'none'">
            <template #default="{ row }">
              <span v-if="row.outOfStock" style="color: #e63946; font-weight: 700">
                0{{ row.convertedUnit || '-' }} <span style="font-size:11px">(Out of stock)</span>
              </span>
              <span v-else-if="row.convertedQty != null" :style="{ color: row.stockSufficient === false ? '#e63946' : '#2d6a4f', fontWeight: 600 }">
                {{ row.packetsPerDose != null ? row.packetsPerDose : row.convertedQty }}{{ row.convertedUnit }}
                <span style="font-size:11px; color:#888; display:block">{{ formatPerDoseSummary(row, rxForm.quantity) }}</span>
              </span>
              <span v-else style="color:#aaa">-</span>
            </template>
          </el-table-column>
          <el-table-column label="Supplier" width="110" v-if="rxForm.prescriptionType !== 'none'">
            <template #default="{ row, $index }">
              <el-select
                v-if="row.allCandidates && row.allCandidates.length > 0"
                :model-value="row.inventoryId"
                size="small"
                style="width:100px"
                @change="(val) => { const inv = row.allCandidates.find(c => c.id === val); if (inv) switchSupplier($index, inv) }"
              >
                <el-option
                  v-for="c in row.allCandidates"
                  :key="c.id"
                  :label="formatSupplierOption(c)"
                  :value="c.id"
                />
              </el-select>
              <span v-else-if="row.supplierName" style="font-size:12px; color:#888">
                {{ formatSupplierDisplay(row.supplierName, row.gramsPerPacket) }}
              </span>
              <span v-else style="color:#ccc; font-size:12px">-</span>
            </template>
          </el-table-column>
          <el-table-column label="Stock" width="70" v-if="rxForm.prescriptionType !== 'none'">
            <template #default="{ row }">
              <el-tag v-if="row.outOfStock" type="danger" size="small">Out</el-tag>
              <el-tag v-else-if="row.inventoryId" :type="row.stockSufficient ? 'success' : 'warning'" size="small">
                {{ row.inventoryStock }}{{ row.convertedUnit }}
              </el-tag>
              <el-tag v-else type="info" size="small">N/A</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="localizeMixedLabel('Price 价格')" width="110">
            <template #default="{ row }">
              <span style="font-size:13px; color:#555">{{ cs }}{{ (row.pricePerUnit || 0).toFixed(2) }}</span>
            </template>
          </el-table-column>
          <el-table-column width="45">
            <template #default="{ $index }">
              <el-button type="danger" text size="small" :icon="'Delete'" @click="removeRxItem($index)" />
            </template>
          </el-table-column>
          </el-table>
        </div>
        <div style="text-align:right; font-size:13px; color:#555; padding:8px">
          Prescription Amount:
          <strong style="color:#2d6a4f; font-size:15px">{{ cs }}{{ rxSubtotal.toFixed(2) }}</strong>
          <template v-if="(rxForm.quantity || 1) > 1">
            <el-icon style="margin-left:4px"><Lock /></el-icon>
            <span style="display:block; font-size:11px; color:#888">
              Per dose {{ cs }}{{ rxPerDoseSubtotal.toFixed(2) }} × Qty {{ rxForm.quantity }}
            </span>
          </template>
        </div>
      </div>
      <template #footer>
        <el-button @click="requestCloseRxDialog">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveRx">{{ t('consultation.saveRx') }}</el-button>
      </template>
    </el-drawer>

    <!-- Email Preview Drawer -->
    <el-drawer v-model="showEmailDialog" :title="t('email.preview')" :size="sideDrawerSize" direction="rtl">
      <el-form label-width="60px" size="small">
        <el-form-item :label="t('email.recipient')">
          <el-input v-model="emailData.to" />
        </el-form-item>
        <el-form-item :label="t('email.subject')">
          <el-input v-model="emailData.subject" />
        </el-form-item>
        <el-form-item :label="t('email.body')">
          <el-input v-model="emailData.body" type="textarea" :rows="10" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEmailDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="sendEmail(); ElMessage.success(t('common.emailSent'))">{{ t('common.sendEmail') }}</el-button>
      </template>
    </el-drawer>

    <!-- Consultation Compare Panel -->
    <ConsultationComparePanel
      v-model:visible="showCompare"
      :patient-id="patientId"
      :current-form="form"
      @copy-section="onCopySection"
      @update-field="onUpdateField"
    />
  </div>

  <div v-else class="not-found">
    <el-empty :description="t('patientDetail.notFound')" />
    <el-button @click="$router.push('/patients')">{{ t('common.back') }}</el-button>
  </div>
</template>

<style scoped>
.cv-wrap { max-width: 100%; }
.cv-header {
  display: flex; justify-content: space-between; align-items: center;
  background: #fff; padding: 10px 16px; border-radius: 10px;
  margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  flex-wrap: wrap; gap: 8px;
}
.cv-header-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cv-title { display: flex; align-items: center; gap: 4px; }
.cv-patient { font-weight: 700; color: #1b4332; font-size: 15px; }
.cv-sep { color: #aaa; }
.cv-complaint { color: #2d6a4f; font-size: 14px; }
.cv-header-right { display: flex; gap: 8px; flex-wrap: wrap; }

.section-card { border-radius: 10px; }
.sec-header { font-size: 12px; font-weight: 700; color: #555; letter-spacing: 0.5px; text-transform: uppercase; }
.diff-sections { display: flex; flex-direction: column; gap: 12px; }
.diff-card { border-radius: 10px; }
.diff-header { font-weight: 700; color: #1b4332; font-size: 14px; }
.diff-card-header { display: flex; justify-content: space-between; align-items: center; }
.diff-right-label { font-size: 12px; font-weight: 600; color: #666; margin-bottom: 6px; }
.table-rows-count { font-size: 12px; color: #888; margin-top: 8px; text-align: right; }
.readonly-field { background: #f9f9f9; }

.tongue-upload-area {
  background: #f9f9f9; border: 1px dashed #ddd; border-radius: 8px;
  padding: 30px; text-align: center;
}

.prog-label { font-size: 13px; font-weight: 600; color: #555; margin-bottom: 6px; display: flex; align-items: center; }

.rx-name-cell { font-weight: 600; color: #2d6a4f; }

.subsection-header { display: flex; justify-content: space-between; align-items: center; margin: 8px 0; }
.subsec-label { font-size: 13px; font-weight: 600; color: #444; }
.wide-table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }

.discount-btns { display: flex; gap: 4px; }

.price-summary {
  background: #f9fafb; border-radius: 8px; padding: 16px;
  display: flex; flex-direction: column; gap: 8px;
}
.price-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #555; }
.price-lock { display: flex; align-items: center; gap: 4px; }
.total-before-tax { border-top: 1px solid #e0e0e0; padding-top: 8px; font-weight: 600; }
.tax-row { color: #e9a000; }
.grand-total { font-size: 16px; font-weight: 700; color: #1b4332; border-top: 2px solid #2d6a4f; padding-top: 10px; }

.link-text { color: #409eff; cursor: pointer; }
.link-text:hover { text-decoration: underline; }
.pdf-links { display: flex; gap: 16px; flex-wrap: wrap; }
.pdf-link-item { display: flex; align-items: center; gap: 4px; font-size: 13px; }

/* Invoice PDF preview */
.invoice-pdf-preview { font-family: 'Courier New', monospace; }
.pdf-mock { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; font-size: 12px; }
.pdf-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.pdf-logo { font-size: 18px; font-weight: 700; color: #2d6a4f; }
.pdf-inv-title { font-size: 28px; font-weight: 900; color: #1b4332; letter-spacing: 2px; }
.pdf-meta { display: flex; justify-content: space-between; margin-bottom: 12px; color: #444; line-height: 1.8; }
.pdf-meta-right { text-align: right; }
.pdf-bill-to { background: #f9f9f9; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; color: #444; }
.pdf-items { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
.pdf-items th { background: #1b4332; color: #fff; padding: 6px 10px; text-align: left; }
.pdf-items td { border-bottom: 1px solid #f0f0f0; padding: 6px 10px; color: #333; }
.pdf-totals { text-align: right; padding: 8px 0; color: #333; line-height: 2; }
.pdf-footer { text-align: center; color: #888; font-size: 11px; margin-top: 12px; }

/* Formula suggestions in dialog */
.formula-suggestions-dialog {
  position: absolute; top: 100%; left: 0; right: 0;
  background: #fff; border: 1px solid #ddd; border-radius: 6px;
  z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto;
}
.formula-item { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f5f5f5; }
.formula-item:hover { background: #f0faf5; }
.fherbs { font-size: 11px; color: #888; margin-left: 8px; }

.doc-upload-area { display: flex; flex-direction: column; align-items: center; padding: 40px; }
.not-found { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 60px; }

/* History tab */
.version-info { margin-bottom: 8px; }
.mod-entry { display: flex; gap: 8px; align-items: center; }
.mod-user { font-size: 12px; color: #888; }
.mod-reason { font-size: 12px; color: #666; margin-top: 2px; }
.mod-changes { font-size: 11px; color: #aaa; margin-top: 2px; }

/* ?- ?*/
.history-med-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}
.history-med-header:hover {
  opacity: 0.85;
}
.history-med-card :deep(.el-card__header) {
  padding: 10px 16px;
  background: linear-gradient(135deg, #fffbe6 0%, #fff8e1 100%);
}
.history-med-body {
  overflow: hidden;
  transition: all 0.3s ease;
}

@media (max-width: 767px) {
  .cv-wrap {
    padding-bottom: 12px;
  }

  .cv-header {
    padding: 10px 12px;
  }

  .cv-header-left,
  .cv-header-right,
  .diff-card-header,
  .subsection-header,
  .price-row,
  .pdf-header,
  .pdf-meta,
  .history-med-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .cv-header-right {
    width: 100%;
  }

  .cv-header-right :deep(.el-button),
  .subsection-header :deep(.el-button) {
    width: 100%;
    justify-content: center;
  }

  .wide-table-wrap :deep(.el-table) {
    min-width: 720px;
  }

  .section-card :deep(.el-card__body) {
    padding: 12px;
  }

  .price-summary {
    padding: 12px;
  }

  .doc-upload-area,
  .not-found {
    padding: 24px 12px;
  }
}
</style>


