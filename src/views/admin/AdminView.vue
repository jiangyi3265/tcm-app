<script setup>
import { ref, computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'
import { usePatientsStore } from '../../stores/patients'
import { useConsultationsStore } from '../../stores/consultations'
import { useInventoryStore } from '../../stores/inventory'
import { useBranchesStore } from '../../stores/branches'
import { useFormulasStore } from '../../stores/formulas'
import { useSuppliersStore } from '../../stores/suppliers'
import { useAcupointsStore } from '../../stores/acupoints'
import { useUnitConversionsStore } from '../../stores/unitConversions'
import { useHerbDictStore } from '../../stores/herbDict'
import { useMeridiansStore } from '../../stores/meridians'
import { useTemplatesStore } from '../../stores/templates'
import { ROLE_LABELS, ROLE_COLORS } from '../../utils/permissions'
import { PRACTITIONER_COLORS, ROOM_COLORS, resolvePractitionerColor, resolveRoomColor } from '../../utils/colorPalette'
import { formatDate, formatDateTime } from '../../utils/dateUtils'
import {
  WEEKDAYS,
  createEmptyWorkingRange,
  normalizeWorkingHoursForForm,
  buildWorkingHoursPayload,
  validateWorkingHours,
} from '../../utils/workingHours'
import { bindHerbSelection } from '../../utils/herbBinding'
import { parseCsvText, rowsToObjects, toNumber } from '../../utils/csvImport'
import { ElMessage, ElMessageBox } from 'element-plus'
import { authApi, bootstrapApi, usersApi } from '../../utils/api'

const { t } = useI18n()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const patientsStore = usePatientsStore()
const consultationsStore = useConsultationsStore()
const inventoryStore = useInventoryStore()
const branchesStore = useBranchesStore()
const formulasStore = useFormulasStore()
const suppliersStore = useSuppliersStore()
const acupointsStore = useAcupointsStore()
const unitConversionsStore = useUnitConversionsStore()
const herbDictStore = useHerbDictStore()
const meridiansStore = useMeridiansStore()
const templatesStore = useTemplatesStore()

const activeTab = ref('users')

const herbOptions = computed(() => herbDictStore.activeHerbs)
const CURRENCY_OPTIONS = [
  { value: 'CAD', label: 'Canadian Dollar CAD' },
  { value: 'USD', label: 'US Dollar USD' },
]
const currentCurrency = computed(() => settingsStore.currency || 'CAD')
const TOXICITY_OPTIONS = ['无毒', '小毒', '有毒', '大毒']
const SERVICE_TAG_OPTIONS = computed(() => ([
  { value: 'acupuncture', label: t('admin.tagAcupuncture') },
  { value: 'moxibustion', label: t('admin.tagMoxibustion') },
  { value: 'herbs', label: t('admin.tagHerbs') },
  { value: 'tuina', label: t('admin.tagTuina') },
  { value: 'consultation', label: t('admin.tagConsultation') },
]))

function getServiceTagLabel(tag) {
  const matched = SERVICE_TAG_OPTIONS.value.find((item) => item.value === tag)
  return matched?.label || tag || t('admin.tagNone')
}

function createHerbDraft() {
  return {
    name: '',
    alias: '',
    pinyin: '',
    category: '',
    nature: '',
    taste: '',
    toxicity: '无毒',
    meridianTropism: '',
    efficacy: '',
    indication: '',
    dosageRange: '',
    contraindication: '',
    notes: '',
  }
}

function createFormulaHerbDraft() {
  return { herbDictId: null, herbName: '', dosage: 0, unit: 'g', notes: '' }
}

function applyHerbSelection(target, herbId) {
  return bindHerbSelection(target, herbDictStore.getHerb(herbId), { nameKey: 'herbName' })
}

function syncDraftHerb(draftRef, herbId) {
  draftRef.value = applyHerbSelection(draftRef.value, herbId)
}

function syncRowHerb(row, herbId) {
  Object.assign(row, applyHerbSelection(row, herbId))
}

function formatMoney(value) {
  return `${currentCurrency.value} ${Number(value || 0).toFixed(2)}`
}

function normalizeAdminList(list = []) {
  return [...new Set((Array.isArray(list) ? list : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean))]
}

function validateFormulaHerbs(items = []) {
  if (items.some((item) => !item.herbDictId)) {
    ElMessage.warning(t('inventory.selectHerbRequired'))
    return false
  }
  return true
}

// ========== User management ==========
const showAddUserDialog = ref(false)
const newUser = ref({ name: '', email: '', password: '', roles: ['practitioner'], phone: '', color: PRACTITIONER_COLORS[0], regulatoryBody: '', registrationNumber: '', overlap1: 20, overlap2: 10, dripEnabled: true })


function resolveInterval(raw, user) {
  if (raw === 'overlap1') return Number(user?.overlap1 ?? 20) || 20
  if (raw === 'overlap2') return Number(user?.overlap2 ?? 10) || 10
  const num = Number(raw)
  return Number.isFinite(num) && num > 0 ? num : null
}

function formatIntervalOption(value, user) {
  if (value === 'overlap1') return `overlap1 (${Number(user?.overlap1 ?? 20) || 20}min)`
  if (value === 'overlap2') return `overlap2 (${Number(user?.overlap2 ?? 10) || 10}min)`
  return `${value}min`
}

async function handleAddUser() {
  if (!newUser.value.name || !newUser.value.email || !newUser.value.password) {
    return ElMessage.warning(t('admin.fillRequired'))
  }
  if (newUser.value.password.length < 8) {
    return ElMessage.warning(t('admin.passwordTooShort'))
  }
  try {
    const created = await authStore.addUser({ ...newUser.value })
    // 自动在病人列表中建档
    try {
      await patientsStore.ensureStaffPatient(created)
    } catch (e) {
      console.warn('Auto-create staff patient failed:', e)
    }
    ElMessage.success(t('admin.userCreated'))
    showAddUserDialog.value = false
    newUser.value = {
      name: '', email: '', password: '', roles: ['practitioner'], phone: '',
      color: PRACTITIONER_COLORS[Math.floor(Math.random() * PRACTITIONER_COLORS.length)],
      regulatoryBody: '', registrationNumber: '', overlap1: 20, overlap2: 10, dripEnabled: true,
    }
  } catch (e) {
    ElMessage.error(e.message || t('admin.userCreateFailed'))
  }
}

async function deleteUser(user) {
  if (user.id === authStore.userId) return ElMessage.error(t('admin.cannotDeleteSelf'))
  try {
    await ElMessageBox.confirm(t('admin.confirmDeleteUser', { name: user.name }), t('admin.confirmDeleteTitle'), { type: 'warning' })
    await authStore.deleteUser(user.id)
    ElMessage.success(t('admin.deleted'))
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || t('admin.deleteFailed'))
  }
}

const editingUserId = ref(null)
const editUserForm = ref({})

function startEditUser(user) {
  editingUserId.value = user.id
  // Normalize legacy single-role data into a roles array.
  const userRoles = Array.isArray(user.roles) && user.roles.length > 0
    ? [...user.roles]
    : user.role ? [user.role] : ['practitioner']
  editUserForm.value = {
    ...user,
    roles: userRoles,
    appointmentInterval: settingsStore.getPractitionerInterval(user.id),
    color: user.color || resolvePractitionerColor(user),
    regulatoryBody: user.regulatoryBody || '',
    registrationNumber: user.registrationNumber || '',
    overlap1: Number(user.overlap1 ?? 20) || 20,
    overlap2: Number(user.overlap2 ?? 10) || 10,
    dripEnabled: user.dripEnabled !== false,
  }
}

async function saveEditUser() {
  try {
    // 保存预约间隔到settings
    if (editUserForm.value.appointmentInterval !== undefined) {
      await settingsStore.setPractitionerInterval(editingUserId.value, editUserForm.value.appointmentInterval)
    }
    const { appointmentInterval, ...userData } = editUserForm.value
    const updated = await authStore.updateUser(editingUserId.value, userData)
    // 同步更新对应的病人档案（姓名、邮箱、电话等）
    try {
      await patientsStore.ensureStaffPatient(updated)
    } catch (e) {
      console.warn('Sync staff patient on update failed:', e)
    }
    editingUserId.value = null
    ElMessage.success(t('admin.saved'))
  } catch (e) {
    ElMessage.error(e.message || t('admin.saveFailed'))
  }
}

// ========== Practitioner profile drawer ==========
const showProfileDrawer = ref(false)
const profileTarget = ref(null)
const profileForm = ref({
  prescriptionPreference: '',
  regulatoryBody: '',
  title: '',
  registrationNumber: '',
  practitionerSortOrder: null,
  serviceKeys: [],
  internshipDates: [],
  homeAddress: { street: '', city: '', province: '', postalCode: '', country: '' },
  workingHours: {},
  dripEnabled: true
})
const WEEKDAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }

function getUserRoles(user) {
  return Array.isArray(user?.roles) && user.roles.length > 0
    ? user.roles
    : user?.role ? [user.role] : []
}

function isPractitionerUser(user) {
  return getUserRoles(user).includes('practitioner') || getUserRoles(user).includes('doctor')
}

function isApprenticeUser(user) {
  return getUserRoles(user).includes('apprentice')
}

function addWorkingHourRange(day) {
  if (!profileForm.value.workingHours[day]) {
    profileForm.value.workingHours[day] = []
  }
  profileForm.value.workingHours[day].push(createEmptyWorkingRange())
}

function removeWorkingHourRange(day, index) {
  const ranges = profileForm.value.workingHours?.[day]
  if (!Array.isArray(ranges) || ranges.length === 0) return
  ranges.splice(index, 1)
  if (ranges.length === 0) {
    profileForm.value.workingHours[day] = [createEmptyWorkingRange()]
  }
}

const servicePermissionOptions = computed(() =>
  Object.entries(settingsStore.serviceTypes || {}).map(([key, config]) => ({
    value: key,
    label: config?.label || key,
  })),
)

function getWorkingHoursValidationMessage(result) {
  if (!result || result.ok) return ''
  switch (result.code) {
    case 'incomplete':
      return t('admin.workingHoursIncomplete')
    case 'granularity':
      return t('admin.workingHoursGranularity')
    case 'order':
      return t('admin.workingHoursInvalidRange')
    case 'overlap':
      return t('admin.workingHoursOverlap')
    default:
      return t('admin.workingHoursInvalid')
  }
}

const profileTargetRoles = computed(() => getUserRoles(profileTarget.value))
const profileSupportsScheduling = computed(() => profileTargetRoles.value.includes('practitioner') || profileTargetRoles.value.includes('doctor'))
const profileSupportsInternship = computed(() => profileTargetRoles.value.includes('apprentice'))

function openProfileDrawer(user) {
  profileTarget.value = user
  profileForm.value = {
    prescriptionPreference: user.prescriptionPreference || '',
    regulatoryBody: user.regulatoryBody || '',
    title: user.title || '',
    registrationNumber: user.registrationNumber || '',
    practitionerSortOrder: user.practitionerSortOrder ?? null,
    serviceKeys: [...(user.serviceKeys || [])],
    internshipDates: [...(user.internshipDates || [])],
    homeAddress: {
      street: user.homeAddress?.street || '',
      city: user.homeAddress?.city || '',
      province: user.homeAddress?.province || '',
      postalCode: user.homeAddress?.postalCode || '',
      country: user.homeAddress?.country || ''
    },
    workingHours: normalizeWorkingHoursForForm(user.workingHours || {}),
    dripEnabled: user.dripEnabled !== false
  }
  showProfileDrawer.value = true
}

async function saveProfile() {
  try {
    const validation = validateWorkingHours(profileForm.value.workingHours)
    if (!validation.ok) {
      return ElMessage.warning(getWorkingHoursValidationMessage(validation))
    }
    const payload = {
      ...profileForm.value,
      workingHours: buildWorkingHoursPayload(profileForm.value.workingHours),
      serviceKeys: [...(profileForm.value.serviceKeys || [])],
      internshipDates: [...(profileForm.value.internshipDates || [])],
    }
    const updated = await authStore.updateUser(profileTarget.value.id, payload)
    profileTarget.value = updated
    showProfileDrawer.value = false
    ElMessage.success(t('admin.profileSaved'))
  } catch (e) {
    // Show the backend detail when profile saving fails.
    const detail = e.response?.data?.msg || e.message || t('admin.saveFailed')
    console.error('Profile save error:', e, 'Response:', e.response?.data)
    ElMessage.error(`${t('admin.saveFailed')}: ${detail}`)
  }
}

async function handleInternshipToday(user = profileTarget.value) {
  if (!user?.id) return
  try {
    const updated = await usersApi.addInternshipToday(user.id)
    authStore.syncUser(updated)
    if (profileTarget.value?.id === updated.id) {
      profileTarget.value = updated
      profileForm.value.internshipDates = [...(updated.internshipDates || [])]
    }
    ElMessage.success(t('admin.internshipAddedToday'))
  } catch (e) {
    ElMessage.error(e.message || t('admin.saveFailed'))
  }
}

// ========== Admin password reset ==========
const showResetPwdDialog = ref(false)
const resetPwdTarget = ref(null)
const resetPwdNew = ref('')

function openResetPwd(user) {
  resetPwdTarget.value = user
  resetPwdNew.value = ''
  showResetPwdDialog.value = true
}

async function handleResetPwd() {
  if (!resetPwdNew.value || resetPwdNew.value.length < 8) {
    return ElMessage.warning(t('admin.passwordTooShort'))
  }
  try {
    await authApi.resetPassword(resetPwdTarget.value.id, resetPwdNew.value)
    ElMessage.success(t('admin.passwordResetSuccess', { name: resetPwdTarget.value.name }))
    showResetPwdDialog.value = false
  } catch (e) {
    ElMessage.error(e?.message || t('admin.passwordResetFailed'))
  }
}

// ========== System settings ==========
const settingsForm = reactive({
  taxRate: settingsStore.taxRate,
  practitionerInterval: settingsStore.practitionerInterval,
  publicBookingAdvanceDays: settingsStore.publicBookingAdvanceDays,
  publicBookingDripWindowDays: settingsStore.publicBookingDripWindowDays,
  publicBookingDripMinutes: settingsStore.publicBookingDripMinutes,
  profitRatio: settingsStore.profitRatio,
  clinicName: settingsStore.clinicName,
  clinicAddress: settingsStore.clinicAddress,
  clinicPhone: settingsStore.clinicPhone,
  currency: settingsStore.currency || 'CAD',
})
const practitionerProfileForm = reactive({ ...settingsStore.practitionerProfile })

const EMAIL_TEMPLATE_LABELS = {
  appointmentConfirmation: '预约确认',
  appointmentCancellation: '预约取消',
  consultationRecord: '问诊记录',
  invoice: '发票',
  reminder: '提醒',
  consent: '知情同意书',
  intake: '就诊资料表',
}
const emailTemplateDrafts = reactive(
  Object.fromEntries(Object.entries(settingsStore.emailTemplates).map(([key, value]) => [key, { ...value }])),
)
const signaturePreviewUrl = ref(settingsStore.thirdPartySignature.url || '')
const uploadingSignature = ref(false)
const importCsvText = ref('')
const importingCsv = ref(false)
const csvImportForm = reactive({ target: 'herbs' })
const CSV_IMPORT_TARGETS = [
  { value: 'herbs', label: '草药' },
  { value: 'inventory', label: '库存' },
  { value: 'differentiation', label: '辨证' },
  { value: 'acupoints', label: '针灸穴位' },
  { value: 'patients', label: '病人' },
]
const CSV_IMPORT_HINTS = {
  herbs: 'name,category,nature,taste,meridianTropism,toxicity,efficacy,dosageRange',
  inventory: 'name,category,quantity,unit,pricePerUnit,supplier,minStockLevel,branchId',
  differentiation: 'name',
  acupoints: 'name,pinyin,englishName,meridian,location,indication,method',
  patients: 'firstName,lastName,email,phone,dateOfBirth,gender,address,notes',
}

const adminListDrafts = reactive({
  patentMedicines: normalizeAdminList(settingsStore.patentMedicines).join('\n'),
  formulaCategories: normalizeAdminList(settingsStore.formulaCategories).join('\n'),
  differentiationNames: normalizeAdminList(settingsStore.differentiationNames).join('\n'),
})
const patentMedicineRows = computed(() =>
  normalizeAdminList(settingsStore.patentMedicines).map((name) => ({ name })),
)

async function saveSettings() {
  await settingsStore.updateSettings({
    taxRate: Number(settingsForm.taxRate),
    practitionerInterval: Number(settingsForm.practitionerInterval),
    publicBookingAdvanceDays: Number(settingsForm.publicBookingAdvanceDays),
    publicBookingDripWindowDays: Number(settingsForm.publicBookingDripWindowDays),
    publicBookingDripMinutes: Number(settingsForm.publicBookingDripMinutes),
    profitRatio: Number(settingsForm.profitRatio),
    clinicName: settingsForm.clinicName,
    clinicAddress: settingsForm.clinicAddress,
    clinicPhone: settingsForm.clinicPhone,
    currency: settingsForm.currency || 'CAD',
    practitionerProfile: { ...practitionerProfileForm },
  })
  ElMessage.success(t('admin.settingsSaved'))
}

async function saveEmailTemplates() {
  await settingsStore.updateSettings({ emailTemplates: { ...emailTemplateDrafts } })
  ElMessage.success(t('admin.settingsSaved'))
}

async function handleSignatureUpload(file) {
  const rawFile = file.raw || file
  if (rawFile.type && rawFile.type !== 'image/png') {
    ElMessage.warning('请上传 PNG 签名图片')
    return false
  }
  uploadingSignature.value = true
  try {
    const uploaded = await settingsStore.uploadSignaturePng(rawFile)
    signaturePreviewUrl.value = uploaded.url || ''
    ElMessage.success('签名已上传')
  } catch (e) {
    ElMessage.error(e.message || '签名上传失败')
  } finally {
    uploadingSignature.value = false
  }
  return false
}

function handleCsvFileUpload(file) {
  const reader = new FileReader()
  reader.onload = (e) => { importCsvText.value = e.target.result }
  reader.readAsText(file.raw || file)
  return false
}

async function handleCsvImport() {
  if (!importCsvText.value.trim()) return ElMessage.warning('请输入或上传 CSV 数据')
  importingCsv.value = true
  try {
    const rows = parseCsvText(importCsvText.value)
    const count = await importCsvRows(csvImportForm.target, rows)
    ElMessage.success(`导入完成，处理 ${count} 条记录`)
    importCsvText.value = ''
  } catch (e) {
    ElMessage.error(e.message || 'CSV 导入失败')
  } finally {
    importingCsv.value = false
  }
}

async function importCsvRows(target, rows) {
  if (target === 'herbs') {
    const items = rowsToObjects(rows, {
      name: ['name', '名称', '草药', '草药名'],
      category: ['category', '分类', '类别'],
      nature: ['nature', '性味', '药性', '性'],
      taste: ['taste', '味'],
      meridianTropism: ['meridiantropism', '归经', '经络'],
      toxicity: ['toxicity', '毒性'],
      efficacy: ['efficacy', '功效'],
      dosageRange: ['dosagerange', '剂量'],
    }, ['name', 'category', 'nature', 'taste', 'meridianTropism', 'toxicity', 'efficacy', 'dosageRange'])
    let created = 0
    for (const item of items) {
      if (!item.name || herbDictStore.activeHerbs.some((h) => h.name === item.name)) continue
      await herbDictStore.addHerb({ ...createHerbDraft(), ...item, toxicity: item.toxicity || '无毒' })
      created += 1
    }
    return created
  }
  if (target === 'inventory') {
    const items = rowsToObjects(rows, {
      name: ['name', '名称', '库存名'],
      category: ['category', '分类'],
      quantity: ['quantity', '数量', '库存'],
      unit: ['unit', '单位'],
      pricePerUnit: ['priceperunit', '单价', '成本'],
      supplier: ['supplier', '供应商'],
      supplierId: ['supplierid', '供应商id'],
      minStockLevel: ['minstocklevel', '最低库存'],
      branchId: ['branchid', '分店id'],
    }, ['name', 'category', 'quantity', 'unit', 'pricePerUnit', 'supplier', 'minStockLevel', 'branchId'])
      .filter((item) => item.name)
      .map((item) => ({
        ...item,
        category: item.category || 'raw_herbs',
        quantity: toNumber(item.quantity),
        pricePerUnit: toNumber(item.pricePerUnit),
        minStockLevel: toNumber(item.minStockLevel, 10),
      }))
    const result = await inventoryStore.batchImport(items)
    return Number(result?.created || 0) + Number(result?.updated || 0)
  }
  if (target === 'differentiation') {
    const names = rows.map((row) => row[0]).map((name) => String(name || '').trim()).filter(Boolean)
    await settingsStore.updateSettings({
      differentiationNames: normalizeAdminList([...settingsStore.differentiationNames, ...names]),
    })
    adminListDrafts.differentiationNames = normalizeAdminList(settingsStore.differentiationNames).join('\n')
    return names.length
  }
  if (target === 'acupoints') {
    const items = rowsToObjects(rows, {
      name: ['name', '名称', '穴位'],
      pinyin: ['pinyin', '拼音'],
      englishName: ['englishname', '英文', '英文名'],
      meridian: ['meridian', '经络'],
      location: ['location', '定位'],
      indication: ['indication', '主治'],
      method: ['method', '手法'],
    }, ['name', 'pinyin', 'englishName', 'meridian', 'location', 'indication', 'method'])
    let created = 0
    for (const item of items) {
      if (!item.name || acupointsStore.activeAcupoints.some((a) => a.name === item.name)) continue
      await acupointsStore.addAcupoint(item)
      created += 1
    }
    return created
  }
  if (target === 'patients') {
    const items = rowsToObjects(rows, {
      firstName: ['firstname', '名', '名字'],
      lastName: ['lastname', '姓'],
      name: ['name', '姓名'],
      email: ['email', '邮箱'],
      phone: ['phone', '电话'],
      mobilePhone: ['mobilephone', '手机'],
      dateOfBirth: ['dateofbirth', 'dob', '生日'],
      gender: ['gender', '性别'],
      address: ['address', '地址'],
      notes: ['notes', '备注'],
    }, ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'gender', 'address', 'notes'])
    let created = 0
    for (const item of items) {
      const name = item.name || `${item.lastName || ''} ${item.firstName || ''}`.trim()
      if (!name) continue
      await patientsStore.addPatient({
        ...item,
        name,
        emails: item.email ? [item.email] : [],
        mobilePhone: item.mobilePhone || item.phone || '',
      })
      created += 1
    }
    return created
  }
  return 0
}

async function saveEditableLists() {
  await settingsStore.updateSettings({
    patentMedicines: normalizeAdminList(adminListDrafts.patentMedicines.split('\n')),
    formulaCategories: normalizeAdminList(adminListDrafts.formulaCategories.split('\n')),
    differentiationNames: normalizeAdminList(adminListDrafts.differentiationNames.split('\n')),
  })
  adminListDrafts.patentMedicines = normalizeAdminList(settingsStore.patentMedicines).join('\n')
  adminListDrafts.formulaCategories = normalizeAdminList(settingsStore.formulaCategories).join('\n')
  adminListDrafts.differentiationNames = normalizeAdminList(settingsStore.differentiationNames).join('\n')
  ElMessage.success(t('admin.settingsSaved'))
}

// ========== Data export ==========
const exporting = ref(false)
async function handleExportData() {
  exporting.value = true
  try {
    await bootstrapApi.exportData()
    ElMessage.success(t('admin.exportSuccess'))
  } catch (e) {
    ElMessage.error(e.message || t('admin.exportFailed'))
  } finally {
    exporting.value = false
  }
}

// ========== Room management ==========
const showAddRoomDialog = ref(false)
const newRoomName = ref('')
const newRoomTags = ref([])
const newRoomColor = ref(ROOM_COLORS[0])

async function handleAddRoom() {
  if (!newRoomName.value) return ElMessage.warning(t('admin.fillRoomName'))
  await settingsStore.addRoom({ name: newRoomName.value, supportTags: newRoomTags.value, color: newRoomColor.value })
  ElMessage.success(t('admin.roomAdded'))
  showAddRoomDialog.value = false
  newRoomName.value = ''
  newRoomTags.value = []
  newRoomColor.value = ROOM_COLORS[Math.floor(Math.random() * ROOM_COLORS.length)]
}

async function updateRoomColor(room, color) {
  await settingsStore.updateRoom(room.id, { color })
}

async function deleteRoom(room) {
  await ElMessageBox.confirm(t('admin.confirmDisableRoom', { name: room.name }), t('common.confirm'), { type: 'warning' })
  await settingsStore.updateRoom(room.id, { isActive: false })
  ElMessage.success(t('admin.disabled'))
}

async function renameRoom(room) {
  const nextName = prompt(t('admin.newName'), room.name) || room.name
  await settingsStore.updateRoom(room.id, { name: nextName })
  ElMessage.success(t('admin.roomRenamed'))
}

async function enableRoom(room) {
  await settingsStore.updateRoom(room.id, { isActive: true })
  ElMessage.success(t('admin.enabled'))
}

async function updateRoomTags(room, tags) {
  await settingsStore.updateRoom(room.id, { supportTags: tags })
}

// ========== Service type settings ==========
const serviceEditForm = ref({})
const editingServiceKey = ref(null)
const showAddServiceDialog = ref(false)
const newServiceForm = ref({
  key: '',
  label: '',
  duration: 40,
  practitionerTime: 'overlap1',
  defaultPrice: 100,
  requiredTag: '',
  roomRequired: true,
  publicVisible: true,
})

function resetNewServiceForm() {
  newServiceForm.value = {
    key: '',
    label: '',
    duration: 40,
    practitionerTime: 'overlap1',
    defaultPrice: 100,
    requiredTag: '',
    roomRequired: true,
    publicVisible: true,
  }
}

async function handleAddService() {
  const form = newServiceForm.value
  if (!form.label) return ElMessage.warning('请填写服务名称')
  // Auto-generate key from label if not provided
  const key = form.key || form.label.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').toLowerCase() || `service_${Date.now()}`
  if (settingsStore.serviceTypes[key]) {
    return ElMessage.warning('该服务标识已存在，请修改名称或标识')
  }
  await settingsStore.addServiceType(key, {
    label: form.label,
    duration: Number(form.duration),
    practitionerTime: form.practitionerTime,
    defaultPrice: Number(form.defaultPrice),
    requiredTag: form.requiredTag || '',
    roomRequired: Boolean(form.roomRequired),
    publicVisible: Boolean(form.publicVisible),
  })
  ElMessage.success(t('admin.saved'))
  showAddServiceDialog.value = false
  resetNewServiceForm()
}

function startEditService(key) {
  editingServiceKey.value = key
  const base = {
    roomRequired: true,
    requiredTag: '',
    publicVisible: true,
    ...settingsStore.serviceTypes[key],
  }
  if (!['overlap1', 'overlap2', 'full'].includes(base.practitionerTime)) {
    base.practitionerTime = 'overlap1'
  }
  serviceEditForm.value = base
}

async function saveServiceEdit() {
  const ptVal = serviceEditForm.value.practitionerTime
  const practitionerTime = ['overlap1', 'overlap2', 'full'].includes(ptVal) ? ptVal : 'overlap1'
  await settingsStore.updateServiceType(editingServiceKey.value, {
    label: serviceEditForm.value.label,
    defaultPrice: Number(serviceEditForm.value.defaultPrice),
    duration: Number(serviceEditForm.value.duration),
    practitionerTime,
    roomRequired: Boolean(serviceEditForm.value.roomRequired),
    requiredTag: serviceEditForm.value.requiredTag || '',
    publicVisible: Boolean(serviceEditForm.value.publicVisible),
  })
  editingServiceKey.value = null
  ElMessage.success(t('admin.saved'))
}

async function handleDeleteService(key, label) {
  try {
    await ElMessageBox.confirm(
      `确定删除服务类型「${label || key}」吗？`,
      '确认删除',
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' },
    )
    await settingsStore.deleteServiceType(key)
    ElMessage.success('已删除')
  } catch {
    // cancelled
  }
}

// ========== Price list management ==========
const showAddPriceListDialog = ref(false)
const newPriceList = ref({ name: '', effectiveDate: '', items: [] })
const newPriceItem = ref({ name: '', price: 0, taxable: true })

function addPriceItem() {
  if (!newPriceItem.value.name) return ElMessage.warning(t('admin.fillItemName'))
  newPriceList.value.items.push({ ...newPriceItem.value })
  newPriceItem.value = { name: '', price: 0, taxable: true }
}

function removePriceItem(idx) {
  newPriceList.value.items.splice(idx, 1)
}

async function handleAddPriceList() {
  if (!newPriceList.value.name) return ElMessage.warning(t('admin.fillPriceListName'))
  await settingsStore.addPriceList({ ...newPriceList.value })
  ElMessage.success(t('admin.priceListCreated'))
  showAddPriceListDialog.value = false
  newPriceList.value = { name: '', effectiveDate: '', items: [] }
}

async function deletePriceList(pl) {
  await ElMessageBox.confirm(t('admin.confirmDisablePriceList', { name: pl.name }), t('common.confirm'), { type: 'warning' })
  await settingsStore.deletePriceList(pl.id)
  ElMessage.success(t('admin.disabled'))
}

async function enablePriceList(pl) {
  await settingsStore.updatePriceList(pl.id, { isActive: true })
  ElMessage.success(t('admin.enabled'))
}

// Edit existing price list
const editingPriceListId = ref(null)
const editPriceListForm = ref({ name: '', effectiveDate: '', items: [] })
const editPriceItem = ref({ name: '', price: 0, taxable: true })

function startEditPriceList(pl) {
  editingPriceListId.value = pl.id
  editPriceListForm.value = {
    name: pl.name,
    effectiveDate: pl.effectiveDate || '',
    items: [...(pl.items || []).map(i => ({ ...i }))],
  }
}

function addEditPriceItem() {
  if (!editPriceItem.value.name) return ElMessage.warning(t('admin.fillItemName'))
  editPriceListForm.value.items.push({ ...editPriceItem.value })
  editPriceItem.value = { name: '', price: 0, taxable: true }
}

function removeEditPriceItem(idx) {
  editPriceListForm.value.items.splice(idx, 1)
}

async function saveEditPriceList() {
  if (!editPriceListForm.value.name) return ElMessage.warning(t('admin.fillPriceListName'))
  await settingsStore.updatePriceList(editingPriceListId.value, { ...editPriceListForm.value })
  editingPriceListId.value = null
  ElMessage.success(t('admin.priceListUpdated'))
}

function cancelEditPriceList() {
  editingPriceListId.value = null
}

// ========== 已删除数据管理（回收站）==========
function canPhysicalDelete(deletedAt) {
  if (!deletedAt) return false
  const deletedDate = new Date(deletedAt)
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  return deletedDate <= threeMonthsAgo
}

async function restorePatient(id) {
  await patientsStore.restorePatient(id)
  ElMessage.success(t('admin.patientRestored'))
}

async function physicalDeletePatient(id) {
  await ElMessageBox.confirm(t('admin.confirmPermanentDelete'), t('admin.permanentDeleteTitle'), { type: 'error' })
  const ok = await patientsStore.physicalDeletePatient(id)
  if (ok) ElMessage.success(t('admin.permanentlyDeleted'))
  else ElMessage.warning(t('admin.cannotDeleteYet'))
}

async function restoreConsultation(id) {
  await consultationsStore.restoreConsultation(id)
  ElMessage.success(t('admin.consultationRestored'))
}

async function physicalDeleteConsultation(id) {
  await ElMessageBox.confirm(t('admin.confirmPermanentDeleteConsultation'), t('admin.permanentDeleteTitle'), { type: 'error' })
  const ok = await consultationsStore.physicalDeleteConsultation(id)
  if (ok) ElMessage.success(t('admin.permanentlyDeleted'))
  else ElMessage.warning(t('admin.cannotDeleteYet'))
}

async function restoreInventoryItem(id) {
  await inventoryStore.restoreItem(id)
  ElMessage.success(t('admin.inventoryRestored'))
}

async function physicalDeleteInventoryItem(id) {
  await ElMessageBox.confirm(t('admin.confirmPermanentDeleteInventory'), t('admin.permanentDeleteTitle'), { type: 'error' })
  const ok = await inventoryStore.physicalDeleteItem(id)
  if (ok) ElMessage.success(t('admin.permanentlyDeleted'))
  else ElMessage.warning(t('admin.cannotDeleteYet'))
}

// ========== Branch management ==========
const showAddBranchDialog = ref(false)
const newBranch = ref({ name: '', code: '', address: '', phone: '', email: '', managerId: '', roomIds: [] })

async function handleAddBranch() {
  if (!newBranch.value.name) return ElMessage.warning(t('admin.fillBranchName'))
  await branchesStore.createBranch({ ...newBranch.value })
  ElMessage.success(t('admin.branchCreated'))
  showAddBranchDialog.value = false
  newBranch.value = { name: '', code: '', address: '', phone: '', email: '', managerId: '', roomIds: [] }
}

const editingBranchId = ref(null)
const editBranchForm = ref({})

function startEditBranch(branch) {
  editingBranchId.value = branch.id
  editBranchForm.value = { ...branch, roomIds: [...(branch.roomIds || [])] }
}

async function saveEditBranch() {
  await branchesStore.updateBranch(editingBranchId.value, editBranchForm.value)
  editingBranchId.value = null
  ElMessage.success(t('admin.saved'))
}

async function toggleBranch(branch) {
  if (branch.isMain) return ElMessage.warning(t('admin.cannotDisableMain'))
  await branchesStore.toggleBranch(branch.id)
  ElMessage.success(branch.isActive ? t('admin.disabled') : t('admin.enabled'))
}

async function deleteBranch(branch) {
  if (branch.isMain) return ElMessage.warning(t('admin.cannotDeleteMain'))
  try {
    await ElMessageBox.confirm(t('admin.confirmDeleteBranch', { name: branch.name }), t('admin.confirmDeleteTitle'), { type: 'warning' })
    const ok = await branchesStore.deleteBranch(branch.id)
    if (ok) ElMessage.success(t('admin.branchDeleted'))
    else ElMessage.warning(t('admin.cannotDeleteMain'))
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || t('admin.deleteFailed'))
  }
}

function getManagerName(managerId) {
  const user = authStore.users.find(u => u.id === managerId)
  return user?.name || '-'
}

// ========== Formula management ==========
const showAddFormulaDialog = ref(false)
const newFormula = ref({ name: '', category: '', description: '', source: '', items: [] })
const newFormulaHerb = ref(createFormulaHerbDraft())
const formulaCategoryOptions = computed(() => settingsStore.formulaCategories || [])

function addFormulaHerb() {
  if (!newFormulaHerb.value.herbDictId) return ElMessage.warning(t('inventory.selectHerbRequired'))
  newFormula.value.items.push({ ...newFormulaHerb.value, sortOrder: newFormula.value.items.length + 1 })
  newFormulaHerb.value = createFormulaHerbDraft()
}

function removeFormulaHerb(idx) {
  newFormula.value.items.splice(idx, 1)
}

async function handleAddFormula() {
  if (!newFormula.value.name) return ElMessage.warning(t('admin.fillFormulaName'))
  if (newFormula.value.items.length === 0) return ElMessage.warning(t('admin.fillFormulaHerbs'))
  if (!validateFormulaHerbs(newFormula.value.items)) return
  await formulasStore.addFormula({ ...newFormula.value })
  ElMessage.success(t('admin.formulaCreated'))
  showAddFormulaDialog.value = false
  newFormula.value = { name: '', category: '', description: '', source: '', items: [] }
}

const editingFormulaId = ref(null)
const editFormulaForm = ref({})
const editFormulaHerb = ref(createFormulaHerbDraft())

function startEditFormula(formula) {
  editingFormulaId.value = formula.id
  editFormulaForm.value = {
    name: formula.name,
    category: formula.category || '',
    description: formula.description || '',
    source: formula.source || '',
      items: [...(formula.items || []).map(i => ({ ...i }))],
  }
}

function addEditFormulaHerb() {
  if (!editFormulaHerb.value.herbDictId) return ElMessage.warning(t('inventory.selectHerbRequired'))
  editFormulaForm.value.items.push({ ...editFormulaHerb.value, sortOrder: editFormulaForm.value.items.length + 1 })
  editFormulaHerb.value = createFormulaHerbDraft()
}

function removeEditFormulaHerb(idx) {
  editFormulaForm.value.items.splice(idx, 1)
}

async function saveEditFormula() {
  if (!validateFormulaHerbs(editFormulaForm.value.items)) return
  await formulasStore.updateFormula(editingFormulaId.value, editFormulaForm.value)
  editingFormulaId.value = null
  ElMessage.success(t('admin.formulaUpdated'))
}

async function deleteFormula(formula) {
  await ElMessageBox.confirm(t('admin.confirmDeleteFormula', { name: formula.name }), t('admin.confirmDeleteTitle'), { type: 'warning' })
  await formulasStore.deleteFormula(formula.id)
  ElMessage.success(t('admin.formulaDeleted'))
}

// ========== 供应商管理 ==========
const showAddSupplierDialog = ref(false)
const newSupplier = ref({ name: '', contactPerson: '', phone: '', email: '', address: '', notes: '' })

async function handleAddSupplier() {
  if (!newSupplier.value.name) return ElMessage.warning(t('admin.fillSupplierName'))
  await suppliersStore.addSupplier({ ...newSupplier.value })
  ElMessage.success(t('admin.supplierCreated'))
  showAddSupplierDialog.value = false
  newSupplier.value = { name: '', contactPerson: '', phone: '', email: '', address: '', notes: '' }
}

const editingSupplierId = ref(null)
const editSupplierForm = ref({})

function startEditSupplier(supplier) {
  editingSupplierId.value = supplier.id
  editSupplierForm.value = { ...supplier }
}

async function saveEditSupplier() {
  await suppliersStore.updateSupplier(editingSupplierId.value, editSupplierForm.value)
  editingSupplierId.value = null
  ElMessage.success(t('admin.supplierUpdated'))
}

async function deleteSupplier(supplier) {
  await ElMessageBox.confirm(t('admin.confirmDeleteSupplier', { name: supplier.name }), t('admin.confirmDeleteTitle'), { type: 'warning' })
  await suppliersStore.deleteSupplier(supplier.id)
  ElMessage.success(t('admin.supplierDeleted'))
}

// ========== Acupoint management ==========
const showAddAcupointDialog = ref(false)
const showImportAcupointsDialog = ref(false)
const importAcupointsText = ref('')
const importingAcupoints = ref(false)
const newAcupoint = ref({ name: '', pinyin: '', englishName: '', meridian: '', location: '', indication: '', method: '', notes: '' })

async function handleAddAcupoint() {
  if (!newAcupoint.value.name) return ElMessage.warning(t('admin.fillAcupointName'))
  await acupointsStore.addAcupoint({ ...newAcupoint.value })
  ElMessage.success(t('admin.acupointCreated'))
  showAddAcupointDialog.value = false
  newAcupoint.value = { name: '', pinyin: '', englishName: '', meridian: '', location: '', indication: '', method: '', notes: '' }
}

const showEditAcupointDialog = ref(false)
const editAcupointForm = ref({})

function startEditAcupoint(acu) {
  editAcupointForm.value = { ...acu }
  showEditAcupointDialog.value = true
}

async function saveEditAcupoint() {
  await acupointsStore.updateAcupoint(editAcupointForm.value.id, editAcupointForm.value)
  showEditAcupointDialog.value = false
  ElMessage.success(t('admin.acupointUpdated'))
}

async function handleImportAcupoints() {
  if (!importAcupointsText.value.trim()) return ElMessage.warning('请输入导入数据')
  importingAcupoints.value = true
  try {
    const lines = importAcupointsText.value.trim().split('\n').filter(l => l.trim())
    let created = 0
    for (const line of lines) {
      const parts = line.split(/[,\t，]/).map(s => s.trim())
      if (!parts[0]) continue
      const existing = acupointsStore.activeAcupoints.find(a => a.name === parts[0])
      if (existing) continue
      await acupointsStore.addAcupoint({
        name: parts[0],
        pinyin: parts[1] || '',
        englishName: parts[2] || '',
        meridian: parts[3] || '',
        location: parts[4] || '',
        indication: parts[5] || '',
      })
      created++
    }
    ElMessage.success(`导入完成，新增 ${created} 个穴位`)
    showImportAcupointsDialog.value = false
    importAcupointsText.value = ''
  } catch (e) {
    ElMessage.error(e.message || '导入失败')
  } finally {
    importingAcupoints.value = false
  }
}

function handleAcupointFileUpload(file) {
  const reader = new FileReader()
  reader.onload = (e) => { importAcupointsText.value = e.target.result }
  reader.readAsText(file.raw || file)
  return false
}

async function deleteAcupoint(acu) {
  await ElMessageBox.confirm(t('admin.confirmDeleteAcupoint', { name: acu.name }), t('admin.confirmDeleteTitle'), { type: 'warning' })
  await acupointsStore.deleteAcupoint(acu.id)
  ElMessage.success(t('admin.acupointDeleted'))
}

// ========== Unit conversion management ==========
const showAddConversionDialog = ref(false)
const newConversion = ref({ fromUnit: '', toUnit: '', factor: 1, notes: '' })

async function handleAddConversion() {
  if (!newConversion.value.fromUnit || !newConversion.value.toUnit) return ElMessage.warning(t('admin.fillUnits'))
  await unitConversionsStore.addConversion({ ...newConversion.value })
  ElMessage.success(t('admin.conversionCreated'))
  showAddConversionDialog.value = false
  newConversion.value = { fromUnit: '', toUnit: '', factor: 1, notes: '' }
}

async function deleteConversion(c) {
  await ElMessageBox.confirm(t('admin.confirmDeleteConversion', { from: c.fromUnit, to: c.toUnit }), t('admin.confirmDeleteTitle'), { type: 'warning' })
  await unitConversionsStore.removeConversion(c.id)
  ElMessage.success(t('admin.conversionDeleted'))
}

// ========== Herb dictionary management ==========
const showAddHerbDialog = ref(false)
const showImportHerbsDialog = ref(false)
const importHerbsText = ref('')
const importingHerbs = ref(false)
const newHerb = ref(createHerbDraft())
const herbSearchQuery = ref('')
const herbCategoryFilter = ref('')

const filteredHerbs = computed(() => {
  let list = herbDictStore.activeHerbs
  if (herbCategoryFilter.value) list = list.filter(h => h.category === herbCategoryFilter.value)
  if (herbSearchQuery.value) {
    const q = herbSearchQuery.value.toLowerCase()
    list = list.filter(h => h.name.toLowerCase().includes(q) || (h.pinyin && h.pinyin.toLowerCase().includes(q)))
  }
  return list
})

async function handleAddHerb() {
  if (!newHerb.value.name) return ElMessage.warning(t('admin.fillHerbName'))
  await herbDictStore.addHerb({ ...newHerb.value })
  ElMessage.success(t('admin.herbCreated'))
  showAddHerbDialog.value = false
  newHerb.value = createHerbDraft()
}

const editingHerbId = ref(null)
const editHerbForm = ref({})
function startEditHerb(herb) { editingHerbId.value = herb.id; editHerbForm.value = { toxicity: '无毒', ...herb } }
async function saveEditHerb() {
  await herbDictStore.updateHerb(editingHerbId.value, editHerbForm.value)
  editingHerbId.value = null; ElMessage.success(t('admin.herbUpdated'))
}
async function deleteHerb(herb) {
  await ElMessageBox.confirm(t('admin.confirmDeleteHerb', { name: herb.name }), t('admin.confirmDeleteTitle'), { type: 'warning' })
  await herbDictStore.deleteHerb(herb.id); ElMessage.success(t('admin.herbDeleted'))
}

async function handleImportHerbs() {
  if (!importHerbsText.value.trim()) return ElMessage.warning('请输入导入数据')
  importingHerbs.value = true
  try {
    const lines = importHerbsText.value.trim().split('\n').filter(l => l.trim())
    let created = 0
    for (const line of lines) {
      const parts = line.split(/[,\t，]/).map(s => s.trim())
      if (!parts[0]) continue
      const existing = herbDictStore.activeHerbs.find(h => h.name === parts[0])
      if (existing) continue
      await herbDictStore.addHerb({
        name: parts[0],
        category: parts[1] || '',
        nature: parts[2] || '',
        taste: parts[3] || '',
        guijing: parts[4] || '',
        toxicity: parts[5] || '无毒',
        efficacy: parts[6] || '',
      })
      created++
    }
    ElMessage.success(`导入完成，新增 ${created} 味草药`)
    showImportHerbsDialog.value = false
    importHerbsText.value = ''
  } catch (e) {
    ElMessage.error(e.message || '导入失败')
  } finally {
    importingHerbs.value = false
  }
}

function handleHerbFileUpload(file) {
  const reader = new FileReader()
  reader.onload = (e) => { importHerbsText.value = e.target.result }
  reader.readAsText(file.raw || file)
  return false
}

// ========== Meridian management ==========
const showAddMeridianDialog = ref(false)
const newMeridian = ref({ name: '', englishName: '', abbr: '', category: '正经', organ: '', pathway: '', acupointCount: 0, indication: '', notes: '' })

async function handleAddMeridian() {
  if (!newMeridian.value.name) return ElMessage.warning(t('admin.fillMeridianName'))
  await meridiansStore.addMeridian({ ...newMeridian.value })
  ElMessage.success(t('admin.meridianCreated'))
  showAddMeridianDialog.value = false
  newMeridian.value = { name: '', englishName: '', abbr: '', category: '正经', organ: '', pathway: '', acupointCount: 0, indication: '', notes: '' }
}

const editingMeridianId = ref(null)
const editMeridianForm = ref({})
function startEditMeridian(m) { editingMeridianId.value = m.id; editMeridianForm.value = { ...m } }
async function saveEditMeridian() {
  await meridiansStore.updateMeridian(editingMeridianId.value, editMeridianForm.value)
  editingMeridianId.value = null; ElMessage.success(t('admin.meridianUpdated'))
}
async function deleteMeridian(m) {
  await ElMessageBox.confirm(t('admin.confirmDeleteMeridian', { name: m.name }), t('admin.confirmDeleteTitle'), { type: 'warning' })
  await meridiansStore.deleteMeridian(m.id); ElMessage.success(t('admin.meridianDeleted'))
}

// ========== Consultation template management ==========
const showAddTemplateDialog = ref(false)
const newTemplate = ref({ name: '', disease: '', category: '', description: '', acupoints: [], formulaIds: [], advice: '', notes: '' })
const newTemplateAcupoint = ref({ acupointId: '', name: '', method: '' })

function formatTemplateAcupoint(acu) {
  if (typeof acu === 'string') return acu
  if (!acu || typeof acu !== 'object') return ''
  return `${acu.name || ''}${acu.method ? '(' + acu.method + ')' : ''}`.trim()
}

function handleTemplateAcupointSelection(target, acupointId) {
  const acupoint = acupointsStore.activeAcupoints.find((item) => String(item.id) === String(acupointId))
  if (!acupoint) return
  target.name = acupoint.name || ''
  if (!target.method) target.method = acupoint.method || ''
}

function addTemplateAcupoint() {
  if (!newTemplateAcupoint.value.name) return
  newTemplate.value.acupoints.push({
    name: newTemplateAcupoint.value.name,
    method: newTemplateAcupoint.value.method || '',
  })
  newTemplateAcupoint.value = { acupointId: '', name: '', method: '' }
}
function removeTemplateAcupoint(idx) { newTemplate.value.acupoints.splice(idx, 1) }

async function handleAddTemplate() {
  if (!newTemplate.value.name) return ElMessage.warning(t('admin.fillTemplateName'))
  await templatesStore.addTemplate({ ...newTemplate.value })
  ElMessage.success(t('admin.templateCreated'))
  showAddTemplateDialog.value = false
  newTemplate.value = { name: '', disease: '', category: '', description: '', acupoints: [], formulaIds: [], advice: '', notes: '' }
  newTemplateAcupoint.value = { acupointId: '', name: '', method: '' }
}

const editingTemplateId = ref(null)
const editTemplateForm = ref({})
const editTemplateAcupoint = ref({ acupointId: '', name: '', method: '' })

function startEditTemplate(t) {
  editingTemplateId.value = t.id
  editTemplateForm.value = { ...t, acupoints: [...(t.acupoints || [])], formulaIds: [...(t.formulaIds || [])] }
}
function addEditTemplateAcupoint() {
  if (!editTemplateAcupoint.value.name) return
  editTemplateForm.value.acupoints.push({
    name: editTemplateAcupoint.value.name,
    method: editTemplateAcupoint.value.method || '',
  })
  editTemplateAcupoint.value = { acupointId: '', name: '', method: '' }
}
function removeEditTemplateAcupoint(idx) { editTemplateForm.value.acupoints.splice(idx, 1) }

async function saveEditTemplate() {
  await templatesStore.updateTemplate(editingTemplateId.value, editTemplateForm.value)
  editingTemplateId.value = null; ElMessage.success(t('admin.templateUpdated'))
}
async function deleteTemplate(tmpl) {
  await ElMessageBox.confirm(t('admin.confirmDeleteTemplate', { name: tmpl.name }), t('admin.confirmDeleteTitle'), { type: 'warning' })
  await templatesStore.deleteTemplate(tmpl.id); ElMessage.success(t('admin.templateDeleted'))
}
</script>

<template>
  <div class="admin-view">
    <el-tabs v-model="activeTab">
      <!-- User management -->
      <el-tab-pane :label="t('admin.usersTab')" name="users">
        <div class="tab-toolbar">
          <el-button type="primary" @click="showAddUserDialog = true">
            <el-icon><Plus /></el-icon> {{ t('admin.addUser') }}
          </el-button>
        </div>
        <el-table :data="authStore.users" stripe>
          <el-table-column :label="t('admin.name')" min-width="100">
            <template #default="{ row }">
              <div v-if="editingUserId === row.id">
                <el-input v-model="editUserForm.name" size="small" />
              </div>
              <div v-else style="display:flex; align-items:center; gap: 8px">
                <el-avatar :size="28" :style="{ background: resolvePractitionerColor(row), fontSize: '12px', color: '#fff' }">{{ (row.name || '?').charAt(0) }}</el-avatar>
                {{ row.name }}
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.email')" min-width="160">
            <template #default="{ row }">
              <div v-if="editingUserId === row.id">
                <el-input v-model="editUserForm.email" size="small" />
              </div>
              <span v-else style="color: #888">{{ row.email }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.role')" min-width="160">
            <template #default="{ row }">
              <div v-if="editingUserId === row.id">
                <el-select v-model="editUserForm.roles" multiple collapse-tags size="small" style="width: 150px">
                  <el-option v-for="(label, key) in ROLE_LABELS" :key="key" :label="label" :value="key" />
                </el-select>
              </div>
              <div v-else style="display: flex; flex-wrap: wrap; gap: 4px">
                <el-tag
                  v-for="r in (Array.isArray(row.roles) && row.roles.length > 0 ? row.roles : row.role ? [row.role] : [])"
                  :key="r"
                  :type="ROLE_COLORS[r]"
                  size="small"
                >{{ ROLE_LABELS[r] || r }}</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.phone')" width="130">
            <template #default="{ row }">
              <div v-if="editingUserId === row.id">
                <el-input v-model="editUserForm.phone" size="small" />
              </div>
              <span v-else>{{ row.phone }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.userBranch')" width="140">
            <template #default="{ row }">
              <div v-if="editingUserId === row.id">
                <el-select v-model="editUserForm.branchIds" multiple collapse-tags size="small" style="width:130px">
                  <el-option v-for="b in branchesStore.activeBranches" :key="b.id" :label="b.name" :value="b.id" />
                </el-select>
              </div>
              <span v-else style="font-size:12px; color:#888">{{ (row.branchIds || []).map(bid => branchesStore.getBranch(bid)?.name).filter(Boolean).join(', ') || t('admin.allBranches') }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.rxPreference')" width="130">
            <template #default="{ row }">
              <div v-if="editingUserId === row.id">
                <el-select v-model="editUserForm.prescriptionPreference" size="small" clearable style="width:120px">
                  <el-option label="Powder" value="powder" />
                  <el-option label="Raw Herbs" value="raw_herbs" />
                  <el-option label="Pills" value="pills" />
                </el-select>
              </div>
              <el-tag v-else-if="row.prescriptionPreference" size="small"
                :type="{ powder: 'warning', raw_herbs: 'success', pills: '' }[row.prescriptionPreference]">
                {{ { powder: 'Powder', raw_herbs: 'Raw Herbs', pills: 'Pills' }[row.prescriptionPreference] || row.prescriptionPreference }}
              </el-tag>
              <span v-else style="color:#bbb">-</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.appointmentInterval')" width="180">
            <template #default="{ row }">
              <div v-if="editingUserId === row.id && (row.role === 'practitioner' || (row.roles || []).includes('practitioner'))">
                <el-select v-model="editUserForm.appointmentInterval" size="small" style="width:160px">
                  <el-option label="overlap1(首诊)" value="overlap1" />
                  <el-option label="overlap2(复诊)" value="overlap2" />
                </el-select>
              </div>
              <span v-else-if="row.role === 'practitioner' || (row.roles || []).includes('practitioner')">
                {{ formatIntervalOption(settingsStore.getPractitionerInterval(row.id), row) }}
              </span>
              <span v-else style="color:#bbb">-</span>
            </template>
          </el-table-column>
          <el-table-column label="首诊时长(overlap1)" width="130">
            <template #default="{ row }">
              <div v-if="editingUserId === row.id && (row.role === 'practitioner' || (row.roles || []).includes('practitioner'))">
                <el-input-number v-model="editUserForm.overlap1" size="small" :min="5" :max="120" :step="5" style="width:110px" />
              </div>
              <span v-else-if="row.role === 'practitioner' || (row.roles || []).includes('practitioner')">
                {{ row.overlap1 || 20 }}min
              </span>
              <span v-else style="color:#bbb">-</span>
            </template>
          </el-table-column>
          <el-table-column label="复诊时长(overlap2)" width="130">
            <template #default="{ row }">
              <div v-if="editingUserId === row.id && (row.role === 'practitioner' || (row.roles || []).includes('practitioner'))">
                <el-input-number v-model="editUserForm.overlap2" size="small" :min="5" :max="120" :step="5" style="width:110px" />
              </div>
              <span v-else-if="row.role === 'practitioner' || (row.roles || []).includes('practitioner')">
                {{ row.overlap2 || 10 }}min
              </span>
              <span v-else style="color:#bbb">-</span>
            </template>
          </el-table-column>
          <el-table-column label="颜色" width="90" align="center">
            <template #default="{ row }">
              <el-color-picker v-if="editingUserId === row.id" v-model="editUserForm.color" size="small" :predefine="PRACTITIONER_COLORS" />
              <span v-else :style="{ display:'inline-block', width:'22px', height:'22px', borderRadius:'4px', background: resolvePractitionerColor(row) }" />
            </template>
          </el-table-column>
          <el-table-column label="组织" width="130">
            <template #default="{ row }">
              <el-input v-if="editingUserId === row.id" v-model="editUserForm.regulatoryBody" size="small" placeholder="如 CTCMPAO" />
              <span v-else>{{ row.regulatoryBody || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="注册号码" width="120">
            <template #default="{ row }">
              <el-input v-if="editingUserId === row.id" v-model="editUserForm.registrationNumber" size="small" placeholder="如 6995" />
              <span v-else>{{ row.registrationNumber || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.createdDate')" width="120">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column :label="t('admin.operation')" width="320" fixed="right">
            <template #default="{ row }">
              <div v-if="editingUserId === row.id">
                <el-button size="small" type="primary" text @click="saveEditUser">{{ t('common.save') }}</el-button>
                <el-button size="small" text @click="editingUserId = null">{{ t('common.cancel') }}</el-button>
              </div>
              <div v-else>
                <el-button size="small" text type="primary" @click="startEditUser(row)">{{ t('common.edit') }}</el-button>
                <el-button size="small" text type="success" @click="openProfileDrawer(row)">{{ t('admin.profile') }}</el-button>
                <el-button v-if="isApprenticeUser(row)" size="small" text type="warning" @click="handleInternshipToday(row)">{{ t('admin.addInternshipToday') }}</el-button>
                <el-button size="small" text type="warning" @click="openResetPwd(row)">{{ t('admin.resetPassword') }}</el-button>
                <el-button size="small" text type="danger" @click="deleteUser(row)" :disabled="row.id === authStore.userId">{{ t('common.delete') }}</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

    <!-- Reset password dialog -->
      <el-dialog v-model="showResetPwdDialog" :title="t('admin.resetPasswordTitle', { name: resetPwdTarget?.name || '' })" width="400px" :close-on-click-modal="false">
        <el-form label-width="80px">
          <el-form-item :label="t('admin.userLabel')">
            <span style="font-weight:600">{{ resetPwdTarget?.name }} ({{ resetPwdTarget?.email }})</span>
          </el-form-item>
          <el-form-item :label="t('header.newPassword')" required>
            <el-input v-model="resetPwdNew" type="password" show-password :placeholder="t('admin.newPasswordPh')" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showResetPwdDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="handleResetPwd">{{ t('admin.confirmReset') }}</el-button>
        </template>
      </el-dialog>

    <!-- Practitioner profile drawer -->
      <el-drawer v-model="showProfileDrawer" :title="t('admin.profileTitle', { name: profileTarget?.name || '' })" size="760px" direction="rtl">
        <el-form :model="profileForm" label-width="120px" label-position="top">
          <el-divider content-position="left">{{ t('admin.profileBasicInfo') }}</el-divider>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item :label="t('admin.profileTitle2')">
                <el-input v-model="profileForm.title" :placeholder="t('admin.profileTitlePh')" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item :label="t('admin.rxPreference')">
                <el-select v-model="profileForm.prescriptionPreference" clearable style="width:100%">
                  <el-option label="Powder" value="powder" />
                  <el-option label="Raw Herbs" value="raw_herbs" />
                  <el-option label="Pills" value="pills" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item :label="t('admin.profileRegulatoryBody')">
                <el-input v-model="profileForm.regulatoryBody" :placeholder="t('admin.profileRegulatoryBodyPh')" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item :label="t('admin.profileRegistrationNo')">
                <el-input v-model="profileForm.registrationNumber" :placeholder="t('admin.profileRegistrationNoPh')" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row v-if="profileSupportsScheduling" :gutter="16">
            <el-col :span="12">
              <el-form-item :label="t('admin.profilePractitionerSortOrder')">
                <el-input-number v-model="profileForm.practitionerSortOrder" :min="0" :step="1" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item :label="t('admin.profileDripEnabled')">
                <el-switch v-model="profileForm.dripEnabled" :active-text="t('common.yes') || 'Yes'" :inactive-text="t('common.no') || 'No'" />
                <div style="font-size:12px; color:#999; margin-top:4px">{{ t('admin.profileDripEnabledHint') }}</div>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row v-if="profileSupportsScheduling" :gutter="16">
            <el-col :span="12">
              <el-form-item :label="t('admin.profileServiceScope')">
                <el-select
                  v-model="profileForm.serviceKeys"
                  multiple
                  filterable
                  collapse-tags
                  :placeholder="t('admin.profileServiceScopePh')"
                  style="width:100%"
                >
                  <el-option
                    v-for="service in servicePermissionOptions"
                    :key="service.value"
                    :label="service.label"
                    :value="service.value"
                  />
                </el-select>
                <div class="profile-helper-text">{{ t('admin.profileServiceScopeHint') }}</div>
              </el-form-item>
            </el-col>
          </el-row>

          <el-divider content-position="left">{{ t('admin.profileHomeAddress') }}</el-divider>
          <el-form-item :label="t('admin.profileStreet')">
            <el-input v-model="profileForm.homeAddress.street" :placeholder="t('admin.profileStreetPh')" />
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item :label="t('admin.profileCity')">
                <el-input v-model="profileForm.homeAddress.city" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item :label="t('admin.profileProvince')">
                <el-input v-model="profileForm.homeAddress.province" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item :label="t('admin.profilePostalCode')">
                <el-input v-model="profileForm.homeAddress.postalCode" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item :label="t('admin.profileCountry')">
            <el-input v-model="profileForm.homeAddress.country" :placeholder="t('admin.profileCountryPh')" style="max-width:200px" />
          </el-form-item>

          <template v-if="profileSupportsScheduling">
            <el-divider content-position="left">{{ t('admin.profileWorkingHours') }}</el-divider>
            <div v-for="day in WEEKDAYS" :key="day" class="schedule-day-card">
              <div class="schedule-day-header">
                <span class="schedule-day-label">{{ WEEKDAY_LABELS[day] }}</span>
                <el-button size="small" text type="primary" @click="addWorkingHourRange(day)">{{ t('admin.addWorkingRange') }}</el-button>
              </div>
              <div class="schedule-range-list">
                <div v-for="(range, index) in profileForm.workingHours[day]" :key="`${day}-${index}`" class="schedule-range-row">
                  <el-time-select v-model="range.start" start="00:00" end="23:30" step="00:30" :placeholder="t('admin.profileStartTime')" size="small" style="width:140px" />
                  <span style="color:#999">{{ t('admin.profileRangeSeparator') }}</span>
                  <el-time-select v-model="range.end" start="00:00" end="23:30" step="00:30" :placeholder="t('admin.profileEndTime')" size="small" style="width:140px" />
                  <el-button size="small" text type="danger" @click="removeWorkingHourRange(day, index)">{{ t('common.delete') }}</el-button>
                </div>
              </div>
            </div>
          </template>

          <template v-if="profileSupportsInternship">
            <el-divider content-position="left">{{ t('admin.internshipRecords') }}</el-divider>
            <div class="internship-toolbar">
              <div class="profile-helper-text">{{ t('admin.internshipWindowHint') }}</div>
              <el-button size="small" type="warning" plain @click="handleInternshipToday()">{{ t('admin.addInternshipToday') }}</el-button>
            </div>
            <el-table
              :data="(profileForm.internshipDates || []).map((date, index) => ({ id: `${date}-${index}`, date }))"
              size="small"
              border
              :empty-text="t('admin.noInternshipRecords')"
            >
              <el-table-column prop="date" :label="t('common.date')" />
            </el-table>
          </template>
        </el-form>
        <template #footer>
          <el-button @click="showProfileDrawer = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="saveProfile">{{ t('common.save') }}</el-button>
        </template>
      </el-drawer>

      <!-- 绯荤粺璁剧疆 -->
      <el-tab-pane :label="t('admin.settingsTab')" name="settings">
        <el-card class="settings-card">
          <el-form :model="settingsForm" label-width="160px">
            <el-form-item :label="t('admin.clinicName')">
              <el-input v-model="settingsForm.clinicName" style="max-width: 300px" />
            </el-form-item>
            <el-form-item :label="t('admin.clinicAddress')">
              <el-input v-model="settingsForm.clinicAddress" style="max-width: 400px" />
            </el-form-item>
            <el-form-item :label="t('admin.clinicPhone')">
              <el-input v-model="settingsForm.clinicPhone" style="max-width: 200px" />
            </el-form-item>
            <el-form-item label="针灸师姓名">
              <el-input v-model="practitionerProfileForm.practitionerName" style="max-width: 300px" />
            </el-form-item>
            <el-form-item label="针灸师组织">
              <el-input v-model="practitionerProfileForm.organization" style="max-width: 300px" />
            </el-form-item>
            <el-form-item label="组织号">
              <el-input v-model="practitionerProfileForm.organizationNumber" style="max-width: 240px" />
            </el-form-item>
            <el-form-item label="系统货币">
              <el-select v-model="settingsForm.currency" style="max-width: 240px">
                <el-option v-for="option in CURRENCY_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
            <el-divider />
            <el-form-item :label="t('admin.defaultTaxRate')">
              <el-input-number
                v-model="settingsForm.taxRate"
                :min="0"
                :max="1"
                :step="0.01"
                :precision="2"
              />
              <span style="margin-left: 8px; color: #888; font-size: 13px">
                {{ t('admin.current') }}: {{ (settingsForm.taxRate * 100).toFixed(0) }}%
              </span>
            </el-form-item>
            <el-form-item :label="t('admin.practitionerInterval')">
              <el-input-number
                v-model="settingsForm.practitionerInterval"
                :min="5"
                :max="60"
                :step="5"
              />
              <span style="margin-left: 8px; color: #888; font-size: 13px">
                {{ t('admin.intervalDesc', { min: settingsForm.practitionerInterval }) }}
              </span>
            </el-form-item>
            <el-form-item :label="t('admin.publicBookingAdvanceDays')">
              <el-input-number
                v-model="settingsForm.publicBookingAdvanceDays"
                :min="1"
                :max="90"
                :step="1"
              />
              <span style="margin-left: 8px; color: #888; font-size: 13px">
                {{ t('admin.publicBookingAdvanceDaysDesc', { days: settingsForm.publicBookingAdvanceDays }) }}
              </span>
            </el-form-item>
            <el-form-item :label="t('admin.publicBookingDripWindowDays')">
              <el-input-number
                v-model="settingsForm.publicBookingDripWindowDays"
                :min="1"
                :max="30"
                :step="1"
              />
              <span style="margin-left: 8px; color: #888; font-size: 13px">
                {{ t('admin.publicBookingDripWindowDaysDesc', { days: settingsForm.publicBookingDripWindowDays }) }}
              </span>
            </el-form-item>
            <el-form-item :label="t('admin.publicBookingDripMinutes')">
              <el-input-number
                v-model="settingsForm.publicBookingDripMinutes"
                :min="10"
                :max="240"
                :step="10"
              />
              <span style="margin-left: 8px; color: #888; font-size: 13px">
                {{ t('admin.publicBookingDripMinutesDesc', { minutes: settingsForm.publicBookingDripMinutes }) }}
              </span>
            </el-form-item>
            <el-form-item :label="t('admin.profitRatio')">
              <el-input-number
                v-model="settingsForm.profitRatio"
                :min="0"
                :max="10"
                :step="0.1"
                :precision="2"
              />
              <span style="margin-left: 8px; color: #888; font-size: 13px">
                {{ t('admin.current') }}: {{ settingsForm.profitRatio }}x
              </span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveSettings">{{ t('admin.saveSettings') }}</el-button>
            </el-form-item>
          </el-form>
          <el-divider />
          <h4>后台可编辑下拉菜单</h4>
          <el-form label-width="160px">
            <el-form-item label="方剂种类">
              <el-input v-model="adminListDrafts.formulaCategories" type="textarea" :rows="4" placeholder="每行一个方剂种类" style="max-width: 420px" />
            </el-form-item>
            <el-form-item label="辨证名称">
              <el-input v-model="adminListDrafts.differentiationNames" type="textarea" :rows="5" placeholder="每行一个辨证名称" style="max-width: 420px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveEditableLists">{{ t('common.save') }}</el-button>
            </el-form-item>
          </el-form>
          <el-divider />
          <h4>后台 CSV 导入</h4>
          <el-form label-width="160px">
            <el-form-item label="导入类型">
              <el-select v-model="csvImportForm.target" style="max-width: 240px">
                <el-option v-for="option in CSV_IMPORT_TARGETS" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="CSV 文件">
              <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,.txt,.tsv" :on-change="handleCsvFileUpload">
                <el-button><el-icon><Upload /></el-icon> 选择 CSV</el-button>
              </el-upload>
            </el-form-item>
            <el-form-item label="CSV 内容">
              <el-input
                v-model="importCsvText"
                type="textarea"
                :rows="6"
                :placeholder="CSV_IMPORT_HINTS[csvImportForm.target]"
                style="max-width: 680px"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="importingCsv" @click="handleCsvImport">
                <el-icon><Upload /></el-icon> 导入 CSV
              </el-button>
            </el-form-item>
          </el-form>
          <el-divider />
          <h4>邮件模板</h4>
          <el-form label-width="160px">
            <div v-for="(draft, key) in emailTemplateDrafts" :key="key" class="email-template-editor">
              <div class="email-template-title">{{ EMAIL_TEMPLATE_LABELS[key] || key }}</div>
              <el-form-item label="标题">
                <el-input v-model="draft.subject" style="max-width: 520px" />
              </el-form-item>
              <el-form-item label="正文">
                <el-input v-model="draft.body" type="textarea" :rows="4" style="max-width: 680px" />
              </el-form-item>
            </div>
            <el-form-item>
              <el-button type="primary" @click="saveEmailTemplates">{{ t('common.save') }}</el-button>
            </el-form-item>
          </el-form>
          <el-divider />
          <h4>第三方签名 PNG</h4>
          <el-form label-width="160px">
            <el-form-item label="上传签名">
              <el-upload :auto-upload="false" :show-file-list="false" accept="image/png,.png" :on-change="handleSignatureUpload">
                <el-button :loading="uploadingSignature"><el-icon><Upload /></el-icon> 上传 PNG</el-button>
              </el-upload>
            </el-form-item>
            <el-form-item v-if="signaturePreviewUrl || settingsStore.thirdPartySignature.path" label="预览">
              <div class="signature-preview">
                <img v-if="signaturePreviewUrl" :src="signaturePreviewUrl" alt="third party signature" />
                <span v-else>{{ settingsStore.thirdPartySignature.path }}</span>
              </div>
            </el-form-item>
          </el-form>
          <el-divider />
          <h4>{{ t('admin.dataBackup') }}</h4>
          <p style="font-size:13px;color:#888;margin-bottom:12px">{{ t('admin.exportDataHint') }}</p>
          <el-button type="success" :loading="exporting" @click="handleExportData">
            <el-icon><Download /></el-icon> {{ t('admin.exportData') }}
          </el-button>
        </el-card>
      </el-tab-pane>

      <!-- Room management -->
      <el-tab-pane :label="t('admin.roomsTab')" name="rooms">
        <div class="tab-toolbar">
          <el-button type="primary" @click="showAddRoomDialog = true">
            <el-icon><Plus /></el-icon> {{ t('admin.addRoom') }}
          </el-button>
        </div>
        <el-table :data="settingsStore.rooms" stripe>
          <el-table-column prop="name" :label="t('admin.roomName')" min-width="160" />
          <el-table-column :label="t('admin.supportTags')" min-width="240">
            <template #default="{ row }">
              <el-checkbox-group :model-value="row.supportTags || []" @change="tags => updateRoomTags(row, tags)" size="small">
                <el-checkbox label="acupuncture">{{ t('admin.tagAcupuncture') }}</el-checkbox>
                <el-checkbox label="tuina">{{ t('admin.tagTuina') }}</el-checkbox>
                <el-checkbox label="consultation">{{ t('admin.tagConsultation') }}</el-checkbox>
                <el-checkbox label="herbs">{{ t('admin.tagHerbs') }}</el-checkbox>
                <el-checkbox label="moxibustion">{{ t('admin.tagMoxibustion') }}</el-checkbox>
              </el-checkbox-group>
            </template>
          </el-table-column>
          <el-table-column label="颜色" width="90" align="center">
            <template #default="{ row }">
              <el-color-picker :model-value="resolveRoomColor(row)" :predefine="ROOM_COLORS" size="small" @change="(c) => updateRoomColor(row, c)" />
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.status')" width="100">
            <template #default="{ row }">
              <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
                {{ row.isActive ? t('admin.active') : t('admin.inactive') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.operation')" width="150">
            <template #default="{ row }">
              <el-button size="small" text @click="renameRoom(row)">{{ t('admin.rename') }}</el-button>
              <el-button v-if="row.isActive" size="small" text type="danger" @click="deleteRoom(row)">{{ t('admin.disable') }}</el-button>
              <el-button v-else size="small" text type="success" @click="enableRoom(row)">{{ t('admin.enable') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Service type management -->
      <el-tab-pane :label="t('admin.servicesTab')" name="services">
        <div class="tab-toolbar">
          <el-button type="primary" @click="showAddServiceDialog = true">
            <el-icon><Plus /></el-icon> 添加服务类型
          </el-button>
        </div>
        <el-table :data="Object.entries(settingsStore.serviceTypes).map(([key, val]) => ({key, ...val}))" stripe>
          <el-table-column prop="label" :label="t('admin.serviceName')" min-width="140">
            <template #default="{ row }">
              <div v-if="editingServiceKey === row.key">
                <el-input v-model="serviceEditForm.label" size="small" style="width: 120px" />
              </div>
              <span v-else>{{ row.label }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.totalDuration')" width="140">
            <template #default="{ row }">
              <div v-if="editingServiceKey === row.key">
                <el-input-number v-model="serviceEditForm.duration" :min="5" size="small" style="width: 90px" />
              </div>
              <span v-else>{{ row.duration }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.practitionerTime')" width="180">
            <template #default="{ row }">
              <div v-if="editingServiceKey === row.key">
                <el-select v-model="serviceEditForm.practitionerTime" size="small" style="width: 150px">
                  <el-option label="overlap1(首诊)" value="overlap1" />
                  <el-option label="overlap2(复诊)" value="overlap2" />
                  <el-option label="全程(=总时长)" value="full" />
                </el-select>
              </div>
              <span v-else>{{ row.practitionerTime === 'overlap2' ? 'overlap2(复诊)' : row.practitionerTime === 'full' ? '全程(=总时长)' : 'overlap1(首诊)' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.defaultPrice')" width="140">
            <template #default="{ row }">
              <div v-if="editingServiceKey === row.key">
                <el-input-number v-model="serviceEditForm.defaultPrice" :min="0" size="small" style="width: 100px" />
              </div>
              <span v-else>{{ formatMoney(row.defaultPrice) }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.requiredTag')" width="130">
            <template #default="{ row }">
              <div v-if="editingServiceKey === row.key">
                <el-select v-model="serviceEditForm.requiredTag" size="small" clearable style="width: 110px">
                  <el-option
                    v-for="option in SERVICE_TAG_OPTIONS"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </div>
              <span v-else>{{ getServiceTagLabel(row.requiredTag) }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.roomRequired')" width="110">
            <template #default="{ row }">
              <div v-if="editingServiceKey === row.key">
                <el-switch v-model="serviceEditForm.roomRequired" />
              </div>
              <el-tag v-else :type="row.roomRequired ? '' : 'info'" size="small">{{ row.roomRequired ? t('common.yes') : t('common.no') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.publicVisible')" width="130">
            <template #default="{ row }">
              <div v-if="editingServiceKey === row.key">
                <el-switch v-model="serviceEditForm.publicVisible" />
              </div>
              <el-tag v-else :type="row.publicVisible !== false ? 'success' : 'danger'" size="small">{{ row.publicVisible !== false ? t('common.yes') : t('common.no') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.operation')" width="130">
            <template #default="{ row }">
              <div v-if="editingServiceKey === row.key">
                <el-button size="small" text type="primary" @click="saveServiceEdit">{{ t('common.save') }}</el-button>
                <el-button size="small" text @click="editingServiceKey = null">{{ t('common.cancel') }}</el-button>
              </div>
              <div v-else>
                <el-button size="small" text type="primary" @click="startEditService(row.key)">{{ t('common.edit') }}</el-button>
                <el-button size="small" text type="danger" @click="handleDeleteService(row.key, row.label)">{{ t('common.delete') }}</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Price list management -->
      <el-tab-pane :label="t('admin.priceListsTab')" name="pricelists">
        <div class="tab-toolbar">
          <el-button type="primary" @click="showAddPriceListDialog = true">
            <el-icon><Plus /></el-icon> {{ t('admin.addPriceList') }}
          </el-button>
        </div>
        <el-table :data="settingsStore.priceLists" stripe row-key="id">
          <el-table-column type="expand">
            <template #default="{ row }">
            <div style="padding: 12px 20px;">
              <!-- If editing this price list, show editable items -->
              <template v-if="editingPriceListId === row.id">
                <div style="margin-bottom:8px; font-weight:600; color:#555">{{ t('admin.priceItems') }}</div>
                <el-table :data="editPriceListForm.items" size="small" max-height="300" :empty-text="t('admin.noItems')">
                  <el-table-column :label="t('admin.item')" min-width="180">
                    <template #default="{ row: item }">
                      <el-input v-model="item.name" size="small" />
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('admin.price')" width="130">
                    <template #default="{ row: item }">
                      <el-input-number v-model="item.price" :min="0" :step="10" size="small" style="width:110px" />
                    </template>
                  </el-table-column>
                  <el-table-column :label="t('admin.taxable')" width="80" align="center">
                    <template #default="{ row: item }">
                      <el-checkbox v-model="item.taxable" />
                    </template>
                  </el-table-column>
                  <el-table-column width="60">
                    <template #default="{ $index }">
                      <el-button size="small" text type="danger" @click="removeEditPriceItem($index)">{{ t('common.delete') }}</el-button>
                    </template>
                  </el-table-column>
                </el-table>
                <el-row :gutter="8" style="margin-top:8px">
                  <el-col :span="10">
                    <el-input v-model="editPriceItem.name" :placeholder="t('admin.itemNamePlaceholder')" size="small" />
                  </el-col>
                  <el-col :span="6">
                    <el-input-number v-model="editPriceItem.price" :min="0" :step="10" size="small" style="width:100%" />
                  </el-col>
                  <el-col :span="4">
                    <el-checkbox v-model="editPriceItem.taxable" size="small">{{ t('admin.taxable') }}</el-checkbox>
                  </el-col>
                  <el-col :span="4">
                    <el-button size="small" type="primary" @click="addEditPriceItem">{{ t('common.add') }}</el-button>
                  </el-col>
                </el-row>
              </template>
              <!-- If not editing, show read-only items -->
              <template v-else>
                <div style="margin-bottom:8px; font-weight:600; color:#555">{{ t('admin.priceItems') }}</div>
                <el-table :data="row.items || []" size="small" max-height="300" :empty-text="t('admin.noItems')">
                  <el-table-column prop="name" :label="t('admin.item')" min-width="180" />
                  <el-table-column :label="t('admin.price')" width="130">
                    <template #default="{ row: item }">{{ formatMoney(item.price) }}</template>
                  </el-table-column>
                  <el-table-column :label="t('admin.taxable')" width="80" align="center">
                    <template #default="{ row: item }">
                      <el-tag :type="item.taxable ? '' : 'info'" size="small">{{ item.taxable ? t('common.yes') : t('common.no') }}</el-tag>
                    </template>
                  </el-table-column>
                </el-table>
              </template>
            </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.priceListName')" min-width="160">
            <template #default="{ row }">
              <div v-if="editingPriceListId === row.id">
                <el-input v-model="editPriceListForm.name" size="small" />
              </div>
              <span v-else style="font-weight:600">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.effectiveDate')" width="160">
            <template #default="{ row }">
              <div v-if="editingPriceListId === row.id">
                <el-date-picker v-model="editPriceListForm.effectiveDate" type="date" value-format="YYYY-MM-DD" size="small" style="width:140px" />
              </div>
              <span v-else>{{ formatDate(row.effectiveDate) || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.itemCount')" width="80">
            <template #default="{ row }">{{ (editingPriceListId === row.id ? editPriceListForm.items : row.items)?.length || 0 }}</template>
          </el-table-column>
          <el-table-column :label="t('admin.status')" width="90">
            <template #default="{ row }">
              <el-tag :type="row.isActive ? 'success' : 'info'" size="small">{{ row.isActive ? t('admin.active') : t('admin.inactive') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.operation')" width="200" fixed="right">
            <template #default="{ row }">
              <div v-if="editingPriceListId === row.id">
                <el-button size="small" text type="primary" @click="saveEditPriceList">{{ t('common.save') }}</el-button>
                <el-button size="small" text @click="cancelEditPriceList">{{ t('common.cancel') }}</el-button>
              </div>
              <div v-else>
                <el-button size="small" text type="primary" @click="startEditPriceList(row)">{{ t('common.edit') }}</el-button>
                <el-button v-if="row.isActive" size="small" text type="danger" @click="deletePriceList(row)">{{ t('admin.disable') }}</el-button>
                <el-button v-else size="small" text type="success" @click="enablePriceList(row)">{{ t('admin.enable') }}</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Branch management -->
      <el-tab-pane :label="t('admin.branchesTab')" name="branches">
        <div class="tab-toolbar">
          <el-button type="primary" @click="showAddBranchDialog = true">
            <el-icon><Plus /></el-icon> {{ t('admin.addBranch') }}
          </el-button>
        </div>
        <el-table :data="branchesStore.branches" stripe>
          <el-table-column :label="t('admin.name')" min-width="120">
            <template #default="{ row }">
              <div v-if="editingBranchId === row.id">
                <el-input v-model="editBranchForm.name" size="small" />
              </div>
              <div v-else>
                <span style="font-weight:600">{{ row.name }}</span>
                <el-tag v-if="row.isMain" size="small" type="success" style="margin-left:4px">{{ t('admin.mainBranch') }}</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.branchCode')" width="80">
            <template #default="{ row }">
              <div v-if="editingBranchId === row.id">
                <el-input v-model="editBranchForm.code" size="small" />
              </div>
              <span v-else>{{ row.code }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.address')" min-width="180">
            <template #default="{ row }">
              <div v-if="editingBranchId === row.id">
                <el-input v-model="editBranchForm.address" size="small" />
              </div>
              <span v-else style="color:#888; font-size:13px">{{ row.address }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.phone')" width="130">
            <template #default="{ row }">
              <div v-if="editingBranchId === row.id">
                <el-input v-model="editBranchForm.phone" size="small" />
              </div>
              <span v-else>{{ row.phone }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.manager')" width="100">
            <template #default="{ row }">
              <div v-if="editingBranchId === row.id">
                <el-select v-model="editBranchForm.managerId" size="small" clearable>
                  <el-option v-for="u in authStore.users" :key="u.id" :label="u.name" :value="u.id" />
                </el-select>
              </div>
              <span v-else>{{ getManagerName(row.managerId) }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.status')" width="80">
            <template #default="{ row }">
              <el-tag :type="row.isActive ? 'success' : 'info'" size="small">{{ row.isActive ? t('admin.active') : t('admin.inactive') }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.operation')" width="180" fixed="right">
            <template #default="{ row }">
              <div v-if="editingBranchId === row.id">
                <el-button size="small" text type="primary" @click="saveEditBranch">{{ t('common.save') }}</el-button>
                <el-button size="small" text @click="editingBranchId = null">{{ t('common.cancel') }}</el-button>
              </div>
              <div v-else>
                <el-button size="small" text type="primary" @click="startEditBranch(row)">{{ t('common.edit') }}</el-button>
                <el-button size="small" text :type="row.isActive ? 'danger' : 'success'" @click="toggleBranch(row)" :disabled="row.isMain">
                  {{ row.isActive ? t('admin.disable') : t('admin.enable') }}
                </el-button>
                <el-button size="small" text type="danger" @click="deleteBranch(row)" :disabled="row.isMain">{{ t('common.delete') }}</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Formula management -->
      <el-tab-pane :label="t('admin.formulasTab')" name="formulas">
        <div class="tab-toolbar">
          <el-button type="primary" @click="showAddFormulaDialog = true">
            <el-icon><Plus /></el-icon> {{ t('admin.addFormula') }}
          </el-button>
        </div>
        <el-table :data="formulasStore.activeFormulas" stripe>
          <el-table-column :label="t('admin.formulaName')" min-width="120">
            <template #default="{ row }">
              <span style="font-weight:600">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.formulaCategory')" width="100">
            <template #default="{ row }">{{ row.category || '-' }}</template>
          </el-table-column>
          <el-table-column :label="t('admin.formulaEfficacy')" min-width="160">
            <template #default="{ row }">
              <span style="color:#888; font-size:13px">{{ row.description || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.formulaSource')" width="160">
            <template #default="{ row }">
              <span style="color:#888; font-size:13px">{{ row.source || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.formulaHerbs')" min-width="240">
            <template #default="{ row }">
              <div style="font-size:12px; color:#555; line-height:1.6">
                <el-tag v-for="(item, idx) in (row.items || [])" :key="idx" size="small" style="margin: 2px 4px 2px 0">
                  {{ item.herbName }} {{ item.dosage }}{{ item.unit }}
                </el-tag>
                <span v-if="!row.items || row.items.length === 0" style="color:#bbb">{{ t('admin.formulaNoHerbs') }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.operation')" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click="startEditFormula(row)">{{ t('common.edit') }}</el-button>
              <el-button size="small" text type="danger" @click="deleteFormula(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 编辑方剂内联面板 -->
        <el-drawer v-model="editingFormulaId" :title="t('admin.editFormulaDialog')" size="680px" direction="rtl"
                   :model-value="!!editingFormulaId" @update:model-value="val => { if(!val) editingFormulaId = null }">
          <el-form :model="editFormulaForm" label-width="80px">
            <el-form-item :label="t('admin.formulaName')" required>
              <el-input v-model="editFormulaForm.name" />
            </el-form-item>
            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item :label="t('admin.formulaCategory')">
                  <el-select v-model="editFormulaForm.category" filterable clearable style="width:100%" :placeholder="t('admin.formulaCategoryPh')">
                    <el-option v-for="category in formulaCategoryOptions" :key="category" :label="category" :value="category" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item :label="t('admin.formulaSource')">
                  <el-input v-model="editFormulaForm.source" :placeholder="t('admin.formulaSourcePh')" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item :label="t('admin.formulaEfficacy')">
              <el-input v-model="editFormulaForm.description" type="textarea" :rows="2" />
            </el-form-item>
            <el-divider>{{ t('admin.formulaHerbDetail') }}</el-divider>
            <el-row :gutter="8" style="margin-bottom:8px">
              <el-col :span="8">
                <el-select
                  v-model="editFormulaHerb.herbDictId"
                  filterable
                  :placeholder="t('inventory.selectHerbRequired')"
                  size="small"
                  style="width:100%"
                  @change="syncDraftHerb(editFormulaHerb, $event)"
                >
                  <el-option v-for="herb in herbOptions" :key="herb.id" :label="herb.name" :value="herb.id" />
                </el-select>
              </el-col>
              <el-col :span="5"><el-input-number v-model="editFormulaHerb.dosage" :min="0" :step="1" size="small" style="width:100%" /></el-col>
              <el-col :span="4"><el-input v-model="editFormulaHerb.unit" :placeholder="t('admin.formulaUnit')" size="small" /></el-col>
              <el-col :span="4"><el-input v-model="editFormulaHerb.notes" :placeholder="t('admin.formulaHerbNotes')" size="small" /></el-col>
              <el-col :span="3"><el-button size="small" type="primary" @click="addEditFormulaHerb">{{ t('common.add') }}</el-button></el-col>
            </el-row>
            <el-table :data="editFormulaForm.items" size="small" max-height="250" :empty-text="t('admin.formulaNoHerbsAdd')">
              <el-table-column :label="t('admin.formulaHerbName')" min-width="180">
                <template #default="{ row }">
                  <el-select
                    v-model="row.herbDictId"
                    filterable
                    :placeholder="row.herbName || t('inventory.selectHerbRequired')"
                    size="small"
                    style="width:100%"
                    @change="syncRowHerb(row, $event)"
                  >
                    <el-option v-for="herb in herbOptions" :key="herb.id" :label="herb.name" :value="herb.id" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column :label="t('admin.formulaDosage')" width="80"><template #default="{ row }">{{ row.dosage }}{{ row.unit }}</template></el-table-column>
              <el-table-column prop="notes" :label="t('admin.formulaHerbNotes')" width="100" />
              <el-table-column width="60"><template #default="{ $index }"><el-button size="small" text type="danger" @click="removeEditFormulaHerb($index)">{{ t('common.delete') }}</el-button></template></el-table-column>
            </el-table>
          </el-form>
          <template #footer>
            <el-button @click="editingFormulaId = null">{{ t('common.cancel') }}</el-button>
            <el-button type="primary" @click="saveEditFormula">{{ t('common.save') }}</el-button>
          </template>
        </el-drawer>
      </el-tab-pane>

      <!-- Supplier management -->
      <el-tab-pane :label="t('admin.suppliersTab')" name="suppliers">
        <div class="tab-toolbar">
          <el-button type="primary" @click="showAddSupplierDialog = true">
            <el-icon><Plus /></el-icon> {{ t('admin.addSupplier') }}
          </el-button>
        </div>
        <el-table :data="suppliersStore.activeSuppliers" stripe>
          <el-table-column :label="t('admin.supplierName')" min-width="120">
            <template #default="{ row }">
              <div v-if="editingSupplierId === row.id">
                <el-input v-model="editSupplierForm.name" size="small" />
              </div>
              <span v-else style="font-weight:600">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.supplierContact')" width="100">
            <template #default="{ row }">
              <div v-if="editingSupplierId === row.id">
                <el-input v-model="editSupplierForm.contactPerson" size="small" />
              </div>
              <span v-else>{{ row.contactPerson || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.supplierPhone')" width="130">
            <template #default="{ row }">
              <div v-if="editingSupplierId === row.id">
                <el-input v-model="editSupplierForm.phone" size="small" />
              </div>
              <span v-else>{{ row.phone || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.supplierEmail')" width="160">
            <template #default="{ row }">
              <div v-if="editingSupplierId === row.id">
                <el-input v-model="editSupplierForm.email" size="small" />
              </div>
              <span v-else style="color:#888">{{ row.email || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.supplierAddress')" min-width="200">
            <template #default="{ row }">
              <div v-if="editingSupplierId === row.id">
                <el-input v-model="editSupplierForm.address" size="small" />
              </div>
              <span v-else style="color:#888; font-size:13px">{{ row.address || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.supplierNotes')" width="120">
            <template #default="{ row }">
              <div v-if="editingSupplierId === row.id">
                <el-input v-model="editSupplierForm.notes" size="small" />
              </div>
              <span v-else style="color:#aaa; font-size:12px">{{ row.notes || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.operation')" width="160" fixed="right">
            <template #default="{ row }">
              <div v-if="editingSupplierId === row.id">
                <el-button size="small" text type="primary" @click="saveEditSupplier">{{ t('common.save') }}</el-button>
                <el-button size="small" text @click="editingSupplierId = null">{{ t('common.cancel') }}</el-button>
              </div>
              <div v-else>
                <el-button size="small" text type="primary" @click="startEditSupplier(row)">{{ t('common.edit') }}</el-button>
                <el-button size="small" text type="danger" @click="deleteSupplier(row)">{{ t('common.delete') }}</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Acupoint management -->
      <el-tab-pane :label="t('admin.acupointsTab')" name="acupoints">
        <div class="tab-toolbar">
          <el-button type="primary" @click="showAddAcupointDialog = true">
            <el-icon><Plus /></el-icon> {{ t('admin.addAcupointBtn') }}
          </el-button>
          <el-button @click="showImportAcupointsDialog = true">
            <el-icon><Upload /></el-icon> 批量导入
          </el-button>
        </div>
        <el-table :data="acupointsStore.activeAcupoints" stripe>
          <el-table-column :label="t('admin.acupointName')" width="100">
            <template #default="{ row }">
              <span style="font-weight:600">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.acupointPinyin')" width="110">
            <template #default="{ row }">
              <span style="color:#888; font-size:12px">{{ row.pinyin || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.acupointEnglishName')" width="140">
            <template #default="{ row }">
              <span style="color:#888; font-size:12px">{{ row.englishName || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.acupointMeridian')" width="110">
            <template #default="{ row }">
              <span>{{ row.meridian || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.acupointLocation')" min-width="180">
            <template #default="{ row }">
              <span style="color:#555; font-size:12px">{{ row.location || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.acupointIndication')" min-width="180">
            <template #default="{ row }">
              <span style="color:#555; font-size:12px">{{ row.indication || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.operation')" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click="startEditAcupoint(row)">{{ t('common.edit') }}</el-button>
              <el-button size="small" text type="danger" @click="deleteAcupoint(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <!-- Edit acupoint dialog -->
        <el-drawer v-model="showEditAcupointDialog" :title="t('admin.editAcupointDialog')" size="600px" direction="rtl" :close-on-click-modal="false">
          <el-form :model="editAcupointForm" label-width="80px">
            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item :label="t('admin.acupointName')">
                  <el-input v-model="editAcupointForm.name" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item :label="t('admin.acupointPinyin')">
                  <el-input v-model="editAcupointForm.pinyin" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item :label="t('admin.acupointEnglishName')">
                  <el-input v-model="editAcupointForm.englishName" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item :label="t('admin.acupointMeridian')">
                  <el-input v-model="editAcupointForm.meridian" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item :label="t('admin.acupointLocation')">
              <el-input v-model="editAcupointForm.location" />
            </el-form-item>
            <el-form-item :label="t('admin.acupointIndication')">
              <el-input v-model="editAcupointForm.indication" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item :label="t('admin.acupointMethod')">
              <el-input v-model="editAcupointForm.method" />
            </el-form-item>
            <el-form-item :label="t('admin.acupointNotes')">
              <el-input v-model="editAcupointForm.notes" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="showEditAcupointDialog = false">{{ t('common.cancel') }}</el-button>
            <el-button type="primary" @click="saveEditAcupoint">{{ t('common.save') }}</el-button>
          </template>
        </el-drawer>
      </el-tab-pane>

      <!-- 鍗曚綅鎹㈢畻 -->
      <el-tab-pane :label="t('admin.unitConversionsTab')" name="unitConversions">
        <div class="tab-toolbar">
          <el-button type="primary" @click="showAddConversionDialog = true">
            <el-icon><Plus /></el-icon> {{ t('admin.addConversion') }}
          </el-button>
        </div>
        <el-table :data="unitConversionsStore.conversions" stripe>
          <el-table-column :label="t('admin.fromUnit')" width="120" prop="fromUnit" />
          <el-table-column :label="t('admin.toUnit')" width="120" prop="toUnit" />
          <el-table-column :label="t('admin.conversionFactor')" width="150">
            <template #default="{ row }">
              <span>1 {{ row.fromUnit }} = {{ row.factor }} {{ row.toUnit }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.conversionNotes')" min-width="200" prop="notes" />
          <el-table-column :label="t('admin.operation')" width="80">
            <template #default="{ row }">
              <el-button size="small" text type="danger" @click="deleteConversion(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Herb dictionary -->
      <el-tab-pane :label="t('admin.herbDictTab')" name="herbDict">
        <el-card class="settings-card" style="max-width: 760px; margin-bottom: 16px">
          <template #header><span style="font-weight:600">成药列表</span></template>
          <el-form label-width="100px">
            <el-form-item label="成药名称">
              <el-input v-model="adminListDrafts.patentMedicines" type="textarea" :rows="4" placeholder="每行一个成药名称" style="max-width: 520px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveEditableLists">{{ t('common.save') }}</el-button>
            </el-form-item>
          </el-form>
          <el-table :data="patentMedicineRows" size="small" stripe :empty-text="t('common.noData')" style="max-width: 520px">
            <el-table-column prop="name" label="成药名称" />
          </el-table>
        </el-card>
        <div class="tab-toolbar" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
          <el-button type="primary" @click="showAddHerbDialog = true"><el-icon><Plus /></el-icon> {{ t('admin.addHerb') }}</el-button>
          <el-button @click="showImportHerbsDialog = true"><el-icon><Upload /></el-icon> 批量导入</el-button>
          <el-input v-model="herbSearchQuery" :placeholder="t('admin.herbSearchPh')" size="small" clearable style="width:180px" />
          <el-select v-model="herbCategoryFilter" :placeholder="t('admin.herbFilterCategory')" size="small" clearable style="width:140px">
            <el-option v-for="c in herbDictStore.categories" :key="c" :label="c" :value="c" />
          </el-select>
          <span style="color:#888; font-size:12px">{{ t('admin.herbTotalCount', { count: filteredHerbs.length }) }}</span>
        </div>
        <el-table :data="filteredHerbs" stripe max-height="500">
          <el-table-column :label="t('admin.herbName')" width="90"><template #default="{ row }"><span style="font-weight:600">{{ row.name }}</span></template></el-table-column>
          <el-table-column :label="t('admin.herbCategory')" width="90" prop="category" />
          <el-table-column :label="t('admin.herbNature')" width="60" prop="nature" />
          <el-table-column :label="t('admin.herbTaste')" width="100" prop="taste" />
          <el-table-column :label="t('admin.herbToxicity')" width="80"><template #default="{ row }"><span>{{ row.toxicity || '无毒' }}</span></template></el-table-column>
          <el-table-column :label="t('admin.herbMeridianTropism')" width="120"><template #default="{ row }"><span style="font-size:12px; color:#555">{{ row.meridianTropism || '-' }}</span></template></el-table-column>
          <el-table-column :label="t('admin.herbEfficacy')" min-width="140"><template #default="{ row }"><span style="font-size:12px; color:#555">{{ row.efficacy || '-' }}</span></template></el-table-column>
          <el-table-column :label="t('admin.herbDosageRange')" width="80"><template #default="{ row }"><span style="font-size:12px">{{ row.dosageRange || '-' }}</span></template></el-table-column>
          <el-table-column :label="t('common.operation')" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click="startEditHerb(row)">{{ t('common.edit') }}</el-button>
              <el-button size="small" text type="danger" @click="deleteHerb(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <!-- Edit herb dialog -->
        <el-drawer :model-value="!!editingHerbId" @update:model-value="val => { if(!val) editingHerbId = null }" :title="t('admin.editHerbDialog')" size="680px" direction="rtl" :close-on-click-modal="false">
          <el-form :model="editHerbForm" label-width="80px">
            <el-row :gutter="12"><el-col :span="8"><el-form-item :label="t('admin.herbName')"><el-input v-model="editHerbForm.name" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item :label="t('admin.herbPinyin')"><el-input v-model="editHerbForm.pinyin" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item :label="t('admin.herbAlias')"><el-input v-model="editHerbForm.alias" /></el-form-item></el-col></el-row>
            <el-row :gutter="12"><el-col :span="8"><el-form-item :label="t('admin.herbCategory')"><el-input v-model="editHerbForm.category" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item :label="t('admin.herbNature')"><el-input v-model="editHerbForm.nature" :placeholder="t('admin.herbNaturePh')" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item :label="t('admin.herbTaste')"><el-input v-model="editHerbForm.taste" /></el-form-item></el-col></el-row>
            <el-form-item :label="t('admin.herbToxicity')">
              <el-select v-model="editHerbForm.toxicity" style="width:100%">
                <el-option v-for="option in TOXICITY_OPTIONS" :key="option" :label="option" :value="option" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('admin.herbMeridianTropism')"><el-input v-model="editHerbForm.meridianTropism" /></el-form-item>
            <el-form-item :label="t('admin.herbEfficacy')"><el-input v-model="editHerbForm.efficacy" type="textarea" :rows="2" /></el-form-item>
            <el-row :gutter="12"><el-col :span="12"><el-form-item :label="t('admin.herbDosageRange')"><el-input v-model="editHerbForm.dosageRange" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item :label="t('admin.herbContraindication')"><el-input v-model="editHerbForm.contraindication" /></el-form-item></el-col></el-row>
          </el-form>
          <template #footer><el-button @click="editingHerbId = null">{{ t('common.cancel') }}</el-button><el-button type="primary" @click="saveEditHerb">{{ t('common.save') }}</el-button></template>
        </el-drawer>
      </el-tab-pane>

      <!-- 经络字典 -->
      <el-tab-pane :label="t('admin.meridianTab')" name="meridians">
        <div class="tab-toolbar">
          <el-button type="primary" @click="showAddMeridianDialog = true"><el-icon><Plus /></el-icon> {{ t('admin.addMeridian') }}</el-button>
        </div>
        <el-table :data="meridiansStore.activeMeridians" stripe>
          <el-table-column :label="t('admin.meridianName')" width="130"><template #default="{ row }"><span style="font-weight:600">{{ row.name }}</span></template></el-table-column>
          <el-table-column :label="t('admin.meridianAbbr')" width="60" prop="abbr" />
          <el-table-column :label="t('admin.meridianCategory')" width="70"><template #default="{ row }"><el-tag :type="row.category === '奇经' ? 'warning' : ''" size="small">{{ row.category === '奇经' ? t('admin.meridianExtra') : t('admin.meridianRegular') }}</el-tag></template></el-table-column>
          <el-table-column :label="t('admin.meridianOrgan')" width="80" prop="organ" />
          <el-table-column :label="t('admin.meridianAcupointCount')" width="70"><template #default="{ row }">{{ row.acupointCount }}</template></el-table-column>
          <el-table-column :label="t('admin.meridianIndication')" min-width="200"><template #default="{ row }"><span style="font-size:12px; color:#555">{{ row.indication || '-' }}</span></template></el-table-column>
          <el-table-column :label="t('common.operation')" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click="startEditMeridian(row)">{{ t('common.edit') }}</el-button>
              <el-button size="small" text type="danger" @click="deleteMeridian(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-drawer :model-value="!!editingMeridianId" @update:model-value="val => { if(!val) editingMeridianId = null }" :title="t('admin.editMeridianDialog')" size="600px" direction="rtl" :close-on-click-modal="false">
          <el-form :model="editMeridianForm" label-width="80px">
            <el-row :gutter="12"><el-col :span="12"><el-form-item :label="t('admin.meridianName')"><el-input v-model="editMeridianForm.name" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item :label="t('admin.meridianEnglishName')"><el-input v-model="editMeridianForm.englishName" /></el-form-item></el-col></el-row>
            <el-row :gutter="12"><el-col :span="8"><el-form-item :label="t('admin.meridianAbbr')"><el-input v-model="editMeridianForm.abbr" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item :label="t('admin.meridianCategory')"><el-select v-model="editMeridianForm.category"><el-option :label="t('admin.meridianRegular')" value="正经" /><el-option :label="t('admin.meridianExtra')" value="奇经" /></el-select></el-form-item></el-col>
            <el-col :span="8"><el-form-item :label="t('admin.meridianOrgan')"><el-input v-model="editMeridianForm.organ" /></el-form-item></el-col></el-row>
            <el-form-item :label="t('admin.meridianPathway')"><el-input v-model="editMeridianForm.pathway" type="textarea" :rows="3" /></el-form-item>
            <el-form-item :label="t('admin.meridianIndication')"><el-input v-model="editMeridianForm.indication" type="textarea" :rows="2" /></el-form-item>
          </el-form>
          <template #footer><el-button @click="editingMeridianId = null">{{ t('common.cancel') }}</el-button><el-button type="primary" @click="saveEditMeridian">{{ t('common.save') }}</el-button></template>
        </el-drawer>
      </el-tab-pane>

      <!-- Consultation templates -->
      <el-tab-pane :label="t('admin.templateTab')" name="templates">
        <div class="tab-toolbar">
          <el-button type="primary" @click="showAddTemplateDialog = true"><el-icon><Plus /></el-icon> {{ t('admin.addTemplate') }}</el-button>
        </div>
        <el-table :data="templatesStore.activeTemplates" stripe>
          <el-table-column :label="t('admin.templateName')" width="140"><template #default="{ row }"><span style="font-weight:600">{{ row.name }}</span></template></el-table-column>
          <el-table-column :label="t('admin.templateDisease')" width="120" prop="disease" />
          <el-table-column :label="t('admin.templateCategory')" width="80" prop="category" />
          <el-table-column :label="t('admin.templateAcupoints')" min-width="200">
            <template #default="{ row }">
              <el-tag v-for="(acu, idx) in (row.acupoints || [])" :key="idx" size="small" style="margin:2px 4px 2px 0">{{ formatTemplateAcupoint(acu) }}</el-tag>
              <span v-if="!row.acupoints || row.acupoints.length === 0" style="color:#bbb">{{ t('admin.templateNone') }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.templateAdvice')" min-width="180"><template #default="{ row }"><span style="font-size:12px; color:#555">{{ row.advice || '-' }}</span></template></el-table-column>
          <el-table-column :label="t('common.operation')" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click="startEditTemplate(row)">{{ t('common.edit') }}</el-button>
              <el-button size="small" text type="danger" @click="deleteTemplate(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-drawer :model-value="!!editingTemplateId" @update:model-value="val => { if(!val) editingTemplateId = null }" :title="t('admin.editTemplateDialog')" size="680px" direction="rtl" :close-on-click-modal="false">
          <el-form :model="editTemplateForm" label-width="80px">
            <el-row :gutter="12"><el-col :span="8"><el-form-item :label="t('admin.templateName')"><el-input v-model="editTemplateForm.name" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item :label="t('admin.templateDisease')"><el-input v-model="editTemplateForm.disease" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item :label="t('admin.templateCategory')"><el-input v-model="editTemplateForm.category" /></el-form-item></el-col></el-row>
            <el-form-item :label="t('admin.templateDescription')"><el-input v-model="editTemplateForm.description" type="textarea" :rows="2" /></el-form-item>
            <el-divider>{{ t('admin.templateAcupoints') }}</el-divider>
            <el-row :gutter="8" style="margin-bottom:8px">
              <el-col :span="10">
                <el-select v-model="editTemplateAcupoint.acupointId" filterable clearable :placeholder="t('admin.templateAcupointPh')" size="small" style="width:100%" @change="handleTemplateAcupointSelection(editTemplateAcupoint, $event)">
                  <el-option v-for="acu in acupointsStore.activeAcupoints" :key="acu.id" :label="acu.name" :value="acu.id" />
                </el-select>
              </el-col>
              <el-col :span="8"><el-input v-model="editTemplateAcupoint.method" :placeholder="t('admin.templateMethod')" size="small" @keyup.enter="addEditTemplateAcupoint" /></el-col>
              <el-col :span="6"><el-button size="small" type="primary" @click="addEditTemplateAcupoint">{{ t('admin.addAcupoint') }}</el-button></el-col>
            </el-row>
            <div style="margin-bottom:8px">
              <el-tag v-for="(acu, idx) in (editTemplateForm.acupoints || [])" :key="idx" closable @close="removeEditTemplateAcupoint(idx)" style="margin:2px 4px">{{ formatTemplateAcupoint(acu) }}</el-tag>
            </div>
            <el-form-item :label="t('admin.templateAdvice')"><el-input v-model="editTemplateForm.advice" type="textarea" :rows="2" /></el-form-item>
          </el-form>
          <template #footer><el-button @click="editingTemplateId = null">{{ t('common.cancel') }}</el-button><el-button type="primary" @click="saveEditTemplate">{{ t('common.save') }}</el-button></template>
        </el-drawer>
      </el-tab-pane>

      <!-- Recycle bin -->
      <el-tab-pane :label="t('admin.recycleBinTab')" name="recyclebin">
        <el-card class="settings-card" style="max-width:900px; margin-bottom:16px">
          <template #header><span style="font-weight:600; color:#e63946">{{ t('admin.deletedPatients') }}</span></template>
          <el-table :data="patientsStore.deletedPatients" stripe size="small" :empty-text="t('admin.noDeletedPatients')">
            <el-table-column prop="name" :label="t('admin.name')" min-width="100" />
            <el-table-column :label="t('admin.deletedDate')" width="130">
              <template #default="{ row }">{{ formatDate(row.deletedAt) }}</template>
            </el-table-column>
            <el-table-column :label="t('admin.operation')" width="200">
              <template #default="{ row }">
                <el-button size="small" text type="success" @click="restorePatient(row.id)">{{ t('admin.restore') }}</el-button>
                <el-button size="small" text type="danger" :disabled="!canPhysicalDelete(row.deletedAt)" @click="physicalDeletePatient(row.id)">
                  {{ t('admin.permanentDelete') }}{{ canPhysicalDelete(row.deletedAt) ? '' : t('admin.notYet3Months') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card class="settings-card" style="max-width:900px; margin-bottom:16px">
          <template #header><span style="font-weight:600; color:#e63946">{{ t('admin.deletedConsultations') }}</span></template>
          <el-table :data="consultationsStore.deletedConsultations" stripe size="small" :empty-text="t('admin.noDeletedConsultations')">
            <el-table-column :label="t('admin.consultationId')" min-width="120">
              <template #default="{ row }">{{ row.consultationId }}</template>
            </el-table-column>
            <el-table-column :label="t('admin.patient')" width="100">
              <template #default="{ row }">{{ patientsStore.getPatient(row.patientId)?.name || '-' }}</template>
            </el-table-column>
            <el-table-column :label="t('admin.deletedDate')" width="130">
              <template #default="{ row }">{{ formatDate(row.deletedAt) }}</template>
            </el-table-column>
            <el-table-column :label="t('admin.operation')" width="200">
              <template #default="{ row }">
                <el-button size="small" text type="success" @click="restoreConsultation(row.id)">{{ t('admin.restore') }}</el-button>
                <el-button size="small" text type="danger" :disabled="!canPhysicalDelete(row.deletedAt)" @click="physicalDeleteConsultation(row.id)">
                  {{ t('admin.permanentDelete') }}{{ canPhysicalDelete(row.deletedAt) ? '' : t('admin.notYet3Months') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card class="settings-card" style="max-width:900px">
          <template #header><span style="font-weight:600; color:#e63946">{{ t('admin.deletedInventory') }}</span></template>
          <el-table :data="inventoryStore.deletedItems" stripe size="small" :empty-text="t('admin.noDeletedInventory')">
            <el-table-column prop="name" :label="t('admin.name')" min-width="100" />
            <el-table-column :label="t('admin.category')" width="80">
              <template #default="{ row }">{{ row.category }}</template>
            </el-table-column>
            <el-table-column :label="t('admin.disabledDate')" width="130">
              <template #default="{ row }">{{ formatDate(row.deletedAt) }}</template>
            </el-table-column>
            <el-table-column :label="t('admin.operation')" width="200">
              <template #default="{ row }">
                <el-button size="small" text type="success" @click="restoreInventoryItem(row.id)">{{ t('admin.restore') }}</el-button>
                <el-button size="small" text type="danger" @click="physicalDeleteInventoryItem(row.id)">
                  {{ t('admin.permanentDelete') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- Add user dialog -->
    <el-drawer v-model="showAddUserDialog" :title="t('admin.addUserDialog')" size="460px" direction="rtl" :close-on-click-modal="false">
      <el-form :model="newUser" label-width="80px">
        <el-form-item :label="t('admin.name')" required>
          <el-input v-model="newUser.name" :placeholder="t('admin.realName')" />
        </el-form-item>
        <el-form-item :label="t('admin.email')" required>
          <el-input v-model="newUser.email" :placeholder="t('admin.loginEmail')" />
        </el-form-item>
        <el-form-item :label="t('admin.password')" required>
          <el-input v-model="newUser.password" type="password" :placeholder="t('admin.initialPassword')" show-password />
        </el-form-item>
        <el-form-item :label="t('admin.role')">
          <el-select v-model="newUser.roles" multiple collapse-tags style="width: 100%" :placeholder="t('admin.selectRoles')">
            <el-option v-for="(label, key) in ROLE_LABELS" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('admin.phone')">
          <el-input v-model="newUser.phone" />
        </el-form-item>
        <el-form-item label="显示颜色">
          <el-color-picker v-model="newUser.color" :predefine="PRACTITIONER_COLORS" />
        </el-form-item>
        <el-form-item label="组织">
          <el-input v-model="newUser.regulatoryBody" placeholder="如: CTCMPAO" />
        </el-form-item>
        <el-form-item label="注册号码">
          <el-input v-model="newUser.registrationNumber" placeholder="如: 6995" />
        </el-form-item>
        <el-form-item label="首诊时长(overlap1)">
          <el-input-number v-model="newUser.overlap1" :min="5" :max="120" :step="5" />
        </el-form-item>
        <el-form-item label="复诊时长(overlap2)">
          <el-input-number v-model="newUser.overlap2" :min="5" :max="120" :step="5" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddUserDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddUser">{{ t('common.create') }}</el-button>
      </template>
    </el-drawer>

    <!-- Add room dialog -->
    <el-dialog v-model="showAddRoomDialog" :title="t('admin.addRoomDialog')" width="420px">
      <el-form label-width="100px">
        <el-form-item :label="t('admin.roomName')">
          <el-input v-model="newRoomName" :placeholder="t('admin.roomNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('admin.supportTags')">
          <el-checkbox-group v-model="newRoomTags">
            <el-checkbox label="acupuncture">{{ t('admin.tagAcupuncture') }}</el-checkbox>
            <el-checkbox label="tuina">{{ t('admin.tagTuina') }}</el-checkbox>
            <el-checkbox label="consultation">{{ t('admin.tagConsultation') }}</el-checkbox>
            <el-checkbox label="herbs">{{ t('admin.tagHerbs') }}</el-checkbox>
            <el-checkbox label="moxibustion">{{ t('admin.tagMoxibustion') }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="newRoomColor" :predefine="ROOM_COLORS" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddRoomDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddRoom">{{ t('common.add') }}</el-button>
      </template>
    </el-dialog>

    <!-- Add service type dialog -->
    <el-dialog v-model="showAddServiceDialog" title="添加服务类型" width="500px">
      <el-form :model="newServiceForm" label-width="120px">
        <el-form-item label="服务名称" required>
          <el-input v-model="newServiceForm.label" placeholder="如：针灸1小时" />
        </el-form-item>
        <el-form-item label="总时长（分钟）">
          <el-input-number v-model="newServiceForm.duration" :min="5" :step="5" style="width: 160px" />
        </el-form-item>
        <el-form-item label="医师占用">
          <el-select v-model="newServiceForm.practitionerTime" style="width: 200px">
            <el-option label="overlap1(首诊)" value="overlap1" />
            <el-option label="overlap2(复诊)" value="overlap2" />
            <el-option label="全程(=总时长)" value="full" />
          </el-select>
        </el-form-item>
        <el-form-item :label="`默认价格（${currentCurrency}）`">
          <el-input-number v-model="newServiceForm.defaultPrice" :min="0" :step="10" style="width: 160px" />
        </el-form-item>
        <el-form-item label="服务标签">
          <el-select v-model="newServiceForm.requiredTag" clearable style="width: 200px">
            <el-option
              v-for="option in SERVICE_TAG_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="需要诊室">
          <el-switch v-model="newServiceForm.roomRequired" />
        </el-form-item>
        <el-form-item label="公共页面显示">
          <el-switch v-model="newServiceForm.publicVisible" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddServiceDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddService">{{ t('common.add') }}</el-button>
      </template>
    </el-dialog>

    <!-- Add branch dialog -->
    <el-drawer v-model="showAddBranchDialog" :title="t('admin.addBranchDialog')" size="520px" direction="rtl" :close-on-click-modal="false">
      <el-form :model="newBranch" label-width="80px">
        <el-form-item :label="t('admin.name')" required>
          <el-input v-model="newBranch.name" :placeholder="t('admin.branchNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('admin.branchCode')">
          <el-input v-model="newBranch.code" :placeholder="t('admin.branchCodePlaceholder')" style="width:120px" />
        </el-form-item>
        <el-form-item :label="t('admin.address')">
          <el-input v-model="newBranch.address" :placeholder="t('admin.addressPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('admin.phone')">
          <el-input v-model="newBranch.phone" :placeholder="t('admin.phonePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('admin.email')">
          <el-input v-model="newBranch.email" :placeholder="t('admin.branchEmailPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('admin.manager')">
          <el-select v-model="newBranch.managerId" clearable :placeholder="t('admin.selectManager')" style="width:100%">
            <el-option v-for="u in authStore.users" :key="u.id" :label="u.name + ' (' + (Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : u.role ? [u.role] : []).map(r => ROLE_LABELS[r] || r).join('/') + ')'" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('admin.linkedRooms')">
          <el-select v-model="newBranch.roomIds" multiple collapse-tags :placeholder="t('admin.selectRooms')" style="width:100%">
            <el-option v-for="r in settingsStore.rooms" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddBranchDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddBranch">{{ t('common.create') }}</el-button>
      </template>
    </el-drawer>

    <!-- Add price list dialog -->
    <el-drawer v-model="showAddPriceListDialog" :title="t('admin.addPriceListDialog')" size="600px" direction="rtl" :close-on-click-modal="false">
      <el-form :model="newPriceList" label-width="100px">
        <el-form-item :label="t('admin.priceListName')" required>
          <el-input v-model="newPriceList.name" :placeholder="t('admin.priceListNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('admin.effectiveDate')">
          <el-date-picker v-model="newPriceList.effectiveDate" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-divider />
        <div class="tab-toolbar" style="margin-bottom:8px">
          <span style="font-weight:600; font-size:13px; color:#555">{{ t('admin.priceItems') }}</span>
        </div>
        <el-row :gutter="8" style="margin-bottom:8px">
          <el-col :span="10">
            <el-input v-model="newPriceItem.name" :placeholder="t('admin.itemNamePlaceholder')" size="small" />
          </el-col>
          <el-col :span="6">
            <el-input-number v-model="newPriceItem.price" :min="0" :step="10" size="small" style="width:100%" />
          </el-col>
          <el-col :span="4">
            <el-checkbox v-model="newPriceItem.taxable" size="small">{{ t('admin.taxable') }}</el-checkbox>
          </el-col>
          <el-col :span="4">
            <el-button size="small" type="primary" @click="addPriceItem">{{ t('common.add') }}</el-button>
          </el-col>
        </el-row>
        <el-table :data="newPriceList.items" size="small" max-height="200" :empty-text="t('admin.noItems')">
          <el-table-column prop="name" :label="t('admin.item')" />
          <el-table-column :label="t('admin.price')" width="110"><template #default="{ row }">{{ formatMoney(row.price) }}</template></el-table-column>
          <el-table-column :label="t('admin.taxable')" width="60"><template #default="{ row }">{{ row.taxable ? t('common.yes') : t('common.no') }}</template></el-table-column>
          <el-table-column width="60"><template #default="{ $index }"><el-button size="small" text type="danger" @click="removePriceItem($index)">{{ t('common.delete') }}</el-button></template></el-table-column>
        </el-table>
      </el-form>
      <template #footer>
        <el-button @click="showAddPriceListDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddPriceList">{{ t('common.create') }}</el-button>
      </template>
    </el-drawer>

    <!-- Add formula dialog -->
    <el-drawer v-model="showAddFormulaDialog" :title="t('admin.addFormulaDialog')" size="680px" direction="rtl" :close-on-click-modal="false">
      <el-form :model="newFormula" label-width="80px">
        <el-form-item :label="t('admin.formulaName')" required>
          <el-input v-model="newFormula.name" :placeholder="t('admin.formulaName')" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item :label="t('admin.formulaCategory')">
              <el-select v-model="newFormula.category" filterable clearable style="width:100%" :placeholder="t('admin.formulaCategoryPh')">
                <el-option v-for="category in formulaCategoryOptions" :key="category" :label="category" :value="category" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('admin.formulaSource')">
              <el-input v-model="newFormula.source" :placeholder="t('admin.formulaSourcePh')" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item :label="t('admin.formulaEfficacy')">
          <el-input v-model="newFormula.description" type="textarea" :rows="2" :placeholder="t('admin.formulaEfficacyPh')" />
        </el-form-item>
        <el-divider>{{ t('admin.formulaHerbDetail') }}</el-divider>
        <el-row :gutter="8" style="margin-bottom:8px">
          <el-col :span="8">
            <el-select
              v-model="newFormulaHerb.herbDictId"
              filterable
              :placeholder="t('inventory.selectHerbRequired')"
              size="small"
              style="width:100%"
              @change="syncDraftHerb(newFormulaHerb, $event)"
            >
              <el-option v-for="herb in herbOptions" :key="herb.id" :label="herb.name" :value="herb.id" />
            </el-select>
          </el-col>
          <el-col :span="5">
            <el-input-number v-model="newFormulaHerb.dosage" :min="0" :step="1" size="small" style="width:100%" />
          </el-col>
          <el-col :span="4">
            <el-input v-model="newFormulaHerb.unit" :placeholder="t('admin.formulaUnit')" size="small" />
          </el-col>
          <el-col :span="4">
            <el-input v-model="newFormulaHerb.notes" :placeholder="t('admin.formulaHerbNotes')" size="small" />
          </el-col>
          <el-col :span="3">
            <el-button size="small" type="primary" @click="addFormulaHerb">{{ t('common.add') }}</el-button>
          </el-col>
        </el-row>
        <el-table :data="newFormula.items" size="small" max-height="250" :empty-text="t('admin.formulaNoHerbsAdd')">
          <el-table-column :label="t('admin.formulaHerbName')" min-width="180">
            <template #default="{ row }">
              <el-select
                v-model="row.herbDictId"
                filterable
                :placeholder="row.herbName || t('inventory.selectHerbRequired')"
                size="small"
                style="width:100%"
                @change="syncRowHerb(row, $event)"
              >
                <el-option v-for="herb in herbOptions" :key="herb.id" :label="herb.name" :value="herb.id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.formulaDosage')" width="80">
            <template #default="{ row }">{{ row.dosage }}{{ row.unit }}</template>
          </el-table-column>
          <el-table-column prop="notes" :label="t('admin.formulaHerbNotes')" width="100" />
          <el-table-column width="60">
            <template #default="{ $index }">
              <el-button size="small" text type="danger" @click="removeFormulaHerb($index)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>
      <template #footer>
        <el-button @click="showAddFormulaDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddFormula">{{ t('common.create') }}</el-button>
      </template>
    </el-drawer>

    <!-- Add supplier dialog -->
    <el-drawer v-model="showAddSupplierDialog" :title="t('admin.addSupplierDialog')" size="520px" direction="rtl" :close-on-click-modal="false">
      <el-form :model="newSupplier" label-width="80px">
        <el-form-item :label="t('admin.supplierName')" required>
          <el-input v-model="newSupplier.name" :placeholder="t('admin.supplierNamePh')" />
        </el-form-item>
        <el-form-item :label="t('admin.supplierContact')">
          <el-input v-model="newSupplier.contactPerson" :placeholder="t('admin.supplierContactPh')" />
        </el-form-item>
        <el-form-item :label="t('admin.supplierPhone')">
          <el-input v-model="newSupplier.phone" :placeholder="t('admin.supplierPhonePh')" />
        </el-form-item>
        <el-form-item :label="t('admin.supplierEmail')">
          <el-input v-model="newSupplier.email" :placeholder="t('admin.supplierEmailPh')" />
        </el-form-item>
        <el-form-item :label="t('admin.supplierAddress')">
          <el-input v-model="newSupplier.address" :placeholder="t('admin.supplierAddressPh')" />
        </el-form-item>
        <el-form-item :label="t('admin.supplierNotes')">
          <el-input v-model="newSupplier.notes" type="textarea" :rows="2" :placeholder="t('admin.supplierNotesPh')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddSupplierDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddSupplier">{{ t('common.create') }}</el-button>
      </template>
    </el-drawer>

    <!-- Add acupoint dialog -->
    <el-drawer v-model="showAddAcupointDialog" :title="t('admin.addAcupointDialog')" size="600px" direction="rtl" :close-on-click-modal="false">
      <el-form :model="newAcupoint" label-width="80px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item :label="t('admin.acupointName')" required>
              <el-input v-model="newAcupoint.name" :placeholder="t('admin.acupointNamePh')" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('admin.acupointPinyin')">
              <el-input v-model="newAcupoint.pinyin" :placeholder="t('admin.acupointPinyinPh')" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item :label="t('admin.acupointEnglishName')">
              <el-input v-model="newAcupoint.englishName" :placeholder="t('admin.acupointEnglishNamePh')" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('admin.acupointMeridian')">
              <el-input v-model="newAcupoint.meridian" :placeholder="t('admin.acupointMeridianPh')" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item :label="t('admin.acupointLocation')">
          <el-input v-model="newAcupoint.location" :placeholder="t('admin.acupointLocationPh')" />
        </el-form-item>
        <el-form-item :label="t('admin.acupointIndication')">
          <el-input v-model="newAcupoint.indication" type="textarea" :rows="2" :placeholder="t('admin.acupointIndicationPh')" />
        </el-form-item>
        <el-form-item :label="t('admin.acupointMethod')">
          <el-input v-model="newAcupoint.method" :placeholder="t('admin.acupointMethodPh')" />
        </el-form-item>
        <el-form-item :label="t('admin.acupointNotes')">
          <el-input v-model="newAcupoint.notes" :placeholder="t('admin.acupointNotesPh')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddAcupointDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddAcupoint">{{ t('common.create') }}</el-button>
      </template>
    </el-drawer>

    <!-- Import acupoints dialog -->
    <el-dialog v-model="showImportAcupointsDialog" title="批量导入穴位" width="600px" :close-on-click-modal="false">
      <p style="color:#666;margin:0 0 12px">每行一个穴位，字段用逗号或Tab分隔：<br><strong>穴位名, 拼音, 英文名, 所属经络, 定位, 主治</strong></p>
      <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,.txt,.tsv" :on-change="handleAcupointFileUpload" style="margin-bottom:12px">
        <el-button size="small"><el-icon><Upload /></el-icon> 选择CSV/TXT文件</el-button>
      </el-upload>
      <el-input v-model="importAcupointsText" type="textarea" :rows="10" placeholder="合谷, Hé Gǔ, LI4 Hegu, 手阳明大肠经, 手背第1-2掌骨间, 头痛;牙痛;咽喉痛" />
      <template #footer>
        <el-button @click="showImportAcupointsDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="importingAcupoints" @click="handleImportAcupoints">导入</el-button>
      </template>
    </el-dialog>

    <!-- Import herbs dialog -->
    <el-dialog v-model="showImportHerbsDialog" title="批量导入草药" width="600px" :close-on-click-modal="false">
      <p style="color:#666;margin:0 0 12px">每行一味药，字段用逗号或Tab分隔：<br><strong>药名, 分类, 性, 味, 归经, 毒性, 功效</strong></p>
      <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,.txt,.tsv" :on-change="handleHerbFileUpload" style="margin-bottom:12px">
        <el-button size="small"><el-icon><Upload /></el-icon> 选择CSV/TXT文件</el-button>
      </el-upload>
      <el-input v-model="importHerbsText" type="textarea" :rows="10" placeholder="黄芪, 补气药, 微温, 甘, 脾;肺, 无毒, 补气升阳;固表止汗" />
      <template #footer>
        <el-button @click="showImportHerbsDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="importingHerbs" @click="handleImportHerbs">导入</el-button>
      </template>
    </el-dialog>

    <!-- Add unit conversion dialog -->
    <el-drawer v-model="showAddConversionDialog" :title="t('admin.addConversionDialog')" size="460px" direction="rtl" :close-on-click-modal="false">
      <el-form :model="newConversion" label-width="80px">
        <el-form-item :label="t('admin.fromUnit')" required>
          <el-input v-model="newConversion.fromUnit" :placeholder="t('admin.fromUnitPh')" />
        </el-form-item>
        <el-form-item :label="t('admin.toUnit')" required>
          <el-input v-model="newConversion.toUnit" :placeholder="t('admin.toUnitPh')" />
        </el-form-item>
        <el-form-item :label="t('admin.conversionFactor')" required>
          <el-input-number v-model="newConversion.factor" :min="0" :step="0.001" :precision="6" style="width:100%" />
          <div style="font-size:12px; color:#888; margin-top:4px">
            {{ t('admin.conversionFactorHint', { from: newConversion.fromUnit || '-', factor: newConversion.factor, to: newConversion.toUnit || '-' }) }}
          </div>
        </el-form-item>
        <el-form-item :label="t('admin.conversionNotes')">
          <el-input v-model="newConversion.notes" :placeholder="t('admin.conversionNotesPh')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddConversionDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddConversion">{{ t('common.create') }}</el-button>
      </template>
    </el-drawer>


    <!-- Add herb dialog -->
    <el-drawer v-model="showAddHerbDialog" :title="t('admin.addHerbDialog')" size="680px" direction="rtl" :close-on-click-modal="false">
      <el-form :model="newHerb" label-width="80px" size="small">
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item :label="t('admin.herbName')" required><el-input v-model="newHerb.name" :placeholder="t('admin.herbNamePh')" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item :label="t('admin.herbAlias')"><el-input v-model="newHerb.alias" :placeholder="t('admin.herbAliasPh')" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item :label="t('admin.herbPinyin')"><el-input v-model="newHerb.pinyin" :placeholder="t('admin.herbPinyinPh')" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item :label="t('admin.herbCategory')"><el-input v-model="newHerb.category" :placeholder="t('admin.herbCategoryPh')" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item :label="t('admin.herbNature')"><el-input v-model="newHerb.nature" :placeholder="t('admin.herbNaturePh')" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item :label="t('admin.herbTaste')"><el-input v-model="newHerb.taste" :placeholder="t('admin.herbTastePh')" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item :label="t('admin.herbToxicity')"><el-select v-model="newHerb.toxicity" style="width:100%"><el-option v-for="option in TOXICITY_OPTIONS" :key="option" :label="option" :value="option" /></el-select></el-form-item></el-col>
          <el-col :span="12"><el-form-item :label="t('admin.herbMeridianTropism')"><el-input v-model="newHerb.meridianTropism" :placeholder="t('admin.herbMeridianTropismPh')" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item :label="t('admin.herbDosageRange')"><el-input v-model="newHerb.dosageRange" :placeholder="t('admin.herbDosageRangePh')" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item :label="t('admin.herbContraindication')"><el-input v-model="newHerb.contraindication" :placeholder="t('admin.herbContraindicationPh')" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item :label="t('admin.herbEfficacy')"><el-input v-model="newHerb.efficacy" type="textarea" :rows="2" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item :label="t('admin.herbIndication')"><el-input v-model="newHerb.indication" type="textarea" :rows="2" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item :label="t('admin.herbNotes')"><el-input v-model="newHerb.notes" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div style="padding:12px 20px; border-top:1px solid #eee; display:flex; justify-content:flex-end; gap:8px">
          <el-button @click="showAddHerbDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="handleAddHerb">{{ t('common.create') }}</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- Add meridian dialog -->
    <el-drawer v-model="showAddMeridianDialog" :title="t('admin.addMeridianDialog')" size="600px" direction="rtl" :close-on-click-modal="false">
      <el-form :model="newMeridian" label-width="80px" size="small">
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item :label="t('admin.meridianName')" required><el-input v-model="newMeridian.name" :placeholder="t('admin.meridianNamePh')" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item :label="t('admin.meridianAbbr')"><el-input v-model="newMeridian.abbr" :placeholder="t('admin.meridianAbbrPh')" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item :label="t('admin.meridianExtra')"><el-input v-model="newMeridian.extra" :placeholder="t('admin.meridianExtraPh')" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div style="padding:12px 20px; border-top:1px solid #eee; display:flex; justify-content:flex-end; gap:8px">
          <el-button @click="showAddMeridianDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="handleAddMeridian">{{ t('common.create') }}</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- Add template dialog -->
    <el-drawer v-model="showAddTemplateDialog" :title="t('admin.addTemplateDialog')" size="680px" direction="rtl" :close-on-click-modal="false">
      <el-form :model="newTemplate" label-width="80px" size="small">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item :label="t('admin.templateName')" required><el-input v-model="newTemplate.name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item :label="t('admin.templateCategory')"><el-input v-model="newTemplate.category" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item :label="t('admin.templateDescription')"><el-input v-model="newTemplate.description" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
        <el-divider>{{ t('admin.templateAcupoints') }}</el-divider>
        <el-row :gutter="8" style="margin-bottom:8px">
          <el-col :span="10">
            <el-select v-model="newTemplateAcupoint.acupointId" filterable clearable :placeholder="t('admin.acupointName')" size="small" style="width:100%" @change="handleTemplateAcupointSelection(newTemplateAcupoint, $event)">
              <el-option v-for="acu in acupointsStore.activeAcupoints" :key="acu.id" :label="acu.name" :value="acu.id" />
            </el-select>
          </el-col>
          <el-col :span="8"><el-input v-model="newTemplateAcupoint.method" :placeholder="t('admin.templateMethod')" size="small" /></el-col>
          <el-col :span="6"><el-button size="small" type="primary" @click="addTemplateAcupoint">{{ t('admin.addAcupointToTemplate') }}</el-button></el-col>
        </el-row>
        <div style="margin-bottom:8px">
          <el-tag v-for="(acu, idx) in newTemplate.acupoints" :key="idx" closable @close="removeTemplateAcupoint(idx)" style="margin:2px 4px 2px 0">
            {{ formatTemplateAcupoint(acu) }}
          </el-tag>
        </div>
      </el-form>
      <template #footer>
        <div style="padding:12px 20px; border-top:1px solid #eee; display:flex; justify-content:flex-end; gap:8px">
          <el-button @click="showAddTemplateDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="handleAddTemplate">{{ t('common.create') }}</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.admin-view { max-width: 100%; }
.tab-toolbar { margin-bottom: 16px; }
.settings-card { max-width: 600px; border-radius: 10px; }
.email-template-editor { margin-bottom: 16px; padding-bottom: 4px; border-bottom: 1px solid #eee; }
.email-template-title { margin: 0 0 10px 160px; font-weight: 600; color: #333; }
.signature-preview { min-height: 80px; padding: 12px; border: 1px solid #dcdfe6; background: #fafafa; }
.signature-preview img { display: block; max-width: 320px; max-height: 120px; object-fit: contain; }
.profile-helper-text { font-size: 12px; color: #888; line-height: 1.5; margin-top: 6px; }
.schedule-day-card { border: 1px solid #eee; border-radius: 10px; padding: 12px; margin-bottom: 12px; background: #fafafa; }
.schedule-day-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.schedule-day-label { font-size: 14px; font-weight: 600; color: #1b4332; }
.schedule-range-list { display: flex; flex-direction: column; gap: 8px; }
.schedule-range-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.internship-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
</style>
