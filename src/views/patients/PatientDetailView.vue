<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePatientsStore } from '../../stores/patients'
import { useConsultationsStore } from '../../stores/consultations'
import { useAuthStore } from '../../stores/auth'
import { useAppointmentsStore } from '../../stores/appointments'
import { hasPermission, canAccessPatientRecords, filterAccessibleConsultations } from '../../utils/permissions'
import { formatDate, formatDateTime } from '../../utils/dateUtils'
import { filesApi, patientsApi } from '../../utils/api'
import { useSettingsStore } from '../../stores/settings'
import { buildCopiedTreatmentData, sanitizeCopiedConsultationData } from '../../utils/consultationCopy'
import { getPaymentStatus } from '../../utils/prescriptionWorkflow'
import {
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  getCountryLabel,
  getProvinceLabel,
  getProvinceOptions,
  normalizeCountryCode,
  normalizeProvinceCode,
} from '../../utils/countryRegionOptions'
import {
  canSelectNewerHistory,
  canSelectOlderHistory,
  getHistoryDisplayOrder,
  getNewerHistoryIndex,
  getOlderHistoryIndex,
} from '../../utils/historyCompareNavigation'
import { GENDER_OPTIONS, formatGender, getGenderTagType, normalizeGender } from '../../utils/gender'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const patientsStore = usePatientsStore()
const consultationsStore = useConsultationsStore()
const authStore = useAuthStore()
const appointmentsStore = useAppointmentsStore()
const settingsStore = useSettingsStore()

const roles = computed(() => authStore.roles)
const canEdit = computed(() => hasPermission(roles.value, 'patient.edit'))
const canCreate = computed(() => hasPermission(roles.value, 'consultation.create'))
const canDelete = computed(() => hasPermission(roles.value, 'patient.delete'))
const isApprenticeReadonly = computed(() => roles.value.includes('apprentice'))
const isAdmin = computed(() => roles.value.includes('admin'))
const hidePatientContact = computed(() =>
  !isAdmin.value && (roles.value.includes('practitioner') || roles.value.includes('apprentice')),
)

const patientId = route.params.id
const patient = computed(() => patientsStore.getPatient(patientId))
const PUBLIC_LINK_STORAGE_PREFIX = 'patient_public_links_'
const CONFIGURED_PUBLIC_BASE_URL = (import.meta.env.VITE_PUBLIC_APP_BASE_URL || '').trim()

function getPublicBaseUrl() {
  const baseUrl = CONFIGURED_PUBLIC_BASE_URL || window.location.origin
  return `${baseUrl.replace(/\/+$/, '')}/`
}

function loadStoredPublicLinks() {
  try {
    const raw = localStorage.getItem(`${PUBLIC_LINK_STORAGE_PREFIX}${patientId}`)
    if (!raw) return { consent: '', intake: '' }
    const parsed = JSON.parse(raw)
    return {
      consent: parsed?.consent || '',
      intake: parsed?.intake || '',
    }
  } catch {
    return { consent: '', intake: '' }
  }
}

function persistPublicLinks(links) {
  try {
    localStorage.setItem(`${PUBLIC_LINK_STORAGE_PREFIX}${patientId}`, JSON.stringify({
      consent: links?.consent || '',
      intake: links?.intake || '',
    }))
  } catch {
    // ignore storage errors
  }
}

function clearStoredConsentLink() {
  publicLinks.value.consent = ''
  persistPublicLinks(publicLinks.value)
}

const consultations = computed(() =>
  filterAccessibleConsultations(
    roles.value,
    consultationsStore.getPatientConsultations(patientId),
    {
      currentUser: authStore.currentUser,
      userId: authStore.userId,
      patient: patient.value,
      appointments: appointmentsStore.getPatientAppointments(patientId),
    },
  ),
)
const practitioners = computed(() => authStore.getPractitioners())
function getPractitionerName(id) {
  return practitioners.value.find(p => String(p.id) === String(id))?.name || '-'
}
const publicLinks = ref(loadStoredPublicLinks())
const patientAppointments = computed(() => appointmentsStore.getPatientAppointments(patientId))
const latestManageAppointment = computed(() => {
  const activeAppointments = patientAppointments.value.filter(item => item?.manageToken)
  return activeAppointments[0] || null
})
const consentPublicLink = computed(() => publicLinks.value.consent || '')
const intakePublicLink = computed(() => {
  if (patient.value?.intakeToken) {
    return `${getPublicBaseUrl()}intake/${patient.value.intakeToken}`
  }
  return publicLinks.value.intake || ''
})
const managePublicLink = computed(() => {
  const token = latestManageAppointment.value?.manageToken
  if (!token) return ''
  return `${getPublicBaseUrl()}manage/${token}`
})
const latestIntakeForm = computed(() => {
  const formData = patient.value?.latestIntakeFormData
  return formData && typeof formData === 'object' && !Array.isArray(formData) ? formData : {}
})
const latestIntakeHistory = computed(() => {
  const historyParts = [
    latestIntakeForm.value.medicalHistory,
    latestIntakeForm.value.pastMedicalHistory,
  ]
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)

  return [...new Set(historyParts)].join('\n')
})
const latestIntakeSummaryVisible = computed(() => {
  return !!(
    patient.value?.latestIntakeSubmittedAt
    || patient.value?.latestIntakeSource
    || latestIntakeForm.value.chiefComplaint
    || latestIntakeForm.value.allergies
    || latestIntakeForm.value.currentMedications
    || latestIntakeHistory.value
    || latestIntakeForm.value.additionalNotes
  )
})
const latestIntakeSourceLabel = computed(() => {
  const source = patient.value?.latestIntakeSource
  if (!source) return '-'
  const key = `patientDetail.intakeSource.${source}`
  const translated = t(key)
  return translated === key ? source : translated
})
const firstConsultation = computed(() => {
  if (!consultations.value.length) return null
  return [...consultations.value].sort((a, b) => {
    const dateDiff = new Date(a.date) - new Date(b.date)
    if (dateDiff !== 0) return dateDiff
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
  })[0] || null
})

function getConsultationHistoryText(consultationRecord) {
  return consultationRecord?.historyAndMedicationSnapshot
    || consultationRecord?.historyAndMedication
    || ''
}

const consultationDrivenHistory = computed(() => {
  if (firstConsultation.value) {
    const firstConsultText = getConsultationHistoryText(firstConsultation.value)
    if (firstConsultText) return firstConsultText
  }
  return patient.value?.historyAndMedicationSnapshot
    || patient.value?.historyAndMedication
    || ''
})
const consultationDrivenHistoryDate = computed(() => {
  return firstConsultation.value?.date
    || patient.value?.historyAndMedicationSourceConsultDate
    || patient.value?.historySourceConsultDate
    || ''
})
const hasConsultationDrivenHistory = computed(() => !!firstConsultation.value)

const activeTab = ref('summary')

watch(isApprenticeReadonly, (readonly) => {
  if (readonly && activeTab.value !== 'consultations') {
    activeTab.value = 'consultations'
  }
}, { immediate: true })

watch(() => patient.value?.consentSigned, (signed) => {
  if (signed) {
    clearStoredConsentLink()
  }
}, { immediate: true })

// ── 隐私保护：非主治医师1周后无法访问 ──
const hasAccess = computed(() => {
  if (!patient.value) return false
  return canAccessPatientRecords(
    roles.value,
    authStore.userId,
    patient.value,
    consultationsStore.getPatientConsultations(patientId),
    {
      currentUser: authStore.currentUser,
      appointments: appointmentsStore.getPatientAppointments(patientId),
    },
  )
})

// ── 编辑模式 ──
const editing = ref(false)
const editForm = ref({})

function startEdit() {
  const addressCountry = normalizeCountryCode(patient.value?.addressCountry, DEFAULT_COUNTRY)
  editForm.value = {
    ...patient.value,
    gender: normalizeGender(patient.value?.gender),
    addressCountry,
    addressState: normalizeProvinceCode(addressCountry, patient.value?.addressState),
    emails: [...(patient.value.emails || [])],
  }
  editing.value = true
}

function cancelEdit() {
  editing.value = false
}

async function saveEdit() {
  try {
    const updates = { ...editForm.value }
    updates.gender = normalizeGender(updates.gender)
    if (hasConsultationDrivenHistory.value) {
      delete updates.historyAndMedication
      delete updates.historySourceConsultId
      delete updates.historySourceConsultDate
    }
    if (!isAdmin.value) {
      delete updates.practitionerId
    }
    await patientsStore.updatePatient(patientId, updates)
    editing.value = false
    ElMessage.success(t('patientDetail.patientSaved'))
  } catch (e) {
    ElMessage.error(e.message)
  }
}

// ── 知情同意书签署 ──
const showConsentDialog = ref(false)
const consentForm = ref({ agreements: {}, signatureName: '' })

const consentTemplate = computed(() => settingsStore.consentTemplate || { title: 'Informed Consent', version: '', sections: [] })
const consentSections = computed(() => Array.isArray(consentTemplate.value.sections) ? consentTemplate.value.sections : [])
const allConsentAgreed = computed(() =>
  consentSections.value.length > 0
  && consentSections.value.every((section) => consentForm.value.agreements?.[section.key] === true),
)

function openConsentDialog() {
  consentForm.value = {
    agreements: Object.fromEntries(consentSections.value.map((section) => [section.key, false])),
    signatureName: '',
  }
  showConsentDialog.value = true
}

async function confirmConsent() {
  if (!allConsentAgreed.value) return ElMessage.warning(t('patientDetail.pleaseAgree'))
  if (!consentForm.value.signatureName.trim()) return ElMessage.warning(t('patientDetail.pleaseSignName'))
  try {
    await patientsStore.signConsent(patientId, {
      signatureName: consentForm.value.signatureName.trim(),
      sectionAcknowledgements: consentForm.value.agreements,
    })
    showConsentDialog.value = false
    ElMessage.success(t('patientDetail.consentSigned'))
  } catch (e) {
    ElMessage.error(e.message)
  }
}

// 兼容旧调用
function sendConsent() {
  openConsentDialog()
}

// ── 停用病人 ──
async function deletePatient() {
  try {
    await ElMessageBox.confirm(
      t('patientDetail.deactivateConfirm'),
      t('patientDetail.deactivateTitle'),
      { type: 'warning' },
    )
    await patientsStore.deletePatient(patientId)
    ElMessage.success(t('patientDetail.deactivated'))
    router.push('/patients')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message)
  }
}

// ── 状态 ──
const STATUS_MAP = {
  draft: { type: 'info' },
  completed: { type: 'warning' },
  paid: { type: 'success' },
}

function getConsultTagType(consultation) {
  if (getPaymentStatus(consultation) === 'paid') return 'success'
  return STATUS_MAP[consultation.status]?.type || 'info'
}

function getConsultStatusLabel(consultation) {
  if (getPaymentStatus(consultation) === 'paid') return t('consultation.paymentStatusPaid')
  return t('consultStatus.' + consultation.status)
}

// ── 辨证寒热 ──
function getColdHeat(consult) {
  const val = consult.diff?.coldHeat || consult.coldHeat
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : '-'
  return val || '-'
}

// ── 就诊历史对比 ──
const compareMode = ref(false)
const compareIndex = ref(0)

const compareConsultation = computed(() => {
  if (!compareMode.value || consultations.value.length < 2) return null
  return consultations.value[compareIndex.value]
})
const compareDisplayOrder = computed(() => getHistoryDisplayOrder(compareIndex.value, consultations.value.length))

function prevCompare() {
  compareIndex.value = getOlderHistoryIndex(compareIndex.value, consultations.value.length)
}
function nextCompare() {
  compareIndex.value = getNewerHistoryIndex(compareIndex.value)
}

// ── 快速拷贝到新诊疗 ──
function quickCopyToNew(fields) {
  const src = compareConsultation.value
  if (!src) return
  // 将选中字段存到 sessionStorage，新建诊疗时读取
  const copyData = {}
  for (const f of fields) {
    if (f === 'chiefComplaint') copyData.chiefComplaint = src.chiefComplaint
    if (f === 'differentiation') {
      copyData.diff = JSON.parse(JSON.stringify(src.diff || {}))
      copyData.differentiation = src.differentiation
    }
    if (f === 'treatment') {
      Object.assign(copyData, buildCopiedTreatmentData(src))
    }
    if (f === 'pricing') {
      copyData.services = JSON.parse(JSON.stringify(src.services || []))
      copyData.consultationFee = src.consultationFee
      copyData.discountType = src.discountType
      copyData.discountValue = src.discountValue
    }
  }
  sessionStorage.setItem('tcm_copy_consult', JSON.stringify(sanitizeCopiedConsultationData(copyData)))
  ElMessage.success(t('patientDetail.copiedToClipboard'))
  router.push(`/patients/${patientId}/consultations/new`)
}

// ── 首选联系方式 ──
const PREFERRED_CONTACT_OPTIONS = ['Any', 'Email', 'Mobile Phone', 'Business Phone', 'Fax']

const countryOptions = COUNTRY_OPTIONS
const editProvinceOptions = computed(() => getProvinceOptions(editForm.value.addressCountry || DEFAULT_COUNTRY))

function handleEditCountryChange() {
  editForm.value.addressState = ''
}

function displayCountry(patientRecord = patient.value) {
  if (!patientRecord?.addressCountry && !patientRecord?.addressState) return '-'
  return getCountryLabel(patientRecord?.addressCountry || DEFAULT_COUNTRY) || '-'
}

function displayProvince(patientRecord = patient.value) {
  return getProvinceLabel(patientRecord?.addressCountry || DEFAULT_COUNTRY, patientRecord?.addressState) || '-'
}

// ── 邮件签署同意书 ──
const sendingConsentEmail = ref(false)

async function sendConsentByEmail() {
  sendingConsentEmail.value = true
  try {
    const res = await patientsApi.sendConsentEmail(patientId, {
      clinicName: settingsStore.clinicName || '',
      appBaseUrl: getPublicBaseUrl(),
    })
    if (res?.publicLink) {
      publicLinks.value.consent = res.publicLink
      persistPublicLinks(publicLinks.value)
    }
    if (res?.sent === false) {
      ElMessage.warning(res.message || t('patientDetail.consentEmailFailed'))
    } else {
      ElMessage.success(res.message || t('patientDetail.consentEmailSent'))
    }
  } catch (e) {
    ElMessage.error(e.message || t('patientDetail.consentEmailFailed'))
  } finally {
    sendingConsentEmail.value = false
  }
}

// ── 发送问诊单 ──
const sendingIntakeEmail = ref(false)

async function sendIntakeByEmail() {
  sendingIntakeEmail.value = true
  try {
    const res = await patientsApi.sendIntakeEmail(patientId, {
      clinicName: settingsStore.clinicName || '',
      appBaseUrl: getPublicBaseUrl(),
    })
    if (res?.publicLink) {
      publicLinks.value.intake = res.publicLink
      persistPublicLinks(publicLinks.value)
    }
    if (res?.sent === false) {
      ElMessage.warning(res.message || t('patientDetail.intakeEmailFailed'))
    } else {
      ElMessage.success(res.message || t('patientDetail.intakeEmailSent'))
    }
  } catch (e) {
    ElMessage.error(e.message || t('patientDetail.intakeEmailFailed'))
  } finally {
    sendingIntakeEmail.value = false
  }
}

async function copyPublicLink(link, label) {
  if (!link) {
    ElMessage.warning(`${label}链接暂不可用`)
    return
  }
  try {
    await navigator.clipboard.writeText(link)
    ElMessage.success(`${label}链接已复制`)
  } catch {
    ElMessage.error(`${label}链接复制失败`)
  }
}

// ── 文件夹层级展示 ──
const patientFiles = ref([])
const filesLoading = ref(false)

async function loadPatientFiles() {
  filesLoading.value = true
  try {
    const files = await filesApi.listByPatient(patientId)
    patientFiles.value = Array.isArray(files) ? files : []
  } catch {
    patientFiles.value = []
  } finally {
    filesLoading.value = false
  }
}

async function openPatientFile(file) {
  const source = file?.url || file?.resource || file?.filePath
  if (!source) return
  try {
    await filesApi.open(source)
  } catch (e) {
    ElMessage.error(e.message || t('common.loadFailed'))
  }
}

// 下载单个文件
async function downloadFile(file) {
  const source = file?.url || file?.resource || file?.filePath
  if (!source) return
  try {
    const resolvedUrl = await filesApi.resolveUrl(source)
    const a = document.createElement('a')
    a.href = resolvedUrl
    a.download = file.label || file.name || 'download'
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch (e) {
    window.open(source, '_blank')
  }
}

// 批量下载所有文件
async function downloadAllFiles() {
  if (patientFiles.value.length === 0) return
  try {
    await filesApi.downloadAllByPatient(patientId)
    ElMessage.success(t('patientDetail.downloadStarted', { count: patientFiles.value.length }))
  } catch (e) {
    const allFiles = []
    for (const f of patientFiles.value) {
      allFiles.push({ url: f.url || f.resource || f.filePath, label: f.fileName || f.name || 'file' })
    }
    if (patient.value?.consentPdfUrl) {
      allFiles.push({ url: patient.value.consentPdfUrl, label: t('patientDetail.consentPdfFile') })
    }
    for (const file of allFiles) {
      downloadFile(file)
    }
    ElMessage.warning(e.message || t('patientDetail.downloadStarted', { count: allFiles.length }))
  }
}

// 切换到文件标签页时自动加载
watch(activeTab, (val) => {
  if (val === 'files' && patientFiles.value.length === 0) {
    loadPatientFiles()
  }
})

const fileTree = computed(() => {
  const tree = [
    { label: t('patientDetail.folderBasicInfo'), icon: 'FolderOpened', children: [] },
    { label: t('patientDetail.folderConsent'), icon: 'FolderOpened', children: [] },
    { label: t('patientDetail.folderConsultations'), icon: 'FolderOpened', children: [] },
  ]
  const files = [...patientFiles.value]
  for (const consult of consultationsStore.getPatientConsultations(patientId)) {
    const consultDate = consult.date || consult.createdAt || consult.id
    const tongueResource = consult.diff?.tongueImageResource || consult.diff?.tongueImage
    if (tongueResource) {
      files.push({
        fileName: `${formatDate(consultDate)} - Tongue Image`,
        fileType: 'tongue_image',
        type: 'image',
        resource: tongueResource,
        consultationId: consult.id,
        consultDate,
        uploadedAt: consult.updatedAt || consult.createdAt || consult.date,
      })
    }
    for (const doc of consult.documents || []) {
      files.push({
        fileName: doc.name,
        fileType: doc.type || 'document',
        fileSize: doc.size,
        resource: doc.resource || doc.url || doc.data,
        url: doc.url,
        consultationId: consult.id,
        consultDate,
        uploadedAt: doc.uploadedAt || consult.updatedAt || consult.createdAt,
      })
    }
  }
  const seenFiles = new Set()
  for (const f of files) {
    const fileUrl = f.url || f.resource || f.filePath
    const fileLabel = f.fileName || f.name || 'file'
    const fileKey = `${f.consultationId || 'patient'}-${fileUrl || fileLabel}`
    if (seenFiles.has(fileKey)) continue
    seenFiles.add(fileKey)
    const node = {
      label: fileLabel,
      url: fileUrl,
      size: f.fileSize,
      date: f.uploadTime || f.createTime || f.uploadedAt,
      isFile: true,
    }
    const type = (f.fileType || f.type || '').toLowerCase()
    if (type === 'consent' || (f.fileName || '').includes('consent')) {
      tree[1].children.push(node)
    } else if (f.consultationId) {
      let dateFolder = tree[2].children.find(c => c.label === (f.consultDate || f.consultationId))
      if (!dateFolder) {
        dateFolder = {
          label: f.consultDate || f.consultationId || 'unknown',
          icon: 'Folder',
          children: [],
        }
        tree[2].children.push(dateFolder)
      }
      dateFolder.children.push(node)
    } else {
      tree[0].children.push(node)
    }
  }
  // Add consent PDF if exists
  if (patient.value?.consentPdfUrl) {
    tree[1].children.push({
      label: t('patientDetail.consentPdfFile'),
      url: patient.value.consentPdfUrl,
      date: patient.value.consentSignedAt,
      isFile: true,
    })
  }
  return tree
})
</script>

<template>
  <div v-if="patient && hasAccess" class="patient-detail">
    <!-- 病人页头 -->
    <div class="patient-header">
      <div class="patient-avatar-info">
        <el-avatar :size="60" style="background: var(--color-primary); font-size: 26px; flex-shrink:0">
          {{ (patient.lastName || patient.name || '?').charAt(0) }}
        </el-avatar>
        <div class="patient-basic">
          <div class="patient-name-row">
            <h2>{{ patient.name }}</h2>
            <el-tag v-if="!isApprenticeReadonly" :type="patient.consentSigned ? 'success' : 'danger'" size="small">
              {{ patient.consentSigned ? t('patientDetail.consentSignedTag') : t('patientDetail.consentUnsignedTag') }}
            </el-tag>
            <el-tag v-if="!isApprenticeReadonly && patient.consentPdfUrl" type="success" size="small" effect="plain"
              style="cursor:pointer" @click="openPatientFile({ url: patient.consentPdfUrl, label: t('patientDetail.consentPdfFile') })">
              PDF
            </el-tag>
            <el-tag v-if="!isApprenticeReadonly && patient.gender" :type="getGenderTagType(patient.gender)" size="small">
              {{ formatGender(patient.gender) }}
            </el-tag>
          </div>
          <div v-if="!isApprenticeReadonly" class="patient-meta">
            <span v-if="patient.jobTitle">{{ patient.jobTitle }}</span>
            <span v-if="patient.jobTitle && patient.accountName"> · </span>
            <span v-if="patient.accountName">{{ patient.accountName }}</span>
            <span v-if="patient.mobilePhone || patient.phone">
              &nbsp;|&nbsp;{{ patient.mobilePhone || patient.phone }}
            </span>
            <span v-if="patient.emails?.[0]">
              &nbsp;|&nbsp;{{ patient.emails?.[0] }}
            </span>
          </div>

        </div>
      </div>
      <div class="patient-actions">
        <el-button v-if="!isApprenticeReadonly && !patient.consentSigned" size="small" @click="sendConsent">
          <el-icon><Document /></el-icon> {{ t('patientDetail.signConsent') }}
        </el-button>
        <el-button v-if="canEdit && !editing" size="small" @click="startEdit">
          <el-icon><Edit /></el-icon> {{ t('patientDetail.editButton') }}
        </el-button>
        <el-button
          v-if="canCreate"
          size="small"
          type="primary"
          @click="$router.push(`/patients/${patientId}/consultations/new`)"
        >
          <el-icon><Plus /></el-icon> {{ t('patientDetail.newConsultation') }}
        </el-button>
        <el-button v-if="canDelete" size="small" type="danger" text @click="deletePatient">{{ t('patientDetail.deactivate') }}</el-button>
      </div>
    </div>

    <!-- 主内容标签页 -->
    <el-card class="detail-card">
      <el-alert
        v-if="isApprenticeReadonly"
        :title="t('patientDetail.apprenticeReadonlyNotice')"
        type="info"
        :closable="false"
        style="margin-bottom: 12px"
      />
      <el-tabs v-model="activeTab">

        <!-- ══════════ Tab 1: Summary 基本信息 ══════════ -->
        <el-tab-pane v-if="!isApprenticeReadonly" :label="t('patientDetail.tabSummary')" name="summary">
          <div v-if="!editing">
            <!-- 查看模式 -->
            <el-row :gutter="24">
              <!-- 左列：联系信息 -->
              <el-col :span="14">
                <div class="section-title">{{ t('patientDetail.contactInfo') }}</div>
                <el-descriptions :column="2" border size="small" class="info-desc">
                  <el-descriptions-item :label="t('patientDetail.lastName')">{{ patient.lastName || '-' }}</el-descriptions-item>
                  <el-descriptions-item :label="t('patientDetail.firstName')">{{ patient.firstName || '-' }}</el-descriptions-item>
                  <el-descriptions-item :label="t('patientDetail.middleName')">{{ patient.middleName || '-' }}</el-descriptions-item>
                  <el-descriptions-item :label="t('patientDetail.gender')">{{ formatGender(patient.gender) }}</el-descriptions-item>
                  <el-descriptions-item :label="t('patientDetail.dateOfBirth')">{{ patient.dateOfBirth || '-' }}</el-descriptions-item>
                  <el-descriptions-item :label="t('patientDetail.jobTitle')">{{ patient.jobTitle || '-' }}</el-descriptions-item>
                  <el-descriptions-item :label="t('patientDetail.accountName')" :span="2">{{ patient.accountName || '-' }}</el-descriptions-item>
                  <template v-if="!hidePatientContact">
                    <el-descriptions-item :label="t('patientDetail.email1')" :span="2">{{ patient.emails?.[0] || '-' }}</el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.email2')" :span="2">{{ patient.email2 || patient.emails?.[1] || '-' }}</el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.email3')" :span="2">{{ patient.email3 || patient.emails?.[2] || '-' }}</el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.mobilePhone')">{{ patient.mobilePhone || '-' }}</el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.businessPhone')">{{ patient.businessPhone || '-' }}</el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.fax')">{{ patient.fax || '-' }}</el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.preferredContact')">{{ patient.preferredContact || '-' }}</el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.streetAddress')" :span="2">{{ patient.addressStreet || patient.address || '-' }}</el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.country')">{{ displayCountry(patient) }}</el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.province')">{{ displayProvince(patient) }}</el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.city')">{{ patient.addressCity || '-' }}</el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.postalCode')">{{ patient.addressPostal || '-' }}</el-descriptions-item>
                  </template>
                  <el-descriptions-item :label="t('patientDetail.primaryPractitioner')">
                    {{ getPractitionerName(patient.practitionerId) }}
                  </el-descriptions-item>
                </el-descriptions>

                <div class="section-title" style="margin-top: 20px">{{ t('patientDetail.medicalInfo') }}</div>
                <el-descriptions :column="1" border size="small" class="info-desc">
                  <!-- Bug 1: diseaseName 已移除，主诉病名属于诊疗记录层面而非病人层面 -->
                  <el-descriptions-item :label="t('patientDetail.historyAndMedication')">
                    <div style="white-space: pre-wrap; line-height: 1.6">{{ consultationDrivenHistory || '-' }}</div>
                    <div v-if="consultationDrivenHistoryDate" style="margin-top: 6px; font-size: 12px; color: #888">
                      来源首诊记录：{{ consultationDrivenHistoryDate }}
                    </div>
                  </el-descriptions-item>
                  <el-descriptions-item v-if="patient.notes" :label="t('common.notes')">
                    <div style="white-space: pre-wrap; line-height: 1.6">{{ patient.notes }}</div>
                  </el-descriptions-item>
                </el-descriptions>

                <div class="section-title" style="margin-top: 20px">{{ t('patientDetail.latestIntakeSummary') }}</div>
                <el-descriptions :column="1" border size="small" class="info-desc">
                  <template v-if="latestIntakeSummaryVisible">
                    <el-descriptions-item :label="t('patientDetail.intakeSubmittedAt')">
                      {{ patient.latestIntakeSubmittedAt ? formatDateTime(patient.latestIntakeSubmittedAt) : '-' }}
                    </el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.intakeSourceLabel')">
                      {{ latestIntakeSourceLabel }}
                    </el-descriptions-item>
                    <el-descriptions-item v-if="latestIntakeForm.chiefComplaint" :label="t('patientDetail.intakeChiefComplaint')">
                      <div style="white-space: pre-wrap; line-height: 1.6">{{ latestIntakeForm.chiefComplaint }}</div>
                    </el-descriptions-item>
                    <el-descriptions-item v-if="latestIntakeForm.allergies" :label="t('patientDetail.intakeAllergies')">
                      <div style="white-space: pre-wrap; line-height: 1.6">{{ latestIntakeForm.allergies }}</div>
                    </el-descriptions-item>
                    <el-descriptions-item v-if="latestIntakeForm.currentMedications" :label="t('patientDetail.intakeCurrentMedications')">
                      <div style="white-space: pre-wrap; line-height: 1.6">{{ latestIntakeForm.currentMedications }}</div>
                    </el-descriptions-item>
                    <el-descriptions-item v-if="latestIntakeHistory" :label="t('patientDetail.intakeMedicalHistory')">
                      <div style="white-space: pre-wrap; line-height: 1.6">{{ latestIntakeHistory }}</div>
                    </el-descriptions-item>
                    <el-descriptions-item v-if="latestIntakeForm.additionalNotes" :label="t('patientDetail.intakeAdditionalNotes')">
                      <div style="white-space: pre-wrap; line-height: 1.6">{{ latestIntakeForm.additionalNotes }}</div>
                    </el-descriptions-item>
                  </template>
                  <el-descriptions-item v-else :label="t('common.status')">
                    {{ t('patientDetail.latestIntakeEmpty') }}
                  </el-descriptions-item>
                </el-descriptions>
              </el-col>

              <!-- 右列：时间线 -->
              <el-col :span="10">
                <div class="section-title">{{ t('patientDetail.fileTimeline') }}</div>
                <div class="timeline-panel">
                  <el-timeline>
                    <el-timeline-item
                      v-for="consult in consultations.slice(0, 8)"
                      :key="consult.id"
                      :type="getConsultTagType(consult)"
                      :timestamp="formatDate(consult.date)"
                      placement="top"
                    >
                      <div
                        class="timeline-consult"
                        @click="$router.push(`/patients/${patientId}/consultations/${consult.id}`)"
                      >
                        <div class="timeline-complaint">{{ consult.chiefComplaint || t('dashboard.generalConsultation') }}</div>
                        <div class="timeline-status">
                          <el-tag :type="getConsultTagType(consult)" size="small">
                            {{ getConsultStatusLabel(consult) }}
                          </el-tag>
                          <span v-if="consult.totalAmount > 0" class="timeline-amount">
                            ${{ consult.totalAmount.toFixed(2) }}
                          </span>
                        </div>
                      </div>
                    </el-timeline-item>
                    <el-timeline-item type="primary" :timestamp="formatDate(patient.createdAt)">
                      <span style="color: #888; font-size: 13px">{{ t('patientDetail.fileCreated') }}</span>
                    </el-timeline-item>
                  </el-timeline>
                  <div v-if="consultations.length === 0" style="color: #bbb; font-size: 13px; padding: 8px 0">
                    {{ t('patientDetail.noVisitRecords') }}
                  </div>
                </div>

                <!-- 同意书状态 -->
                <div class="section-title" style="margin-top: 20px">{{ t('patientDetail.consentStatus') }}</div>
                <el-card shadow="never" class="consent-mini-card">
                  <div class="consent-status-row">
                    <el-icon v-if="patient.consentSigned" color="#2d6a4f" :size="20"><CircleCheck /></el-icon>
                    <el-icon v-else color="#e63946" :size="20"><CircleClose /></el-icon>
                    <span :style="{ color: patient.consentSigned ? '#2d6a4f' : '#e63946', fontWeight: 600 }">
                      {{ patient.consentSigned ? t('patientDetail.consentSignedInfo') : t('patientDetail.consentUnsignedInfo') }}
                    </span>
                  </div>
                  <div v-if="patient.consentSignedAt" style="font-size: 12px; color: #888; margin-top: 4px">
                    {{ t('patientDetail.signedTime') }}{{ formatDateTime(patient.consentSignedAt) }}
                  </div>
                  <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap">
                    <el-button v-if="!patient.consentSigned" size="small" type="primary" plain @click="sendConsent">
                      <el-icon><Document /></el-icon> {{ t('patientDetail.markAsSigned') }}
                    </el-button>
                    <el-button v-if="!patient.consentSigned" size="small" type="success" plain :loading="sendingConsentEmail" @click="sendConsentByEmail">
                      <el-icon><Message /></el-icon> {{ t('patientDetail.sendConsentEmail') }}
                    </el-button>
                    <el-button size="small" type="warning" plain :loading="sendingIntakeEmail" @click="sendIntakeByEmail">
                      <el-icon><EditPen /></el-icon> Send Initial Intake
                    </el-button>
                  </div>
                  <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #eee; display: flex; flex-direction: column; gap: 8px;">
                    <div style="font-size: 12px; color: #888;">Public URL</div>
                    <div v-if="!patient.consentSigned && consentPublicLink" style="display:flex; gap:8px; align-items:flex-start; flex-wrap:wrap;">
                      <span style="min-width: 88px; font-size: 12px; color: #555;">知情同意书</span>
                      <el-text style="flex:1; word-break: break-all;">{{ consentPublicLink }}</el-text>
                      <el-button size="small" text type="primary" @click="copyPublicLink(consentPublicLink, '知情同意书')">复制</el-button>
                    </div>
                    <div v-if="intakePublicLink" style="display:flex; gap:8px; align-items:flex-start; flex-wrap:wrap;">
                      <span style="min-width: 88px; font-size: 12px; color: #555;">Initial Intake</span>
                      <el-text style="flex:1; word-break: break-all;">{{ intakePublicLink }}</el-text>
                      <el-button size="small" text type="primary" @click="copyPublicLink(intakePublicLink, 'Initial Intake')">复制</el-button>
                    </div>
                    <div v-if="managePublicLink" style="display:flex; gap:8px; align-items:flex-start; flex-wrap:wrap;">
                      <span style="min-width: 88px; font-size: 12px; color: #555;">预约管理</span>
                      <el-text style="flex:1; word-break: break-all;">{{ managePublicLink }}</el-text>
                      <el-button size="small" text type="primary" @click="copyPublicLink(managePublicLink, '预约管理')">复制</el-button>
                    </div>
                    <div v-if="!consentPublicLink && !intakePublicLink && !managePublicLink" style="font-size: 12px; color: #bbb;">
                      暂无可显示链接。发送邮件后会显示对应公开链接。
                    </div>
                  </div>
                </el-card>
              </el-col>
            </el-row>
          </div>

          <!-- 编辑模式 -->
          <div v-else>
            <el-row :gutter="24">
              <el-col :span="14">
                <div class="section-title">{{ t('patientDetail.contactInfo') }}</div>
                <el-form :model="editForm" label-width="110px" size="small">
                  <el-row :gutter="12">
                    <el-col :span="12">
                      <el-form-item :label="t('patientDetail.lastName')">
                        <el-input v-model="editForm.lastName" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item :label="t('patientDetail.firstName')">
                        <el-input v-model="editForm.firstName" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item :label="t('patientDetail.middleName')">
                        <el-input v-model="editForm.middleName" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item :label="t('patientDetail.gender')">
                        <el-radio-group v-model="editForm.gender">
                          <el-radio v-for="option in GENDER_OPTIONS" :key="option.value" :value="option.value">
                            {{ option.label }}
                          </el-radio>
                        </el-radio-group>
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item :label="t('patientDetail.dateOfBirth')">
                        <el-input v-model="editForm.dateOfBirth" placeholder="YYYY/MM/DD" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item :label="t('patientDetail.jobTitle')">
                        <el-input v-model="editForm.jobTitle" />
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="24">
                      <el-form-item :label="t('patientDetail.accountName')">
                        <el-input v-model="editForm.accountName" />
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="24">
                      <el-form-item :label="t('patientDetail.email1')">
                        <el-input v-model="editForm.emails[0]" />
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="24">
                      <el-form-item :label="t('patientDetail.email2')">
                        <el-input v-model="editForm.email2" />
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="24">
                      <el-form-item :label="t('patientDetail.email3')">
                        <el-input v-model="editForm.email3" />
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="12">
                      <el-form-item :label="t('patientDetail.mobilePhone')">
                        <el-input v-model="editForm.mobilePhone" />
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="12">
                      <el-form-item :label="t('patientDetail.businessPhone')">
                        <el-input v-model="editForm.businessPhone" />
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="12">
                      <el-form-item :label="t('patientDetail.fax')">
                        <el-input v-model="editForm.fax" />
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="12">
                      <el-form-item :label="t('patientDetail.preferredContact')">
                        <el-select v-model="editForm.preferredContact" style="width:100%">
                          <el-option
                            v-for="opt in PREFERRED_CONTACT_OPTIONS"
                            :key="opt"
                            :label="opt"
                            :value="opt"
                          />
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="24">
                      <el-form-item :label="t('patientDetail.streetAddress')">
                        <el-input v-model="editForm.addressStreet" />
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="6">
                      <el-form-item :label="t('patientDetail.country')">
                        <el-select v-model="editForm.addressCountry" filterable style="width:100%" @change="handleEditCountryChange">
                          <el-option v-for="p in countryOptions" :key="p.value" :label="p.label" :value="p.value" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="6">
                      <el-form-item :label="t('patientDetail.province')">
                        <el-select v-model="editForm.addressState" filterable style="width:100%">
                          <el-option v-for="p in editProvinceOptions" :key="p.value" :label="p.label" :value="p.value" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="6">
                      <el-form-item :label="t('patientDetail.city')">
                        <el-input v-model="editForm.addressCity" />
                      </el-form-item>
                    </el-col>
                    <el-col v-if="!hidePatientContact" :span="6">
                      <el-form-item :label="t('patientDetail.postalCode')">
                        <el-input v-model="editForm.addressPostal" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="24">
                      <el-form-item :label="t('patientDetail.primaryPractitioner')">
                        <el-select v-if="isAdmin" v-model="editForm.practitionerId" style="width:100%">
                          <el-option
                            v-for="p in practitioners"
                            :key="p.id"
                            :label="p.name"
                            :value="p.id"
                          />
                        </el-select>
                        <el-input v-else :model-value="getPractitionerName(editForm.practitionerId)" disabled />
                      </el-form-item>
                    </el-col>
                  </el-row>

                  <div class="section-title" style="margin-top: 12px">{{ t('patientDetail.medicalInfo') }}</div>
                  <!-- Bug 1: diseaseName 已从病人编辑表单移除 -->
                  <el-form-item :label="t('patientDetail.historyAndMedication')">
                    <template v-if="hasConsultationDrivenHistory">
                      <el-alert
                        type="info"
                        :closable="false"
                        show-icon
                        :title="t('patientDetail.historyDrivenByFirstConsult')"
                      />
                      <div style="margin-top: 8px; white-space: pre-wrap; line-height: 1.6; padding: 10px 12px; border: 1px solid #ebeef5; border-radius: 6px; background: #fafafa;">
                        {{ consultationDrivenHistory || '-' }}
                      </div>
                      <div style="margin-top: 8px;">
                        <el-button
                          v-if="firstConsultation"
                          size="small"
                          type="primary"
                          plain
                          @click="$router.push(`/patients/${patientId}/consultations/${firstConsultation.id}`)"
                        >
                          {{ t('patientDetail.openFirstConsultation') }}
                        </el-button>
                      </div>
                    </template>
                    <el-input
                      v-else
                      v-model="editForm.historyAndMedication"
                      type="textarea"
                      :rows="8"
                      :placeholder="t('patientDetail.historyPlaceholder')"
                      resize="vertical"
                    />
                  </el-form-item>
                  <el-form-item :label="t('common.notes')">
                    <el-input
                      v-model="editForm.notes"
                      type="textarea"
                      :rows="2"
                      :placeholder="t('patientDetail.notesPlaceholder')"
                    />
                  </el-form-item>
                </el-form>
              </el-col>
              <el-col :span="10">
                <div class="edit-save-panel">
                  <el-button type="primary" @click="saveEdit">
                    <el-icon><Check /></el-icon> {{ t('patientDetail.saveChanges') }}
                  </el-button>
                  <el-button @click="cancelEdit">{{ t('common.cancel') }}</el-button>
                </div>
              </el-col>
            </el-row>
          </div>
        </el-tab-pane>

        <!-- ══════════ Tab 2: Consultation 诊疗记录 ══════════ -->
        <el-tab-pane name="consultations">
          <template #label>
            {{ t('patientDetail.tabConsultations') }}
            <el-badge
              v-if="consultations.length"
              :value="consultations.length"
              style="margin-left: 6px"
            />
          </template>

          <!-- 工具栏 -->
          <div class="consult-toolbar">
            <div class="consult-toolbar-left">
              <el-button
                v-if="canCreate"
                type="primary"
                size="small"
                @click="$router.push(`/patients/${patientId}/consultations/new`)"
              >
                <el-icon><Plus /></el-icon> {{ t('patientDetail.newConsultation') }}
              </el-button>
              <el-button
                v-if="consultations.length >= 2"
                size="small"
                :type="compareMode ? 'warning' : ''"
                @click="compareMode = !compareMode; compareIndex = 0"
              >
                <el-icon><Switch /></el-icon>
                {{ compareMode ? t('patientDetail.exitCompare') : t('patientDetail.historyCompare') }}
              </el-button>
            </div>
            <span class="consult-count">{{ t('patientDetail.totalVisits', { count: consultations.length }) }}</span>
          </div>

          <!-- 对比模式 -->
          <div v-if="compareMode && consultations.length >= 2" class="compare-mode">
            <div class="compare-nav">
              <el-button
                :disabled="!canSelectOlderHistory(compareIndex, consultations.length)"
                :icon="'ArrowLeft'"
                circle
                size="small"
                @click="prevCompare"
              />
              <span class="compare-label">
                {{ formatDate(compareConsultation?.date) }} ↔ {{ formatDate(consultations[0]?.date) }}（{{ compareDisplayOrder }}/{{ consultations.length }}）
              </span>
              <el-button
                :disabled="!canSelectNewerHistory(compareIndex)"
                :icon="'ArrowRight'"
                circle
                size="small"
                @click="nextCompare"
              />
            </div>
            <div class="compare-grid">
              <el-card class="compare-panel compare-old">
                <template #header>
                  <div style="display:flex; justify-content:space-between; align-items:center">
                    <span style="color:#888">{{ t('patientDetail.historicalRecord') }} · {{ formatDate(compareConsultation?.date) }}</span>
                    <el-dropdown v-if="canCreate" trigger="click" @command="quickCopyToNew">
                      <el-button size="small" type="warning">
                        <el-icon><CopyDocument /></el-icon> {{ t('patientDetail.quickCopy') }}
                      </el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item :command="['chiefComplaint']">{{ t('patientDetail.copyChiefComplaint') }}</el-dropdown-item>
                          <el-dropdown-item :command="['differentiation']">{{ t('patientDetail.copyDiagnosis') }}</el-dropdown-item>
                          <el-dropdown-item :command="['treatment']">{{ t('patientDetail.copyTreatment') }}</el-dropdown-item>
                          <el-dropdown-item :command="['pricing']">{{ t('patientDetail.copyPricing') }}</el-dropdown-item>
                          <el-dropdown-item :command="['chiefComplaint','differentiation','treatment','pricing']" divided>{{ t('patientDetail.copyAll') }}</el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <el-descriptions :column="1" size="small" border>
                  <el-descriptions-item :label="t('patientDetail.chiefComplaint')">{{ compareConsultation?.chiefComplaint || '-' }}</el-descriptions-item>
                  <el-descriptions-item :label="t('patientDetail.coldHeat')">{{ compareConsultation?.diff?.coldHeat || '-' }}</el-descriptions-item>
                  <el-descriptions-item :label="t('patientDetail.differentiation')">{{ compareConsultation?.differentiation || '-' }}</el-descriptions-item>
                  <el-descriptions-item :label="t('patientDetail.prognosis')">{{ compareConsultation?.prognosis || '-' }}</el-descriptions-item>
                </el-descriptions>
              </el-card>
              <el-card class="compare-panel compare-new">
                <template #header>
                  <span style="color:#2d6a4f; font-weight:600">{{ t('patientDetail.latestRecord') }} · {{ formatDate(consultations[0]?.date) }}</span>
                </template>
                <el-descriptions :column="1" size="small" border>
                  <el-descriptions-item :label="t('patientDetail.chiefComplaint')">{{ consultations[0]?.chiefComplaint || '-' }}</el-descriptions-item>
                  <el-descriptions-item :label="t('patientDetail.coldHeat')">{{ consultations[0]?.diff?.coldHeat || '-' }}</el-descriptions-item>
                  <el-descriptions-item :label="t('patientDetail.differentiation')">{{ consultations[0]?.differentiation || '-' }}</el-descriptions-item>
                  <el-descriptions-item :label="t('patientDetail.previousReview')">{{ consultations[0]?.previousPrognosisReview || '-' }}</el-descriptions-item>
                </el-descriptions>
              </el-card>
            </div>
          </div>

          <!-- 诊疗记录表格 -->
          <div v-if="consultations.length === 0" class="empty-consult">
            <el-empty :description="t('patientDetail.noConsultations')" :image-size="80" />
            <el-button v-if="canCreate" type="primary" @click="$router.push(`/patients/${patientId}/consultations/new`)">
              {{ t('patientDetail.createFirst') }}
            </el-button>
          </div>
          <el-table
            v-else
            :data="consultations"
            stripe
            row-key="id"
            style="cursor: pointer"
            @row-click="(row) => $router.push(`/patients/${patientId}/consultations/${row.id}`)"
          >
            <el-table-column :label="t('patientDetail.visitDate')" width="120">
              <template #default="{ row }">
                <span style="font-weight:600; color: #2d6a4f">{{ formatDate(row.date) }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.status')" width="90">
              <template #default="{ row }">
                <el-tag :type="getConsultTagType(row)" size="small">
                  {{ getConsultStatusLabel(row) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('patientDetail.chiefComplaint')" min-width="120">
              <template #default="{ row }">{{ row.chiefComplaint || '-' }}</template>
            </el-table-column>
            <el-table-column :label="t('patientDetail.rating')" width="120">
              <template #default="{ row }">
                <el-rate
                  v-if="row.rating"
                  :model-value="row.rating"
                  disabled
                  size="small"
                  style="margin: 0"
                />
                <span v-else style="color: #bbb; font-size: 12px">-</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('patientDetail.chiefComplaintDescription')" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">{{ row.chiefComplaintDescription || '-' }}</template>
            </el-table-column>
            <el-table-column :label="t('common.amount')" width="100" align="right">
              <template #default="{ row }">
                <span v-if="row.totalAmount > 0" style="font-weight:600">
                  ${{ row.totalAmount.toFixed(2) }}
                </span>
                <span v-else style="color: #bbb">-</span>
              </template>
            </el-table-column>
            <el-table-column label="" width="60" fixed="right">
              <template #default="{ row }">
                <el-icon v-if="getPaymentStatus(row) === 'paid'" color="#bbb" :title="t('consultation.paymentStatusPaid')"><Lock /></el-icon>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- ══════════ Tab 3: Consent 知情同意书 ══════════ -->
        <el-tab-pane v-if="!isApprenticeReadonly" :label="t('patientDetail.tabConsent')" name="consent">
          <div class="consent-tab">
            <el-row :gutter="24">
              <el-col :span="14">
                <el-card shadow="never" class="consent-card">
                  <template #header>
                    <div class="card-header">
                      <span>{{ t('patientDetail.consentStatusTitle') }}</span>
                      <el-tag :type="patient.consentSigned ? 'success' : 'danger'">
                        {{ patient.consentSigned ? t('patients.consentSigned') : t('patients.consentUnsigned') }}
                      </el-tag>
                    </div>
                  </template>
                  <div class="consent-content">
                    <div class="consent-icon-row">
                      <el-icon
                        :size="48"
                        :color="patient.consentSigned ? '#2d6a4f' : '#e63946'"
                      >
                        <component :is="patient.consentSigned ? 'CircleCheck' : 'CircleClose'" />
                      </el-icon>
                    </div>
                    <div v-if="patient.consentSigned" class="consent-info">
                      <p style="color: #2d6a4f; font-size: 16px; font-weight: 600; margin-bottom: 8px">
                        {{ t('patientDetail.consentSignedTitle') }}
                      </p>
                      <p style="color: #555">
                        {{ t('patientDetail.signedTime') }}{{ patient.consentSignedAt ? formatDateTime(patient.consentSignedAt) : t('patientDetail.unknownTime') }}
                      </p>
                      <p v-if="patient.consentSignedBy" style="color: #555">
                        {{ t('patientDetail.signedBy') }}{{ patient.consentSignedBy }}
                      </p>
                      <p v-if="patient.consentVersion" style="color: #888; font-size: 12px">
                        {{ t('patientDetail.version') }}v{{ patient.consentVersion }}
                      </p>
                    </div>
                    <div v-else class="consent-info">
                      <p style="color: #e63946; font-size: 16px; font-weight: 600; margin-bottom: 8px">
                        {{ t('patientDetail.consentUnsignedTitle') }}
                      </p>
                      <p style="color: #888; margin-bottom: 16px">
                        {{ t('patientDetail.consentRequired') }}
                      </p>
                      <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center">
                        <el-button type="primary" @click="openConsentDialog">
                          <el-icon><Document /></el-icon>
                          {{ t('patientDetail.signConsentButton') }}
                        </el-button>
                        <el-button type="success" :loading="sendingConsentEmail" @click="sendConsentByEmail">
                          <el-icon><Message /></el-icon>
                          {{ t('patientDetail.sendConsentEmail') }}
                        </el-button>
                      </div>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="10">
                <el-card shadow="never">
                  <template #header><span>{{ t('patientDetail.consentDescription') }}</span></template>
                  <div style="font-size: 14px; color: #555; line-height: 1.8">
                    <p>{{ t('patientDetail.consentIncludes') }}</p>
                    <ul style="padding-left: 20px; margin: 8px 0">
                      <li>{{ t('patientDetail.consentItem1') }}</li>
                      <li>{{ t('patientDetail.consentItem2') }}</li>
                      <li>{{ t('patientDetail.consentItem3') }}</li>
                      <li>{{ t('patientDetail.consentItem4') }}</li>
                      <li>{{ t('patientDetail.consentItem5') }}</li>
                    </ul>
                    <p style="margin-top: 12px; color: #888; font-size: 12px">
                      {{ t('patientDetail.consentNote') }}
                    </p>
                  </div>
                </el-card>
              </el-col>
            </el-row>
          </div>
        </el-tab-pane>

        <!-- ══════════ Tab 4: Related 关联记录 ══════════ -->
        <el-tab-pane v-if="!isApprenticeReadonly" :label="t('patientDetail.tabRelated')" name="related">
          <div class="related-tab">
            <el-row :gutter="16">
              <!-- 诊疗统计 -->
              <el-col :span="8">
                <el-card shadow="never" class="stat-card">
                  <div class="stat-icon" style="color: #2d6a4f"><el-icon :size="28"><Document /></el-icon></div>
                  <div class="stat-num">{{ consultations.length }}</div>
                  <div class="stat-label">{{ t('patientDetail.totalVisitCount') }}</div>
                </el-card>
              </el-col>
              <el-col :span="8">
                <el-card shadow="never" class="stat-card">
                  <div class="stat-icon" style="color: #e9a000"><el-icon :size="28"><Coin /></el-icon></div>
                  <div class="stat-num">
                    ${{ consultations.reduce((s, c) => s + (c.totalAmount || 0), 0).toFixed(0) }}
                  </div>
                  <div class="stat-label">{{ t('patientDetail.totalSpending') }}</div>
                </el-card>
              </el-col>
              <el-col :span="8">
                <el-card shadow="never" class="stat-card">
                  <div class="stat-icon" style="color: #3a86ff"><el-icon :size="28"><Calendar /></el-icon></div>
                  <div class="stat-num">
                    {{ consultations.filter(c => getPaymentStatus(c) === 'paid').length }}
                  </div>
                  <div class="stat-label">{{ t('patientDetail.paidVisitCount') }}</div>
                </el-card>
              </el-col>

              <!-- 最近就诊 -->
              <el-col :span="24" style="margin-top: 16px">
                <el-card shadow="never">
                  <template #header><span>{{ t('patientDetail.recentVisits') }}</span></template>
                  <el-table :data="consultations.slice(0, 5)" size="small" stripe>
                    <el-table-column :label="t('common.date')" width="110">
                      <template #default="{ row }">{{ formatDate(row.date) }}</template>
                    </el-table-column>
                    <el-table-column :label="t('patientDetail.chiefComplaint')" prop="chiefComplaint" min-width="120" />
                    <el-table-column :label="t('common.status')" width="90">
                      <template #default="{ row }">
                        <el-tag :type="getConsultTagType(row)" size="small">
                          {{ getConsultStatusLabel(row) }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column :label="t('common.amount')" width="100" align="right">
                      <template #default="{ row }">
                        {{ row.totalAmount > 0 ? `$${row.totalAmount.toFixed(2)}` : '-' }}
                      </template>
                    </el-table-column>
                  </el-table>
                </el-card>
              </el-col>

              <!-- 病人档案信息 -->
              <el-col :span="24" style="margin-top: 16px">
                <el-card shadow="never">
                  <template #header><span>{{ t('patientDetail.fileMeta') }}</span></template>
                  <el-descriptions :column="2" size="small" border>
                    <el-descriptions-item :label="t('patientDetail.patientId')">
                      <el-text type="info" style="font-family: monospace">{{ patient.id }}</el-text>
                    </el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.createdTime')">
                      {{ formatDateTime(patient.createdAt) }}
                    </el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.fileStatus')">
                      <el-tag :type="patient.isActive ? 'success' : 'danger'" size="small">
                        {{ patient.isActive ? t('common.active') : t('common.inactive') }}
                      </el-tag>
                    </el-descriptions-item>
                    <el-descriptions-item :label="t('patientDetail.mergeStatus')">
                      {{ patient.mergedInto ? t('patientDetail.mergedTo', { id: patient.mergedInto }) : t('patientDetail.independentFile') }}
                    </el-descriptions-item>
                  </el-descriptions>
                </el-card>
              </el-col>
            </el-row>
          </div>
        </el-tab-pane>

        <!-- ══════════ Tab 5: Files 文件管理 ══════════ -->
        <el-tab-pane v-if="!isApprenticeReadonly" :label="t('patientDetail.tabFiles')" name="files">
          <div class="files-tab">
            <div class="files-toolbar">
              <el-button size="small" @click="loadPatientFiles" :loading="filesLoading">
                <el-icon><Refresh /></el-icon> {{ t('patientDetail.refreshFiles') }}
              </el-button>
              <el-button size="small" type="primary" plain @click="downloadAllFiles" :disabled="patientFiles.length === 0">
                <el-icon><Download /></el-icon> {{ t('patientDetail.downloadAll') }}
              </el-button>
              <span class="files-count">{{ patientFiles.length }} {{ t('patientDetail.filesTotal') }}</span>
            </div>

            <div class="file-tree-container">
              <div v-for="folder in fileTree" :key="folder.label" class="file-folder">
                <div class="folder-header">
                  <el-icon color="#e9a000" :size="18"><FolderOpened /></el-icon>
                  <span class="folder-name">{{ folder.label }}</span>
                  <el-tag size="small" type="info" effect="plain" style="margin-left: 6px">
                    {{ folder.children.length }}
                  </el-tag>
                </div>
                <div class="folder-children" v-if="folder.children.length > 0">
                  <template v-for="child in folder.children" :key="child.label">
                    <!-- Sub-folder (consultation date) -->
                    <div v-if="!child.isFile" class="file-subfolder">
                      <div class="subfolder-header">
                        <el-icon color="#8e8e8e" :size="16"><Folder /></el-icon>
                        <span class="subfolder-name">{{ child.label }}</span>
                        <el-tag size="small" type="info" effect="plain" style="margin-left: 4px">
                          {{ child.children?.length || 0 }}
                        </el-tag>
                      </div>
                      <div class="subfolder-children" v-if="child.children?.length > 0">
                        <div v-for="file in child.children" :key="file.label" class="file-item">
                          <el-icon color="#2d6a4f" :size="14"><Document /></el-icon>
                          <button v-if="file.url" type="button" class="file-link file-link-button" @click="openPatientFile(file)">{{ file.label }}</button>
                          <span v-else class="file-name">{{ file.label }}</span>
                          <span v-if="file.date" class="file-date">{{ formatDate(file.date) }}</span>
                          <el-button v-if="file.url" size="small" text type="primary" @click.stop="downloadFile(file)" :title="t('patientDetail.download')">
                            <el-icon><Download /></el-icon>
                          </el-button>
                        </div>
                      </div>
                    </div>
                    <!-- File -->
                    <div v-else class="file-item">
                      <el-icon color="#2d6a4f" :size="14"><Document /></el-icon>
                      <button v-if="child.url" type="button" class="file-link file-link-button" @click="openPatientFile(child)">{{ child.label }}</button>
                      <span v-else class="file-name">{{ child.label }}</span>
                      <span v-if="child.date" class="file-date">{{ formatDate(child.date) }}</span>
                      <el-button v-if="child.url" size="small" text type="primary" @click.stop="downloadFile(child)" :title="t('patientDetail.download')">
                        <el-icon><Download /></el-icon>
                      </el-button>
                    </div>
                  </template>
                </div>
                <div v-else class="folder-empty">
                  {{ t('patientDetail.noFilesInFolder') }}
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

      </el-tabs>
    </el-card>
  </div>

  <div v-else-if="patient && !hasAccess" class="not-found">
    <el-empty :description="t('patientDetail.accessExpired')">
      <template #description>
        <p>{{ t('patientDetail.accessExpiredMsg') }}</p>
        <p>{{ t('patientDetail.accessExpiredHelp') }}</p>
      </template>
    </el-empty>
    <el-button @click="$router.push('/patients')">{{ t('patientDetail.backToList') }}</el-button>
  </div>

  <div v-else class="not-found">
    <el-empty :description="t('patientDetail.notFound')" />
    <el-button @click="$router.push('/patients')">{{ t('patientDetail.backToList') }}</el-button>
  </div>

  <!-- 知情同意书签署对话框 -->
  <el-drawer v-model="showConsentDialog" :title="t('patientDetail.signConsentDialog')" size="600px" direction="rtl" :close-on-press-escape="true">
    <div style="max-height: 300px; overflow-y: auto; padding: 16px; background: #f9f9f9; border-radius: 8px; margin-bottom: 16px; font-size: 14px; line-height: 1.8; color: #555">
      <h3 style="color:#1b4332; margin-bottom: 4px">{{ consentTemplate.title }}</h3>
      <p v-if="consentTemplate.version" style="margin-top:0;color:#888;font-size:12px">Version: {{ consentTemplate.version }}</p>
      <div v-for="(section, index) in consentSections" :key="section.key" class="consent-section-preview">
        <p><strong>{{ index + 1 }}. {{ section.title }}</strong></p>
        <p v-for="(paragraph, paragraphIndex) in section.paragraphs || []" :key="`${section.key}-${paragraphIndex}`">
          {{ paragraph }}
        </p>
      </div>
    </div>
    <el-form :model="consentForm" label-width="80px">
      <el-form-item v-for="section in consentSections" :key="`agree-${section.key}`">
        <el-checkbox v-model="consentForm.agreements[section.key]">
          {{ section.title }} · {{ t('patientDetail.consentAgree') }}
        </el-checkbox>
      </el-form-item>
      <el-form-item :label="t('patientDetail.signatureName')">
        <el-input v-model="consentForm.signatureName" :placeholder="t('patientDetail.signatureNamePlaceholder')" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showConsentDialog = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!allConsentAgreed || !consentForm.signatureName.trim()" @click="confirmConsent">{{ t('patientDetail.confirmSign') }}</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.patient-detail { max-width: 100%; }
.consent-section-preview { margin-top: 12px; padding-top: 10px; border-top: 1px solid #e5e7eb; }

/* ── 页头 ── */
.patient-header {
  background: #fff;
  border-radius: 12px;
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 16px;
  flex-wrap: wrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.patient-avatar-info {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.patient-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}
.patient-name-row h2 {
  font-size: 20px;
  color: #1b4332;
  margin: 0;
}

.patient-meta {
  font-size: 13px;
  color: #666;
  margin-bottom: 2px;
}

.patient-disease {
  font-size: 13px;
  color: #2d6a4f;
  font-weight: 500;
}

.patient-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

/* ── 主卡片 ── */
.detail-card {
  border-radius: 12px;
}

/* ── 区段标题 ── */
.section-title {
  font-size: 13px;
  font-weight: 700;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 2px solid #e8f5e9;
}

/* ── 信息描述 ── */
.info-desc { margin-bottom: 0; }

/* ── 时间线 ── */
.timeline-panel {
  max-height: 340px;
  overflow-y: auto;
  padding-right: 4px;
}

.timeline-consult {
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 6px;
  transition: background 0.15s;
}
.timeline-consult:hover { background: #f0faf4; }

.timeline-complaint {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.timeline-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeline-amount {
  font-size: 12px;
  color: #888;
}

/* ── 同意书 ── */
.consent-mini-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}
.consent-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── 编辑面板 ── */
.edit-save-panel {
  background: #f9fbe7;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  border: 1px dashed #ccc;
  margin-top: 28px;
}

/* ── 诊疗工具栏 ── */
.consult-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.consult-toolbar-left { display: flex; gap: 8px; }
.consult-count { font-size: 13px; color: #888; }

/* ── 对比模式 ── */
.compare-mode {
  background: #f8f9fa;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}
.compare-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 12px;
}
.compare-label { font-size: 14px; color: #555; }
.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.compare-old { border-left: 4px solid #bbb; }
.compare-new { border-left: 4px solid #2d6a4f; }

/* ── 空状态 ── */
.empty-consult {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px;
}

/* ── 同意书标签页 ── */
.consent-tab { padding: 8px 0; }
.consent-card { }
.consent-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  gap: 12px;
}
.consent-icon-row { margin-bottom: 4px; }
.consent-info { text-align: center; }

/* ── 关联记录 ── */
.related-tab { padding: 8px 0; }
.stat-card {
  text-align: center;
  padding: 8px;
}
.stat-icon { margin-bottom: 6px; }
.stat-num { font-size: 28px; font-weight: 700; color: #1b4332; }
.stat-label { font-size: 13px; color: #888; margin-top: 4px; }

/* ── 未找到 ── */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 60px;
}

/* ── 文件浏览器 ── */
.files-tab { padding: 8px 0; }
.files-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.files-count { font-size: 13px; color: #888; }

.file-tree-container { }
.file-folder {
  background: #f9fafb; border: 1px solid #eee; border-radius: 8px;
  margin-bottom: 10px; overflow: hidden;
}
.folder-header {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  background: #f0f2f5; font-weight: 600; font-size: 14px; color: #333;
}
.folder-name { flex: 1; }
.folder-children { padding: 6px 14px 10px 32px; }
.folder-empty { padding: 8px 14px 10px 32px; font-size: 13px; color: #bbb; }

.file-subfolder { margin-bottom: 6px; }
.subfolder-header {
  display: flex; align-items: center; gap: 6px; padding: 4px 0;
  font-size: 13px; font-weight: 600; color: #555;
}
.subfolder-name { flex: 1; }
.subfolder-children { padding-left: 22px; }

.file-item {
  display: flex; align-items: center; gap: 6px; padding: 4px 0;
  font-size: 13px;
}
.file-link {
  color: #2d6a4f; text-decoration: none; flex: 1;
}
.file-link:hover { text-decoration: underline; }
.file-link-button {
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.file-name { color: #555; flex: 1; }
.file-date { color: #aaa; font-size: 12px; }

@media (max-width: 767px) {
  .patient-header,
  .patient-avatar-info,
  .card-header,
  .consult-toolbar,
  .files-toolbar,
  .compare-nav {
    align-items: flex-start;
    flex-direction: column;
  }

  .patient-actions,
  .consult-toolbar-left,
  .files-toolbar {
    width: 100%;
  }

  .patient-actions :deep(.el-button),
  .consult-toolbar-left :deep(.el-button),
  .files-toolbar :deep(.el-button) {
    width: 100%;
    justify-content: center;
    margin-left: 0;
  }

  :deep(.el-row) {
    row-gap: 12px;
  }

  :deep(.el-col) {
    max-width: 100%;
    flex: 0 0 100%;
  }

  .compare-grid {
    grid-template-columns: 1fr;
  }

  .folder-children,
  .subfolder-children {
    padding-left: 12px;
  }

  .file-item {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>
