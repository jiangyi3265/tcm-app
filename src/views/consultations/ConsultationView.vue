<script setup>
import { ref, computed, onMounted, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useConsultationsStore } from '../../stores/consultations'
import { usePatientsStore } from '../../stores/patients'
import { useAuthStore } from '../../stores/auth'
import { useInventoryStore } from '../../stores/inventory'
import { useSettingsStore } from '../../stores/settings'
import { useAppointmentsStore } from '../../stores/appointments'
import { useBranchesStore } from '../../stores/branches'
import { useFormulasStore } from '../../stores/formulas'
import { useAcupointsStore } from '../../stores/acupoints'
import { hasPermission } from '../../utils/permissions'
import { formatDate, formatDateTime } from '../../utils/dateUtils'
import { TCM_OPTIONS, CHIEF_COMPLAINTS, emptyDiff } from '../../utils/sampleData'
import { printConsultationReport, printPrescription } from '../../utils/pdfExport'
import { useEmailSimulator } from '../../utils/emailSimulator'
import { filesApi, consultationsApi } from '../../utils/api'
import { calculatePrescription, recalcWithSupplier } from '../../utils/prescriptionCalc'
import { ElMessage, ElMessageBox } from 'element-plus'
import ConsultationComparePanel from './ConsultationComparePanel.vue'

const { t } = useI18n()

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

// 上一次诊疗（用于展示上次预后）
const lastConsultation = computed(() =>
  isNew ? consultStore.getLastConsultation(patientId) : null,
)

// ============ 表单数据 ============
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
  version: 1, modifications: [], lockedAt: null, createdAt: '',
})

const form = ref(defaultForm())
const consultation = ref(null)
const activeTab = ref('summary')
const saving = ref(false)
const showCompare = ref(false)

function onCopySection(data) {
  Object.assign(form.value, data)
  ElMessage.success(t('consultation.copiedToRecord'))
}

onMounted(() => {
  if (!isNew && consultId) {
    const existing = consultStore.getConsultation(consultId)
    if (existing) {
      consultation.value = existing
      form.value = {
        ...defaultForm(),
        ...existing,
        diff: { ...emptyDiff(), ...(existing.diff || {}) },
        acupuncture: [...(existing.acupuncture || [])],
        prescriptions: (existing.prescriptions || []).map(rx => ({
          ...rx, items: [...(rx.items || [])]
        })),
        services: [...(existing.services || [])],
      }
    }
  } else if (isNew) {
    // 读取快速拷贝数据
    const copyRaw = sessionStorage.getItem('tcm_copy_consult')
    if (copyRaw) {
      try {
        const copyData = JSON.parse(copyRaw)
        Object.assign(form.value, copyData)
        if (copyData.diff) form.value.diff = { ...emptyDiff(), ...copyData.diff }
        if (copyData.acupuncture) form.value.acupuncture = [...copyData.acupuncture]
        if (copyData.prescriptions) form.value.prescriptions = copyData.prescriptions.map(rx => ({ ...rx, items: [...(rx.items || [])] }))
        if (copyData.services) form.value.services = [...copyData.services]
        ElMessage.info(t('consultation.autofilled'))
      } catch (e) { /* ignore */ }
      sessionStorage.removeItem('tcm_copy_consult')
    }

    // Sync intake form data from latest appointment for this patient
    const patientAppts = appointmentsStore.getPatientAppointments(patientId)
    const latestAppt = patientAppts.find(a => a.intakeFormData && (
      a.intakeFormData.chiefComplaint || a.intakeFormData.allergies ||
      a.intakeFormData.currentMedications || a.intakeFormData.medicalHistory
    ))
    if (latestAppt?.intakeFormData) {
      const intake = latestAppt.intakeFormData
      if (intake.chiefComplaint) form.value.chiefComplaint = intake.chiefComplaint
      if (intake.medicalHistory) form.value.progressOfDisease = intake.medicalHistory
      if (intake.allergies || intake.currentMedications) {
        form.value.chiefComplaintDescription =
          (intake.allergies ? `过敏史: ${intake.allergies}\n` : '') +
          (intake.currentMedications ? `当前用药: ${intake.currentMedications}` : '')
      }
      // Link this consultation to the appointment so it can be auto-completed
      if (latestAppt.id && latestAppt.status !== 'completed' && latestAppt.status !== 'cancelled') {
        form.value.appointmentId = latestAppt.id
      }
    }
  }
})

// ============ 方剂搜索 ============
const formulaSearch = ref('')
const formulaSuggestions = computed(() => {
  if (!formulaSearch.value) return []
  return formulasStore.findByName(formulaSearch.value).slice(0, 6)
})

function applyFormula(formula, rxIdx) {
  const rx = form.value.prescriptions[rxIdx]
  if (!rx) return
  rx.formulaName = formula.name
  rx.items = (formula.items || []).map((h) => ({
    name: h.herbName, dosage: h.dosage, unit: h.unit || 'g',
    category: '', guijing: '', nature: '', taste: '', pricePerUnit: 0,
  }))
  form.value.formulaName = formula.name
  formulaSearch.value = ''
  ElMessage.success(t('consultation.formulaImported', { name: formula.name }))
}

// ============ 处方管理 ============
const showRxDialog = ref(false)
const editingRxIdx = ref(-1)
const rxForm = ref({
  direction: '内服 Oral intake', whereToGet: 'In-store 店内取药',
  quantity: 7, preferredUnit: 'g', formulaName: '', items: [],
  prescriptionType: 'raw_herbs',
})

function openNewRx() {
  editingRxIdx.value = -1
  rxForm.value = {
    direction: '内服 Oral intake', whereToGet: 'In-store 店内取药',
    quantity: 7, preferredUnit: 'g', formulaName: '', items: [],
    prescriptionType: 'raw_herbs',
  }
  formulaSearch.value = ''
  showRxDialog.value = true
}

function openEditRx(idx) {
  editingRxIdx.value = idx
  const rx = form.value.prescriptions[idx]
  rxForm.value = { ...rx, items: rx.items.map(i => ({ ...i })) }
  showRxDialog.value = true
}

function saveRx() {
  const rx = {
    ...rxForm.value,
    id: 'rx-' + Date.now(),
    subtotal: rxSubtotal.value,
    dispensingCompleted: false,
  }
  if (editingRxIdx.value >= 0) {
    form.value.prescriptions.splice(editingRxIdx.value, 1, rx)
  } else {
    form.value.prescriptions.push(rx)
  }
  showRxDialog.value = false
  // 同步旧字段
  if (form.value.prescriptions.length > 0) {
    const first = form.value.prescriptions[0]
    form.value.herbals = first.items.map(i => ({ name: i.name, dosage: i.dosage, unit: i.unit }))
    form.value.formulaName = first.formulaName
    form.value.prescriptionType = first.prescriptionType || 'raw_herbs'
  }
}

async function deleteRx(idx) {
  const rx = form.value.prescriptions[idx]
  // 如果处方已发药，无论取药方式都回滚库存（因为配药时已从库存扣减）
  if (rx && rx.dispensingCompleted) {
    const qty = rx.quantity || 1
    await inventoryStore.restoreFromPrescription(
      rx.items.map(i => ({ name: i.name, dosage: (i.dosage || 0) * qty })),
      rx.prescriptionType || 'raw_herbs'
    )
    ElMessage.info(t('consultation.inventoryRolledBack'))
  }
  form.value.prescriptions.splice(idx, 1)
}

function handlePrintRx(idx) {
  const practitioner = authStore.users.find(u => u.id === form.value.practitionerId)
  const clinicName = settingsStore.clinicName || '中医诊所'
  printPrescription(form.value, patient.value, practitioner, clinicName, idx)
}

function addRxItem() {
  rxForm.value.items.push({ name: '', dosage: 0, unit: 'g', category: '', guijing: '', nature: '', taste: '', pricePerUnit: 0 })
}

function removeRxItem(idx) {
  rxForm.value.items.splice(idx, 1)
}

const rxSubtotal = computed(() =>
  rxForm.value.items.reduce((s, i) => s + (i.dosage || 0) * (i.pricePerUnit || 0) * (rxForm.value.quantity || 1), 0)
)

// 在处方对话框中搜索方剂 — 集成换算引擎
function applyFormulaToDialog(formula) {
  rxForm.value.formulaName = formula.name

  const prescType = rxForm.value.prescriptionType || 'raw_herbs'
  const qty = rxForm.value.quantity || 7

  if (prescType === 'none') {
    // 仅开方不拿药：直接填充，不做换算
    rxForm.value.items = (formula.items || []).map(h => ({
      name: h.herbName, dosage: h.dosage, unit: h.unit || 'g',
      convertedQty: null, convertedUnit: '', supplierName: '', supplierId: null,
      category: '', guijing: '', nature: '', taste: '', pricePerUnit: 0,
    }))
  } else {
    // 实际拿药：执行换算
    const result = calculatePrescription(
      formula.items || [],
      qty,
      prescType,
      inventoryStore.items,
      null,
    )
    rxForm.value.items = result.items.map(r => ({
      name: r.name,
      dosage: r.originalDosage,
      unit: r.originalUnit,
      convertedQty: r.convertedQty,
      convertedUnit: r.convertedUnit,
      gramsPerPacket: r.gramsPerPacket,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      inventoryId: r.inventoryId,
      inventoryStock: r.inventoryStock,
      stockSufficient: r.stockSufficient,
      allCandidates: r.allCandidates,
      category: '', guijing: '', nature: '', taste: '',
      pricePerUnit: r.pricePerUnit,
    }))
  }
  formulaSearch.value = ''
  ElMessage.success(t('consultation.formulaImported', { name: formula.name }))
}

// 切换处方类型或剂数后重新换算
function recalcRxItems() {
  const prescType = rxForm.value.prescriptionType || 'raw_herbs'
  const qty = rxForm.value.quantity || 7
  if (prescType === 'none' || rxForm.value.items.length === 0) return

  const formulaItems = rxForm.value.items.map(i => ({
    herbName: i.name,
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
      item.gramsPerPacket = r.gramsPerPacket
      item.supplierId = r.supplierId
      item.supplierName = r.supplierName
      item.inventoryId = r.inventoryId
      item.inventoryStock = r.inventoryStock
      item.stockSufficient = r.stockSufficient
      item.allCandidates = r.allCandidates
      item.pricePerUnit = r.pricePerUnit
    }
  })
}

// 切换单味药供应商后重算
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

// ============ 针灸穴位 ============
function addAcu() { form.value.acupuncture.push({ point: '', side: 'bilateral', notes: '' }) }
function removeAcu(i) { form.value.acupuncture.splice(i, 1) }

// ============ 服务项目 ============
function addService() { form.value.services.push({ name: '', price: 0, quantity: 1, manualDiscount: 0, taxable: true }) }
function removeService(i) { form.value.services.splice(i, 1) }

// ============ 价格计算（按项目计税）============
function getServiceExtended(sv) {
  return (sv.price || 0) * (sv.quantity || 1) - (sv.manualDiscount || 0)
}
function getServiceTax(sv) {
  return sv.taxable ? getServiceExtended(sv) * settingsStore.taxRate : 0
}
const totalService = computed(() =>
  form.value.services.reduce((s, sv) => s + getServiceExtended(sv), 0),
)
const totalServiceTax = computed(() =>
  form.value.services.reduce((s, sv) => s + getServiceTax(sv), 0),
)
const totalWithoutTax = computed(() => {
  let base = (form.value.consultationFee || 0) + totalService.value
  // 处方金额
  if (form.value.includeRxAmount) {
    base += form.value.prescriptions.reduce((s, rx) => s + (rx.subtotal || 0), 0)
  }
  if (form.value.discountType === 'percentage') base *= (1 - (form.value.discountValue || 0) / 100)
  else if (form.value.discountType === 'amount') base -= (form.value.discountValue || 0)
  return Math.max(0, base)
})
// 折扣系数：税额也需要按折扣后金额计算（加拿大GST/HST要求）
const discountFactor = computed(() => {
  const rawBase = (form.value.consultationFee || 0) + totalService.value
    + (form.value.includeRxAmount ? form.value.prescriptions.reduce((s, rx) => s + (rx.subtotal || 0), 0) : 0)
  if (rawBase <= 0) return 1
  if (form.value.discountType === 'percentage') return Math.max(0, 1 - (form.value.discountValue || 0) / 100)
  if (form.value.discountType === 'amount') return Math.max(0, (rawBase - (form.value.discountValue || 0)) / rawBase)
  return 1
})
const consultationFeeTax = computed(() => form.value.consultationFeeTaxable !== false ? (form.value.consultationFee || 0) * settingsStore.taxRate : 0)
const taxAmount = computed(() => (totalServiceTax.value + consultationFeeTax.value) * discountFactor.value)
const totalAmount = computed(() => totalWithoutTax.value + taxAmount.value)

// ============ 保存与操作 ============
async function saveDraft() {
  saving.value = true
  try {
    const data = {
      ...form.value,
      summary: form.value.chiefComplaintDescription || form.value.summary,
      totalWithoutTax: totalWithoutTax.value,
      taxAmount: taxAmount.value,
      totalAmount: totalAmount.value,
      branchId: form.value.branchId || branchesStore.currentBranchId || null,
    }
    if (isNew && !consultation.value?.id) {
      const created = await consultStore.createConsultation(data)
      router.replace(`/patients/${patientId}/consultations/${created.id}`)
      consultation.value = created
      ElMessage.success(t('consultation.draftSaved'))
    } else {
      await consultStore.updateConsultation(consultId || consultation.value?.id, data)
      ElMessage.success(t('consultation.saved'))
    }
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function completeConsultation() {
  if (!form.value.chiefComplaint) return ElMessage.warning(t('consultation.fillChiefComplaint'))
  try {
    await saveDraft()
    const id = consultId || consultation.value?.id
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
      // 后台生成PDF报告（不阻塞跳转）
      consultationsApi.generateReport(id).catch(() => {})
      router.push(`/patients/${patientId}`)
    }
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function markPaid() {
  try {
    await ElMessageBox.confirm(t('consultation.confirmPayLock'), t('consultation.confirmPayTitle'), { type: 'warning' })
    const id = consultId || consultation.value?.id
    if (id) {
      await consultStore.markAsPaid(id, { paymentMethod: 'manual' })
      ElMessage.success(t('consultation.paidAndLocked'))
      router.push(`/patients/${patientId}`)
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
      if (ok) { ElMessage.success(t('consultation.deleted')); router.push(`/patients/${patientId}`) }
      else ElMessage.error(t('consultation.cannotDeletePaid'))
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message)
  }
}


async function handleExportPdf() {
  await handleGeneratePdf()
}
const CURRENCY_SYMBOLS = { CAD: '$', USD: '$', CNY: '¥' }
const cs = computed(() => CURRENCY_SYMBOLS[form.value.currency] || '¥')

const SIDE_OPTIONS = [
  { label: '双侧 Bilateral', value: 'bilateral' },
  { label: '左 Left', value: 'left' },
  { label: '右 Right', value: 'right' },
]

// ============ 舌象图片上传 ============
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
    form.value.diff.tongueImage = res.filePath || res.url || res.fileName
    ElMessage.success(t('consultation.tongueImageUploaded'))
  }).catch((e) => {
    ElMessage.error(e.message || t('consultation.uploadFailed'))
  })
  return false
}

function removeTongueImage() {
  form.value.diff.tongueImage = null
}

// ============ 文档上传 ============
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
      url: res.filePath || res.url || res.fileName,
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
  const src = doc.url || doc.data
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

// ============ PDF 导出 ============
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

// ============ 邮件发送 ============
function handleSendReport() {
  const emailContent = buildConsultationReportEmail(patient.value, form.value, settingsStore.clinicName)
  openEmailPreview(emailContent)
}
</script>

<template>
  <div v-if="patient" class="cv-wrap">
    <!-- ── 顶部操作栏 ── -->
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
          <el-tag v-if="form.lockedAt" size="small" type="danger" style="margin-left:4px">🔒 {{ t('consultation.locked') }}</el-tag>
          <el-tag v-if="form.version > 1" size="small" type="warning" style="margin-left:4px">v{{ form.version }}</el-tag>
        </div>
      </div>
      <div class="cv-header-right">
        <el-button size="small" @click="showCompare = true">{{ t('consultation.compareHistory') }}</el-button>
        <template v-if="!isReadOnly">
        <el-button size="small" :loading="saving" @click="saveDraft">{{ t('common.save') }}</el-button>
        <el-button v-if="form.status === 'draft' || isNew" size="small" type="success" @click="completeConsultation">{{ t('consultation.complete') }}</el-button>
        <el-button v-if="form.status === 'completed'" size="small" type="primary" @click="markPaid">{{ t('consultation.payAndLock') }}</el-button>
        <el-button v-if="!form.lockedAt" size="small" type="danger" text @click="deleteConsultation">{{ t('common.delete') }}</el-button>
        </template>
      </div>
    </div>

    <!-- ── 上次预后提示 ── -->
    <el-alert
      v-if="isNew && lastConsultation?.prognosis"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom:12px"
    >
      <strong>📋 {{ t('consultation.lastPrognosis', { date: formatDate(lastConsultation.date) }) }}：</strong>
      {{ lastConsultation.prognosis }}
    </el-alert>

    <el-tabs v-model="activeTab" class="cv-tabs">

      <!-- ═══════════════════════════════════
           Tab 1: Summary (简介)  ← image3
      ═══════════════════════════════════ -->
      <el-tab-pane :label="t('consultation.tabSummary')" name="summary">
        <el-row :gutter="16">
          <!-- 左列：主诉信息 -->
          <el-col :span="14">
            <el-card class="section-card">
              <template #header><span class="sec-header">CHIEF COMPLAINT 主诉信息</span></template>
              <el-form label-width="200px" label-position="left" size="small">
                <el-form-item label="Consultation ID(诊疗编号)">
                  <el-input :value="form.consultationId || t('consultation.generatedAfterSave')" readonly class="readonly-field" />
                </el-form-item>
                <el-form-item label="Date of Consultation(诊疗日期) *">
                  <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" :disabled="isReadOnly" style="width:200px" />
                </el-form-item>
                <el-form-item label="Chief Complaint(主诉) *">
                  <el-select
                    v-model="form.chiefComplaint"
                    filterable allow-create clearable
                    :placeholder="t('consultation.selectOrInputComplaint')"
                    style="width:100%"
                    :disabled="isReadOnly"
                  >
                    <el-option v-for="c in CHIEF_COMPLAINTS" :key="c" :label="c" :value="c" />
                  </el-select>
                </el-form-item>
                <el-form-item label="Chief Complaint Duration(持续时间)">
                  <el-select v-model="form.chiefComplaintDuration" :placeholder="t('consultation.selectDuration')" style="width:100%" :disabled="isReadOnly">
                    <el-option v-for="d in TCM_OPTIONS.chiefComplaintDuration" :key="d" :label="d" :value="d" />
                  </el-select>
                </el-form-item>
                <el-form-item label="Chief Complaint Description(主诉详情)">
                  <el-input v-model="form.chiefComplaintDescription" type="textarea" :rows="4"
                    :placeholder="t('consultation.descPlaceholder')" :readonly="isReadOnly" />
                </el-form-item>
                <el-form-item label="Progress of the Disease(发展进程)">
                  <el-input v-model="form.progressOfDisease" type="textarea" :rows="3"
                    :placeholder="t('consultation.progressPlaceholder')" :readonly="isReadOnly" />
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>

          <!-- 右列：上次反馈 + 评分 -->
          <el-col :span="10">
            <el-card class="section-card">
              <template #header>
                <span class="sec-header">
                  上次治疗反馈 Feedback for Last Treatment
                  <el-icon style="margin-left:4px; color:#999"><Lock /></el-icon>
                </span>
              </template>
              <el-form label-position="top" size="small">
                <el-form-item label="++ Prognosis for Last Treatment(上次治疗预期判断)">
                  <el-input
                    :value="lastConsultation?.prognosis || consultation?.previousPrognosisReview || ''"
                    type="textarea" :rows="4" readonly class="readonly-field"
                    :placeholder="t('consultation.lastPrognosisPlaceholder')"
                  />
                </el-form-item>
                <el-form-item label="Rate for Last Treatment(上次治疗评分)">
                  <el-rate v-model="form.rateForLast" :disabled="isReadOnly" allow-half />
                </el-form-item>
                <el-form-item label="++ Basic Condition(基础情况)">
                  <el-input v-model="form.previousPrognosisReview" type="textarea" :rows="3"
                    :placeholder="t('consultation.reviewPlaceholder')" :readonly="isReadOnly" />
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- ═══════════════════════════════════
           Tab 2: Differentiation(诊断)  ← images 4-9
      ═══════════════════════════════════ -->
      <el-tab-pane :label="t('consultation.tabDifferentiation')" name="differentiation">
        <div class="diff-sections">

          <!-- Section: Exterior & Head (image4) -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">Exterior &amp; Head（表 &amp; 头部）</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="180px" label-position="left" size="small">
                  <el-form-item label="Cold/Heat(寒热)">
                    <el-select v-model="form.diff.coldHeat" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.coldHeat" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="++ Sweat(汗出)">
                    <el-select v-model="form.diff.sweat" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.sweat" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Head Discomfort(头)">
                    <el-input v-model="form.diff.headDiscomfort" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                  <el-form-item label="-- Eye(眼)">
                    <el-input v-model="form.diff.eye" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                  <el-form-item label="-- Ear(耳)">
                    <el-input v-model="form.diff.ear" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                  <el-form-item label="-- Nose(鼻)">
                    <el-input v-model="form.diff.nose" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                  <el-form-item label="-- Mouth(口)">
                    <el-input v-model="form.diff.mouth" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                  <el-form-item label="-- Taste(味道)">
                    <el-select v-model="form.diff.taste" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.taste" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="++ Body Discomforts(身)">
                    <el-input v-model="form.diff.bodyDiscomforts" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                  <el-form-item label="Skin Issues(皮肤)">
                    <el-input v-model="form.diff.skinIssues" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <div class="diff-right-label">Other Exterior Symptom(其它表证)</div>
                <el-input v-model="form.diff.otherExterior" type="textarea" :rows="12" :readonly="isReadOnly" placeholder="---" />
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Chest (image5) -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">Chest（心胸）</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="180px" label-position="left" size="small">
                  <el-form-item label="Chest(胸部)">
                    <el-select v-model="form.diff.chest" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.chest" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Heart(心脏)">
                    <el-select v-model="form.diff.heart" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.heart" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="++ Hypochondriac(两胁)">
                    <el-select v-model="form.diff.hypochondriac" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.hypochondriac" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Sleep(睡眠)">
                    <el-select v-model="form.diff.sleep" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.sleep" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="++ Anxiety/Stress(心烦/压力)">
                    <el-input v-model="form.diff.anxietyStress" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <div class="diff-right-label">Other Chest Syndrome(其它心胸症状)</div>
                <el-input v-model="form.diff.otherChest" type="textarea" :rows="8" :readonly="isReadOnly" placeholder="---" />
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Abdomen (image6) -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">Abdomen（腹部）</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="180px" label-position="left" size="small">
                  <el-form-item label="Appetite(胃口)">
                    <el-select v-model="form.diff.appetite" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.appetite" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Thirst(口渴)">
                    <el-select v-model="form.diff.thirst" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.thirst" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Abdomen(腹部)">
                    <el-select v-model="form.diff.abdomen" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.abdomen" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <div class="diff-right-label">Other Abdominal Symptoms(其它腹部症状)</div>
                <el-input v-model="form.diff.otherAbdomen" type="textarea" :rows="6" :readonly="isReadOnly" placeholder="---" />
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Lower Abdomen (image6) -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">Lower Abdomen（下腹）</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="180px" label-position="left" size="small">
                  <el-form-item label="Bowl Movement(大便)">
                    <el-select v-model="form.diff.bowelMovement" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.bowelMovement" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Urine(小便)">
                    <el-select v-model="form.diff.urine" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.urine" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <div class="diff-right-label">Other Lower Abdomen Symptoms(其它下腹症状)</div>
                <el-input v-model="form.diff.otherLowerAbdomen" type="textarea" :rows="5" :readonly="isReadOnly" placeholder="---" />
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Female (image7) -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">Female（妇科）</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="200px" label-position="left" size="small">
                  <el-form-item label="Period Circle(经期期长)(days)">
                    <el-input v-model="form.diff.periodCircle" :readonly="isReadOnly" placeholder="---" style="width:100px" />
                  </el-form-item>
                  <el-form-item label="Period Duration(每期持续)(days)">
                    <el-input v-model="form.diff.periodDuration" :readonly="isReadOnly" placeholder="---" style="width:100px" />
                  </el-form-item>
                  <el-form-item label="Blood Quality &amp; Quantity(经血情况)">
                    <el-input v-model="form.diff.bloodQuality" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                  <el-form-item label="PMS(经期相关症状)">
                    <el-input v-model="form.diff.pms" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <div class="diff-right-label">Other Female Symptoms(其它妇科症状)</div>
                <el-input v-model="form.diff.otherFemale" type="textarea" :rows="6" :readonly="isReadOnly" placeholder="---" />
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Palpitation/触诊 (image7) -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">Palpitation（触诊）</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="200px" label-position="left" size="small">
                  <el-form-item label="Pathological Channel(病变经络)">
                    <el-input v-model="form.diff.pathologicalChannel" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                  <el-form-item label="Pathological Changes(病变详情)">
                    <el-input v-model="form.diff.pathologicalChanges" type="textarea" :rows="4" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <el-form label-width="200px" label-position="left" size="small">
                  <el-form-item label="Pulse(脉搏)">
                    <el-select v-model="form.diff.pulse" filterable clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.pulse" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Detailed Pulse(脉搏补充信息)">
                    <el-input v-model="form.diff.detailedPulse" type="textarea" :rows="4" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                </el-form>
              </el-col>
            </el-row>
          </el-card>

          <!-- Section: Tongue (image8) -->
          <el-card class="diff-card">
            <template #header><span class="diff-header">Tongue（舌像）</span></template>
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form label-width="200px" label-position="left" size="small">
                  <el-form-item label="Tongue Color(舌色)">
                    <el-select v-model="form.diff.tongueColor" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.tongueColor" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Tongue Body/Shape(舌体/形)">
                    <el-select v-model="form.diff.tongueBody" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.tongueBody" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Tongue Coating(舌苔)">
                    <el-select v-model="form.diff.tongueCoating" clearable :disabled="isReadOnly" style="width:100%">
                      <el-option v-for="o in TCM_OPTIONS.tongueCoating" :key="o" :label="o" :value="o" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Other Tongue Details(其它舌头信息)">
                    <el-input v-model="form.diff.otherTongue" type="textarea" :rows="3" :readonly="isReadOnly" placeholder="---" />
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="12">
                <div class="diff-right-label">Tongue Image(舌头照片)</div>
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
                <span class="diff-header">Differentiation Conclusion（辨证结论）</span>
                <el-button v-if="!isReadOnly" size="small" @click="form.diff.conclusions.push({ name: '', treatment: '' })">
                  <el-icon><Plus /></el-icon> Add Existing Differentiation
                </el-button>
              </div>
            </template>
            <el-table :data="form.diff.conclusions" size="small" empty-text="We didn't find anything to show here">
              <el-table-column label="Differentiation Name" min-width="180">
                <template #default="{ row }">
                  <el-input v-if="!isReadOnly" v-model="row.name" :placeholder="t('consultation.diffName')" size="small" />
                  <span v-else>{{ row.name }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Treatment" min-width="180">
                <template #default="{ row }">
                  <el-input v-if="!isReadOnly" v-model="row.treatment" :placeholder="t('consultation.treatmentMethod')" size="small" />
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

      <!-- ═══════════════════════════════════
           Tab 3: Treatments(治疗)  ← images 10-11
      ═══════════════════════════════════ -->
      <el-tab-pane :label="t('consultation.tabTreatment')" name="treatments">

        <!-- Acupuncture Points sub-section -->
        <el-card class="section-card" style="margin-bottom:12px">
          <template #header>
            <div class="diff-card-header">
              <span class="sec-header">Acu Points（针灸）</span>
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
            <el-table-column label="Side(侧)" width="200">
              <template #default="{ row }">
                <el-radio-group v-if="!isReadOnly" v-model="row.side" size="small">
                  <el-radio-button v-for="s in SIDE_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</el-radio-button>
                </el-radio-group>
                <span v-else>{{ row.side }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Notes(备注)" min-width="160">
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
              <span class="sec-header">Prescriptions（中药）</span>
              <el-button v-if="!isReadOnly" size="small" type="primary" @click="openNewRx">
                <el-icon><Plus /></el-icon> New Prescription
              </el-button>
            </div>
          </template>
          <el-table :data="form.prescriptions" size="small" empty-text="We didn't find anything to show here">
            <el-table-column label="Name" min-width="200">
              <template #default="{ row }">
                <span class="rx-name-cell">{{ row.formulaName || t('common.customFormula') }} · {{ row.items?.length || 0 }}{{ t('consultation.herbCount') }}</span>
                <el-tag v-if="row.prescriptionType && row.prescriptionType !== 'none'" size="small" :type="row.prescriptionType === 'powder' ? 'warning' : row.prescriptionType === 'pills' ? '' : 'success'" style="margin-left:4px">
                  {{ { powder: '粉剂', raw_herbs: '草药', pills: '成药' }[row.prescriptionType] || row.prescriptionType }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Direction(用法)" width="140">
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
                <el-tag :type="row.dispensingCompleted ? 'success' : 'warning'" size="small">
                  {{ row.dispensingCompleted ? t('consultation.dispensed') : t('consultation.pendingDispense') }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="!isReadOnly" width="160">
              <template #default="{ row, $index }">
                <el-button size="small" text type="success" @click="handlePrintRx($index)"><el-icon><Printer /></el-icon> 打印</el-button>
                <el-button size="small" text type="primary" @click="openEditRx($index)">{{ t('common.edit') }}</el-button>
                <el-button size="small" text type="danger" @click="deleteRx($index)">{{ t('common.delete') }}</el-button>
              </template>
            </el-table-column>
            <el-table-column v-else width="80">
              <template #default="{ row, $index }">
                <el-button size="small" text type="success" @click="handlePrintRx($index)"><el-icon><Printer /></el-icon> 打印</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="table-rows-count">Rows: {{ form.prescriptions.length }}</div>
        </el-card>

        <!-- Prognosis & Feedback (image11) -->
        <el-card class="section-card">
          <template #header><span class="sec-header">Prognosis &amp; Feedback（预候 &amp; 反馈）</span></template>
          <el-row :gutter="16">
            <el-col :span="12">
              <div class="prog-label">++ Prognosis for Current Treatment（本次治疗预候）</div>
              <el-input v-model="form.prognosis" type="textarea" :rows="10"
                :placeholder="t('consultation.prognosisPlaceholder')" :readonly="isReadOnly" />
            </el-col>
            <el-col :span="12">
              <div class="prog-label">
                Feedback for Current Treatment（本次治疗反馈）
                <el-icon v-if="form.lockedAt" style="margin-left:4px"><Lock /></el-icon>
              </div>
              <el-input v-model="form.feedback" type="textarea" :rows="10"
                :placeholder="t('consultation.feedbackPlaceholder')"
                :readonly="isReadOnly || !form.lockedAt" />
            </el-col>
          </el-row>
        </el-card>
      </el-tab-pane>

      <!-- ═══════════════════════════════════
           Tab 4: Pricing(收费)  ← images 12-13, 16
      ═══════════════════════════════════ -->
      <el-tab-pane :label="t('consultation.tabPricing')" name="pricing">

        <!-- Service Price List -->
        <el-card class="section-card" style="margin-bottom:12px">
          <el-form label-width="200px" label-position="left" size="small">
            <el-form-item label="Service Price List(服务报价单) *">
              <el-input v-model="form.servicePriceList" :readonly="isReadOnly" placeholder="如: 2024-02" style="width:200px" />
            </el-form-item>
          </el-form>

          <!-- Services sub-table -->
          <div class="subsection-header">
            <span class="subsec-label">Services（服务）</span>
            <el-button v-if="!isReadOnly" size="small" @click="addService">
              <el-icon><Plus /></el-icon> New ServiceConsultation
            </el-button>
          </div>
          <el-table :data="form.services" size="small" :empty-text="t('consultation.noServices')">
            <el-table-column label="Service(服务)" min-width="200">
              <template #default="{ row }">
                <el-input v-if="!isReadOnly" v-model="row.name" size="small" :placeholder="t('consultation.serviceNamePlaceholder')" />
                <span v-else>{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Unit" width="80">
              <template #default>time</template>
            </el-table-column>
            <el-table-column label="Price Per(单价)" width="120">
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
            <el-table-column label="Extended(小计)" width="100" align="right">
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
            <el-table-column label="Tax(税额)" width="90" align="right">
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
                <el-form-item label="Currency(货币)">
                  <el-select v-model="form.currency" style="width:160px" :disabled="isReadOnly">
                    <el-option label="Canadian Dollar CAD" value="CAD" />
                    <el-option label="US Dollar USD" value="USD" />
                    <el-option label="人民币 CNY" value="CNY" />
                  </el-select>
                </el-form-item>
                <el-form-item label="Discount Type(折扣类型) *">
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
                <el-form-item label="Consultation Fee Taxable">
                  <el-switch v-model="form.consultationFeeTaxable" :disabled="isReadOnly" active-text="Yes" inactive-text="No" />
                </el-form-item>
                <el-form-item label="Include Prescription Amount?">
                  <el-switch v-model="form.includeRxAmount" :disabled="isReadOnly" active-text="Yes" inactive-text="No" />
                </el-form-item>
                <el-form-item label="Add 3rd Party(第三方)">
                  <el-switch v-model="form.add3rdParty" :disabled="isReadOnly" active-text="Yes" inactive-text="No" />
                </el-form-item>
              </el-form>
            </el-col>
            <el-col :span="12">
              <div class="price-summary">
                <div class="price-row">
                  <span>(+) Consultation Fee(诊疗费)</span>
                  <div class="price-val">
                    <el-input-number v-if="!isReadOnly" v-model="form.consultationFee" :min="0" size="small" style="width:110px" />
                    <span v-else>{{ cs }}{{ form.consultationFee.toFixed(2) }}</span>
                  </div>
                </div>
                <div class="price-row">
                  <span>(+) Total Service(服务总计)</span>
                  <span class="price-lock">{{ cs }}{{ totalService.toFixed(2) }} <el-icon><Lock /></el-icon></span>
                </div>
                <div class="price-row" v-if="form.includeRxAmount && form.prescriptions.length">
                  <span>(+) Prescription Amount(处方金额)</span>
                  <span class="price-lock">{{ cs }}{{ form.prescriptions.reduce((s, rx) => s + (rx.subtotal || 0) * (rx.quantity || 1), 0).toFixed(2) }} <el-icon><Lock /></el-icon></span>
                </div>
                <div class="price-row" v-if="form.discountType !== 'none'">
                  <span>Discount(折扣)</span>
                  <span style="color:#e63946">-{{ cs }}{{ form.discountType === 'percentage' ? ((form.consultationFee + totalService) * form.discountValue / 100).toFixed(2) : form.discountValue.toFixed(2) }}</span>
                </div>
                <div class="price-row total-before-tax">
                  <span>Total without Tax(税前总计)</span>
                  <span class="price-lock">{{ cs }}{{ totalWithoutTax.toFixed(2) }} <el-icon><Lock /></el-icon></span>
                </div>
                <div class="price-row tax-row">
                  <span>Tax {{ (settingsStore.taxRate * 100).toFixed(0) }}% — {{ t('consultation.perItemTax') }}</span>
                  <span>{{ cs }}{{ taxAmount.toFixed(2) }}</span>
                </div>
                <div class="price-row grand-total">
                  <span>Grand Total(合计)</span>
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

      <!-- ═══════════════════════════════════
           Tab 5: Invoices(发票)  ← images 13-17
      ═══════════════════════════════════ -->
      <el-tab-pane :label="t('consultation.tabInvoice')" name="invoices">
        <el-card class="section-card" style="margin-bottom:12px">
          <!-- PDF操作 -->
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
              <span class="sec-header">Invoice PDF Preview（发票预览）</span>
              <el-button size="small" @click="handleExportPdf">{{ t('consultation.exportPdf') }}</el-button>
            </div>
          </template>
          <div class="pdf-mock">
            <div class="pdf-header">
              <div class="pdf-logo">🌿 OTCM CLINIC</div>
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
              &nbsp;·&nbsp; {{ patient.emails?.[0] }}
              &nbsp;·&nbsp; {{ patient.mobilePhone || patient.phone }}
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
              <div>TAX ({{ (settingsStore.taxRate*100).toFixed(0) }}%): {{ cs }}{{ taxAmount.toFixed(2) }}</div>
              <div>GRAND TOTAL: <strong>{{ cs }}{{ totalAmount.toFixed(2) }}</strong></div>
              <div>BALANCE AMOUNT: <strong>{{ cs }}0</strong></div>
            </div>
            <div class="pdf-footer">THANK YOU FOR YOUR BUSINESS!</div>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- ═══════════════════════════════════
           Tab 6: History(修改历史)
      ═══════════════════════════════════ -->
      <el-tab-pane :label="t('consultation.tabHistory')" name="history">
        <el-card class="section-card" style="margin-bottom:12px">
          <template #header><span class="sec-header">VERSION &amp; MODIFICATION HISTORY（版本修改记录）</span></template>
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

      <!-- ═══════════════════════════════════
           Tab 7: Documents
      ═══════════════════════════════════ -->
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

    <!-- ═══════════════════════════════════
         处方管理抽屉（Phase 1/5 改为 el-drawer）
    ═══════════════════════════════════ -->
    <el-drawer v-model="showRxDialog" title="New Prescription（新建处方）" size="860px" direction="rtl" :close-on-press-escape="true" :destroy-on-close="false">
      <div class="rx-dialog-body">
        <el-form :model="rxForm" label-width="160px" size="small" style="margin-bottom:12px">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="Direction(用法) *">
                <el-select v-model="rxForm.direction" style="width:100%">
                  <el-option v-for="o in TCM_OPTIONS.direction" :key="o" :label="o" :value="o" />
                </el-select>
              </el-form-item>
              <el-form-item label="Where To Get(取药) *">
                <el-select v-model="rxForm.whereToGet" style="width:100%">
                  <el-option v-for="o in TCM_OPTIONS.whereToGet" :key="o" :label="o" :value="o" />
                </el-select>
              </el-form-item>
              <el-form-item label="Quantity(剂数) *">
                <el-input-number v-model="rxForm.quantity" :min="1" @change="recalcRxItems" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="Preferred Unit *">
                <el-select v-model="rxForm.preferredUnit" style="width:100%">
                  <el-option label="bag 包" value="bag 包" />
                  <el-option label="g（克）" value="g" />
                </el-select>
              </el-form-item>
              <el-form-item label="Rx Type(处方类型)">
                <el-radio-group v-model="rxForm.prescriptionType" size="small" @change="recalcRxItems">
                  <el-radio-button value="raw_herbs">草药 Raw</el-radio-button>
                  <el-radio-button value="powder">粉剂 Powder</el-radio-button>
                  <el-radio-button value="pills">成药 Pills</el-radio-button>
                  <el-radio-button value="none">仅处方 Rx Only</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <!-- 方剂搜索 (image26) -->
              <el-form-item label="Formula(方剂)">
                <div style="position:relative; width:100%">
                  <el-input v-model="formulaSearch" :placeholder="t('consultation.formulaSearchPlaceholder')" clearable />
                  <div v-if="formulaSuggestions.length" class="formula-suggestions-dialog">
                    <div v-for="f in formulaSuggestions" :key="f.name" class="formula-item" @click="applyFormulaToDialog(f)">
                      <strong>{{ f.name }}</strong>
                      <span class="fherbs">{{ (f.items || []).map(h => h.herbName).join(' · ') }}</span>
                    </div>
                  </div>
                </div>
              </el-form-item>
              <el-form-item label="Formula Name(方名)" v-if="rxForm.formulaName">
                <el-tag type="success">{{ rxForm.formulaName }}</el-tag>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>

        <!-- Prescription Items (image27) -->
        <div class="subsection-header">
          <span class="subsec-label">Prescription Items（药材明细）</span>
          <div>
            <el-button size="small" @click="addRxItem"><el-icon><Plus /></el-icon> {{ t('consultation.addHerb') }}</el-button>
          </div>
        </div>
        <el-table :data="rxForm.items" size="small" max-height="360" style="margin-bottom:8px">
          <el-table-column label="药材 Herb" min-width="110">
            <template #default="{ row }">
              <el-input v-model="row.name" size="small" :placeholder="t('consultation.herbNamePlaceholder')" />
            </template>
          </el-table-column>
          <el-table-column label="原方(g)" width="80">
            <template #default="{ row }">
              <el-input-number v-model="row.dosage" :min="0" :step="1" size="small" style="width:70px" />
            </template>
          </el-table-column>
          <el-table-column label="换算量" width="100" v-if="rxForm.prescriptionType !== 'none'">
            <template #default="{ row }">
              <span v-if="row.convertedQty != null" :style="{ color: row.stockSufficient === false ? '#e63946' : '#2d6a4f', fontWeight: 600 }">
                {{ row.convertedQty }}{{ row.convertedUnit }}
              </span>
              <span v-else style="color:#aaa">-</span>
            </template>
          </el-table-column>
          <el-table-column label="供应商" width="110" v-if="rxForm.prescriptionType !== 'none'">
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
                  :label="(c.supplier || '默认') + ' (' + c.quantity + (c.category === 'powder' ? '包' : c.unit || 'g') + ')'"
                  :value="c.id"
                />
              </el-select>
              <span v-else-if="row.supplierName" style="font-size:12px; color:#888">{{ row.supplierName }}</span>
              <span v-else style="color:#ccc; font-size:12px">-</span>
            </template>
          </el-table-column>
          <el-table-column label="库存" width="70" v-if="rxForm.prescriptionType !== 'none'">
            <template #default="{ row }">
              <el-tag v-if="row.inventoryId" :type="row.stockSufficient ? 'success' : 'danger'" size="small">
                {{ row.inventoryStock }}{{ row.convertedUnit }}
              </el-tag>
              <el-tag v-else type="info" size="small">无</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="单价" width="90">
            <template #default="{ row }">
              <el-input-number v-model="row.pricePerUnit" :min="0" :step="0.01" :precision="2" size="small" style="width:80px" />
            </template>
          </el-table-column>
          <el-table-column width="45">
            <template #default="{ $index }">
              <el-button type="danger" text size="small" :icon="'Delete'" @click="removeRxItem($index)" />
            </template>
          </el-table-column>
        </el-table>
        <div style="text-align:right; font-size:13px; color:#555; padding:8px">
          Single Prescription Amount(单次金额):
          <strong style="color:#2d6a4f; font-size:15px">{{ cs }}{{ rxSubtotal.toFixed(2) }}</strong>
          <el-icon style="margin-left:4px"><Lock /></el-icon>
          &nbsp;·&nbsp; Qty × {{ rxForm.quantity }} &nbsp;=&nbsp;
          <strong style="color:#1b4332">{{ cs }}{{ (rxSubtotal * (rxForm.quantity||1)).toFixed(2) }}</strong>
        </div>
      </div>
      <template #footer>
        <el-button @click="showRxDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveRx">{{ t('consultation.saveRx') }}</el-button>
      </template>
    </el-drawer>

    <!-- 邮件预览抽屉 -->
    <el-drawer v-model="showEmailDialog" :title="t('email.preview')" size="520px" direction="rtl">
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

    <!-- 诊疗对比面板 -->
    <ConsultationComparePanel
      v-model:visible="showCompare"
      :patient-id="patientId"
      :current-form="form"
      @copy-section="onCopySection"
    />
  </div>

  <div v-else class="not-found">
    <el-empty :description="t('patientDetail.notFound')" />
    <el-button @click="$router.push('/patients')">{{ t('common.back') }}</el-button>
  </div>
</template>

<style scoped>
.cv-wrap { max-width: 1100px; }
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
</style>
