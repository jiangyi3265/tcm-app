import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { patientsApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'
import { useConsultationsStore } from './consultations'
import { useAppointmentsStore } from './appointments'
import { normalizeGender } from '../utils/gender'
import { sortPatientsByName } from '../utils/patientName'
import { findStaffPatientByIdentity, isLinkedStaffPatient } from '../utils/staffPatientIdentity'

export const usePatientsStore = defineStore('patients', () => {
  const patients = ref([])
  const mergeState = ref(null)
  let refreshRequestId = 0
  let latestRefreshPromise = null
  let mutationRevision = 0
  const changesDuringRefresh = new Map()

  function init() {
    patients.value = readStoredJson('tcm_patients', []) || []
  }

  function saveState() {
    writeStoredJson('tcm_patients', patients.value)
  }

  function upsertPatient(patient) {
    if (!patient?.id) return patient
    const normalized = { ...patient, gender: normalizeGender(patient.gender) }
    // Resolve the index after the API returns; a list refresh may have reordered it.
    const idx = patients.value.findIndex((item) => item.id === normalized.id)
    if (idx === -1) patients.value.push(normalized)
    else patients.value[idx] = normalized
    changesDuringRefresh.set(normalized.id, { revision: ++mutationRevision, patient: normalized })
    saveState()
    return normalized
  }

  function refreshFromApi() {
    const requestId = ++refreshRequestId
    const startedAtRevision = mutationRevision
    const pending = (async () => {
      const list = await patientsApi.list()
      // Callers such as ensureStaffPatient need the authoritative read (or its
      // error), never old cache when their request is superseded.
      if (requestId !== refreshRequestId) return latestRefreshPromise
      const merged = new Map((Array.isArray(list) ? list : []).map(patient =>
        [patient.id, { ...patient, gender: normalizeGender(patient.gender) }],
      ))
      // Keep newer writes without hiding other patients returned by this list.
      for (const [id, change] of changesDuringRefresh) {
        if (change.revision <= startedAtRevision) continue
        if (change.patient) merged.set(id, change.patient)
        else merged.delete(id)
      }
      patients.value = [...merged.values()]
      changesDuringRefresh.clear()
      saveState()
      return patients.value
    })()
    latestRefreshPromise = pending
    return pending
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
      gender: normalizeGender(data.gender),
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
    return upsertPatient(created)
  }

  async function updatePatient(id, updates) {
    const idx = patients.value.findIndex((p) => p.id === id)
    if (idx !== -1) {
      if (updates.gender !== undefined) {
        updates.gender = normalizeGender(updates.gender)
      }
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
      return upsertPatient(updated)
    }
    return null
  }

  async function deletePatient(id) {
    const updated = await patientsApi.softDelete(id)
    upsertPatient(updated)
  }

  async function restorePatient(id) {
    const updated = await patientsApi.restore(id)
    upsertPatient(updated)
  }

  async function physicalDeletePatient(id) {
    const result = await patientsApi.hardDelete(id)
    patients.value = patients.value.filter((p) => p.id !== id)
    changesDuringRefresh.set(id, { revision: ++mutationRevision, patient: null })
    saveState()
    return result
  }

  const deletedPatients = computed(() => patients.value.filter((p) => p.deletedAt))

  async function refreshMergeRecords(operation) {
    operation.phase = 'refreshing'
    const results = await Promise.allSettled([
      Promise.resolve().then(() => refreshFromApi()),
      Promise.resolve().then(() => useConsultationsStore().refreshFromApi()),
      Promise.resolve().then(() => useAppointmentsStore().refreshFromApi()),
    ])
    if (results.some(result => result.status === 'rejected')) {
      operation.phase = 'refresh-required'
      return { refreshed: false, confirmed: operation.outcome === 'confirmed' }
    }
    const confirmed = operation.outcome === 'confirmed'
      || getPatient(operation.mergeId)?.mergedInto === operation.keepId
    mergeState.value = null
    return { refreshed: true, confirmed }
  }

  async function retryMergeRefresh() {
    const operation = mergeState.value
    if (!operation || operation.phase !== 'refresh-required') return null
    return refreshMergeRecords(operation)
  }

  async function mergePatients(keepId, mergeId) {
    if (mergeState.value) return false
    if (!keepId || !mergeId || keepId === mergeId) throw new Error('Select two different patient records.')
    mergeState.value = { keepId, mergeId, phase: 'submitting', outcome: 'unknown' }
    const operation = mergeState.value
    try {
      const result = await patientsApi.merge(keepId, mergeId)
      if (result?.ok !== true) throw new Error('Merge confirmation was not received.')
    } catch (error) {
      // A transport failure does not prove that the server did not commit.
      operation.phase = 'refresh-required'
      throw error
    }
    operation.outcome = 'confirmed'
    const source = getPatient(mergeId)
    if (source) upsertPatient({ ...source, isActive: false, mergedInto: keepId })
    await refreshMergeRecords(operation)
    // Preserve the existing success return for a confirmed merge even when a
    // read failed. Callers use mergeState to offer GET-only recovery.
    return true
  }

  async function signConsent(id, data = {}) {
    const updated = await patientsApi.signConsent(id, data)
    return upsertPatient(updated)
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

  function getPatientByStaffUserId(userId) {
    const target = normalizeId(userId)
    if (!target) return null
    return patients.value.find((p) => isLinkedStaffPatient(p, target)) || null
  }

  /**
   * 为员工自动建立病人档案（如果尚未建档）。
   * 用户创建时自动调用，确保所有工作人员都在病人列表里有记录。
   */
  async function ensureStaffPatient(user) {
    if (!user?.id) return null
    // User creation/update also syncs the patient on the server. Refresh before
    // matching so a stale local list cannot create a second linked profile.
    await refreshFromApi()
    // 已有关联档案则跳过
    const existing = getPatientByStaffUserId(user.id)
    if (existing) return existing
    // 家庭成员可能共用邮箱，姓名和邮箱必须同时匹配。
    const email = (user.email || '').trim()
    if (email) {
      const byEmail = findStaffPatientByIdentity(patients.value, user)
      if (byEmail) {
        // 仅关联唯一匹配且未关联其他员工的档案。
        const updated = await patientsApi.update(byEmail.id, {
          staffUserId: String(user.id),
          linkedUserId: String(user.id),
          isStaffProfile: true,
        })
        return upsertPatient(updated)
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
    patients, activePatients, deletedPatients, mergeState,
    getPatient, searchPatients, addPatient, updatePatient,
    deletePatient, restorePatient, physicalDeletePatient,
    refreshFromApi, mergePatients, retryMergeRefresh, signConsent, getPatientsByPractitioner,
    getPatientByStaffUserId, ensureStaffPatient,
  }
})
