import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { patientsApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'
import { useConsultationsStore } from './consultations'
import { useAppointmentsStore } from './appointments'

export const usePatientsStore = defineStore('patients', () => {
  const patients = ref([])

  function patientNameKey(patient) {
    const structuredName = [patient?.lastName, patient?.firstName]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ')
    return structuredName || String(patient?.name || '').trim()
  }

  function comparePatientNames(a, b) {
    const nameCompare = patientNameKey(a).localeCompare(patientNameKey(b), undefined, {
      sensitivity: 'base',
      numeric: true,
    })
    if (nameCompare !== 0) return nameCompare
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  }

  function sortPatientsByName(list) {
    return [...list].sort(comparePatientNames)
  }

  function init() {
    patients.value = readStoredJson('tcm_patients', []) || []
  }

  function saveState() {
    writeStoredJson('tcm_patients', patients.value)
  }

  async function refreshFromApi() {
    const list = await patientsApi.list()
    patients.value = Array.isArray(list) ? list : []
    saveState()
    return patients.value
  }

  const activePatients = computed(() => sortPatientsByName(patients.value.filter((p) => p.isActive && !p.deletedAt)))

  function getPatient(id) {
    return patients.value.find((p) => p.id === id) || null
  }

  function searchPatients(query) {
    if (!query) return activePatients.value
    const q = query.toLowerCase()
    return activePatients.value.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.firstName && p.firstName.toLowerCase().includes(q)) ||
        (p.lastName && p.lastName.toLowerCase().includes(q)) ||
        (Array.isArray(p.emails) ? p.emails : []).some((e) => String(e || '').toLowerCase().includes(q)) ||
        p.phone?.includes(q) ||
        p.mobilePhone?.includes(q),
    )
  }

  async function addPatient(data) {
    const newPatient = {
      name: data.name || `${data.lastName || ''} ${data.firstName || ''}`.trim(),
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      middleName: data.middleName || '',
      jobTitle: data.jobTitle || '',
      accountName: data.accountName || '',
      emails: data.emails || [],
      email2: data.email2 || '',
      email3: data.email3 || '',
      phone: data.phone || '',
      mobilePhone: data.mobilePhone || data.phone || '',
      businessPhone: data.businessPhone || '',
      fax: data.fax || '',
      preferredContact: data.preferredContact || 'Any',
      dateOfBirth: data.dateOfBirth || '',
      gender: data.gender || '',
      address: data.address || '',
      addressStreet: data.addressStreet || '',
      addressCity: data.addressCity || '',
      addressState: data.addressState || '',
      addressPostal: data.addressPostal || '',
      addressCountry: data.addressCountry || '',
      diseaseName: data.diseaseName || '',
      historyAndMedication: data.historyAndMedication || '',
      createdAt: new Date().toISOString(),
      isActive: true,
      mergedInto: null,
      consentSigned: false,
      consentSignedAt: null,
      notes: data.notes || '',
      practitionerId: data.practitionerId || null,
      staffUserId: data.staffUserId || '',
      linkedUserId: data.linkedUserId || data.staffUserId || '',
      isStaffProfile: Boolean(data.isStaffProfile),
    }
    const created = await patientsApi.create(newPatient)
    patients.value.push(created)
    saveState()
    return created
  }

  async function updatePatient(id, updates) {
    const idx = patients.value.findIndex((p) => p.id === id)
    if (idx !== -1) {
      if (Array.isArray(updates.emails)) {
        const validEmails = updates.emails.map((email) => String(email || '').trim()).filter(Boolean)
        updates.emails = validEmails
        if (validEmails.length) updates.email = validEmails[0]
      }
      // 同步 name 字段
      if (updates.firstName !== undefined || updates.lastName !== undefined) {
        const p = patients.value[idx]
        const fn = updates.firstName ?? p.firstName ?? ''
        const ln = updates.lastName ?? p.lastName ?? ''
        updates.name = `${ln} ${fn}`.trim() || p.name
      }
      const updated = await patientsApi.update(id, updates)
      patients.value[idx] = updated
      saveState()
      return updated
    }
    return null
  }

  async function deletePatient(id) {
    const updated = await patientsApi.softDelete(id)
    const idx = patients.value.findIndex((p) => p.id === id)
    if (idx !== -1) patients.value[idx] = updated
    saveState()
  }

  async function restorePatient(id) {
    const updated = await patientsApi.restore(id)
    const idx = patients.value.findIndex((p) => p.id === id)
    if (idx !== -1) patients.value[idx] = updated
    saveState()
  }

  async function physicalDeletePatient(id) {
    const result = await patientsApi.hardDelete(id)
    patients.value = patients.value.filter((p) => p.id !== id)
    saveState()
    return result
  }

  const deletedPatients = computed(() => patients.value.filter((p) => p.deletedAt))

  async function mergePatients(keepId, mergeId) {
    await patientsApi.merge(keepId, mergeId)
    await refreshFromApi()
    await useConsultationsStore().refreshFromApi()
    await useAppointmentsStore().refreshFromApi()
    return true
  }

  async function signConsent(id, data = {}) {
    const updated = await patientsApi.signConsent(id, data)
    const idx = patients.value.findIndex((p) => p.id === id)
    if (idx !== -1) patients.value[idx] = updated
    saveState()
    return updated
  }

  function getPatientsByPractitioner(practitionerId) {
    return activePatients.value.filter((p) => p.practitionerId === practitionerId)
  }

  /**
   * 通过关联的 staffUserId 查找是否已存在员工病人档案
   */
  function normalizeId(value) {
    return String(value ?? '').trim()
  }

  function getPatientLinkedStaffId(patient) {
    if (!patient) return ''
    return normalizeId(patient.linkedUserId || patient.staffUserId || patient.staffMeta?.userId)
  }

  function hasPatientEmail(patient, email) {
    const target = String(email || '').trim().toLowerCase()
    if (!target || !patient || patient.deletedAt) return false
    const emails = [
      patient.email,
      ...(Array.isArray(patient.emails) ? patient.emails : []),
    ]
    return emails.some((value) => String(value || '').trim().toLowerCase() === target)
  }

  function getPatientByStaffUserId(userId) {
    const target = normalizeId(userId)
    if (!target) return null
    return patients.value.find((p) => getPatientLinkedStaffId(p) === target && !p.deletedAt) || null
  }

  /**
   * 为员工自动建立病人档案（如果尚未建档）。
   * 用户创建时自动调用，确保所有工作人员都在病人列表里有记录。
   */
  async function ensureStaffPatient(user) {
    if (!user?.id) return null
    // 已有关联档案则跳过
    const existing = getPatientByStaffUserId(user.id)
    if (existing) return existing
    // 按 email 去重 — 避免同一邮箱创建两条病人
    const email = (user.email || '').trim()
    if (email) {
      const byEmail = patients.value.find((p) => hasPatientEmail(p, email))
      if (byEmail) {
        // 已有相同 email 的病人档案 — 仅补写 staffUserId 关联
        const updated = await patientsApi.update(byEmail.id, {
          staffUserId: String(user.id),
          linkedUserId: String(user.id),
          isStaffProfile: true,
        })
        const idx = patients.value.findIndex((p) => p.id === byEmail.id)
        if (idx !== -1) patients.value[idx] = updated
        saveState()
        return updated
      }
    }
    // 创建新病人
    return addPatient({
      name: user.name || '',
      emails: email ? [email] : [],
      phone: user.phone || '',
      mobilePhone: user.phone || '',
      notes: 'Staff / 员工自动建档',
      staffUserId: String(user.id),
      linkedUserId: String(user.id),
      isStaffProfile: true,
    })
  }

  init()

  return {
    patients, activePatients, deletedPatients,
    getPatient, searchPatients, addPatient, updatePatient,
    deletePatient, restorePatient, physicalDeletePatient,
    refreshFromApi, mergePatients, signConsent, getPatientsByPractitioner,
    getPatientByStaffUserId, ensureStaffPatient,
  }
})
