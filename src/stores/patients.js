import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { patientsApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

export const usePatientsStore = defineStore('patients', () => {
  const patients = ref([])

  function init() {
    patients.value = readStoredJson('tcm_patients', []) || []
  }

  function saveState() {
    writeStoredJson('tcm_patients', patients.value)
  }

  const activePatients = computed(() => patients.value.filter((p) => p.isActive && !p.deletedAt))

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
      diseaseName: data.diseaseName || '',
      historyAndMedication: data.historyAndMedication || '',
      createdAt: new Date().toISOString(),
      isActive: true,
      mergedInto: null,
      consentSigned: false,
      consentSignedAt: null,
      notes: data.notes || '',
      practitionerId: data.practitionerId || null,
    }
    const created = await patientsApi.create(newPatient)
    patients.value.push(created)
    saveState()
    return created
  }

  async function updatePatient(id, updates) {
    const idx = patients.value.findIndex((p) => p.id === id)
    if (idx !== -1) {
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
    const keepIdx = patients.value.findIndex((p) => p.id === keepId)
    const mergeIdx = patients.value.findIndex((p) => p.id === mergeId)
    if (keepIdx === -1 || mergeIdx === -1) return false
    const keep = patients.value[keepIdx]
    const merge = patients.value[mergeIdx]
    const combinedEmails = [...new Set([...(keep.emails || []), ...(merge.emails || [])])]
    patients.value[keepIdx] = { ...keep, emails: combinedEmails }
    patients.value[mergeIdx] = { ...merge, isActive: false, mergedInto: keepId }
    saveState()
    return true
  }

  async function signConsent(id) {
    const updated = await patientsApi.signConsent(id)
    const idx = patients.value.findIndex((p) => p.id === id)
    if (idx !== -1) patients.value[idx] = updated
    saveState()
  }

  function getPatientsByPractitioner(practitionerId) {
    return activePatients.value.filter((p) => p.practitionerId === practitionerId)
  }

  /**
   * 通过关联的 staffUserId 查找是否已存在员工病人档案
   */
  function getPatientByStaffUserId(userId) {
    if (!userId) return null
    return patients.value.find((p) => p.staffUserId === String(userId) && !p.deletedAt) || null
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
      const byEmail = patients.value.find((p) =>
        !p.deletedAt && (Array.isArray(p.emails) ? p.emails : []).some((e) => String(e || '').toLowerCase() === email.toLowerCase()),
      )
      if (byEmail) {
        // 已有相同 email 的病人档案 — 仅补写 staffUserId 关联
        const updated = await patientsApi.update(byEmail.id, { staffUserId: String(user.id) })
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
    })
  }

  init()

  return {
    patients, activePatients, deletedPatients,
    getPatient, searchPatients, addPatient, updatePatient,
    deletePatient, restorePatient, physicalDeletePatient,
    mergePatients, signConsent, getPatientsByPractitioner,
    getPatientByStaffUserId, ensureStaffPatient,
  }
})
