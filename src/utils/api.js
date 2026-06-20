import { getStoredItem, readStoredJson, removeStoredKey, writeStoredItem, writeStoredJson } from './storage'

const TOKEN_KEY = 'tcm_token'
const AUTH_KEY = 'tcm_auth'
let runtimeToken = null

function getToken() {
  return runtimeToken || getStoredItem(TOKEN_KEY)
}

export function setAuthToken(token) {
  runtimeToken = token || null
  if (token) {
    writeStoredItem(TOKEN_KEY, token)
  } else {
    removeStoredKey(TOKEN_KEY)
  }
}

function clearSession() {
  runtimeToken = null
  removeStoredKey(TOKEN_KEY)
  removeStoredKey(AUTH_KEY)
}

function buildQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })
  const queryString = search.toString()
  return queryString ? `?${queryString}` : ''
}

function normalizeScheduleParams(params = {}) {
  const normalized = { ...params }
  if (!normalized.weekStart && normalized.date) normalized.weekStart = normalized.date
  if (!normalized.date && normalized.weekStart) normalized.date = normalized.weekStart
  return normalized
}

async function request(path, { method = 'GET', body, auth = true, timeoutMs = 0 } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  }

  if (auth) {
    const token = getToken()
    if (!token) throw new Error('Please log in again.')
    headers.Authorization = `Bearer ${token}`
  }

  const controller = timeoutMs > 0 && typeof AbortController !== 'undefined'
    ? new AbortController()
    : null
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null

  let response
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Request timed out.')
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) clearSession()
    throw new Error(payload.msg || payload.message || `Request failed (${response.status})`)
  }
  return payload
}

async function parseResponsePayload(response) {
  const text = await response.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: text.trim() }
  }
}

function responseErrorMessage(payload, fallback, status) {
  const textMessage = String(payload?.msg || payload?.message || '').trim()
  if (textMessage && !textMessage.startsWith('<')) return textMessage
  return status ? `${fallback} (${status})` : fallback
}

async function requestMultipart(path, formData, fallback = 'Upload failed') {
  const token = getToken()
  if (!token) throw new Error('Please log in again.')
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  const payload = await parseResponsePayload(res)
  if (!res.ok) {
    if (res.status === 401) clearSession()
    throw new Error(responseErrorMessage(payload, fallback, res.status))
  }
  return payload
}

export const authApi = {
  login(email, password) {
    return request('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    })
  },
  me() {
    return request('/api/auth/me')
  },
  changePassword(oldPassword, newPassword) {
    return request('/api/auth/change-password', {
      method: 'POST',
      body: { oldPassword, newPassword },
    })
  },
  resetPassword(userId, newPassword) {
    return request('/api/auth/reset-password', {
      method: 'POST',
      body: { userId, newPassword },
    })
  },
}

export const bootstrapApi = {
  fetch() {
    return request('/api/bootstrap')
  },
  async exportData() {
    const token = getToken()
    const res = await fetch('/api/bootstrap/export', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clinic-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  },
  async importData(file) {
    const formData = new FormData()
    formData.append('file', file)
    const token = getToken()
    if (!token) throw new Error('Please log in again.')
    const res = await fetch('/api/bootstrap/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload.msg || payload.message || 'Import failed')
    return payload
  },
}

export const auditLogsApi = {
  list(targetType, limit = 200) {
    const params = new URLSearchParams()
    if (targetType) params.set('targetType', targetType)
    if (limit) params.set('limit', String(limit))
    return request(`/api/audit-logs?${params.toString()}`)
  },
  recent(days = 7) {
    return request(`/api/audit-logs/recent?days=${days}`)
  },
}

export const statisticsApi = {
  overview() {
    return request('/api/statistics/overview')
  },
}

export const usersApi = {
  list() { return request('/api/users') },
  create(data) { return request('/api/users', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/users/${id}`, { method: 'PUT', body: data }) },
  addInternshipToday(id) { return request(`/api/users/${id}/internship-today`, { method: 'POST' }) },
  recordApprenticeSession(action) {
    return request('/api/users/me/apprentice-session', { method: 'POST', body: { action } })
  },
  async uploadSignaturePng(id, file) {
    const formData = new FormData()
    formData.append('file', file)
    return requestMultipart(`/api/users/${id}/signature/upload`, formData, '医师签名上传失败')
  },
  remove(id) { return request(`/api/users/${id}`, { method: 'DELETE' }) },
}

export const patientsApi = {
  list() { return request('/api/patients') },
  get(id) { return request(`/api/patients/${id}`) },
  create(data) { return request('/api/patients', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/patients/${id}`, { method: 'PUT', body: data }) },
  softDelete(id) { return request(`/api/patients/${id}/delete`, { method: 'PATCH' }) },
  restore(id) { return request(`/api/patients/${id}/restore`, { method: 'PATCH' }) },
  hardDelete(id) { return request(`/api/patients/${id}`, { method: 'DELETE' }) },
  merge(keepId, mergeId) {
    return request(`/api/patients/${keepId}/merge`, { method: 'POST', body: { mergeId } })
  },
  signConsent(id, data = {}) { return request(`/api/patients/${id}/consent`, { method: 'PATCH', body: data }) },
  sendConsentEmail(id, data = {}) {
    return request(`/api/patients/${id}/consent/send`, { method: 'POST', body: data })
  },
  sendIntakeEmail(id, data = {}) {
    return request(`/api/patients/${id}/intake/send`, { method: 'POST', body: data })
  },
}

export const appointmentsApi = {
  list() { return request('/api/appointments') },
  create(data) { return request('/api/appointments', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/appointments/${id}`, { method: 'PUT', body: data }) },
  availability(params = {}) {
    return request(`/api/appointments/availability${buildQuery(params)}`)
  },
  status(id, status) {
    return request(`/api/appointments/${id}/status`, { method: 'PATCH', body: { status } })
  },
  checkSlot(data) {
    return request('/api/appointments/check-slot', { method: 'POST', body: data })
  },
  generateIntakeLink(id) {
    return request(`/api/appointments/${id}/intake-link`, { method: 'POST' })
  },
}

export const consultationsApi = {
  list() { return request('/api/consultations') },
  get(id) { return request(`/api/consultations/${id}`) },
  create(data) { return request('/api/consultations', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/consultations/${id}`, { method: 'PUT', body: data }) },
  updateInvoicePricing(id, data) {
    return request(`/api/consultations/${id}/invoice-pricing`, { method: 'PATCH', body: data })
  },
  complete(id) { return request(`/api/consultations/${id}/complete`, { method: 'PATCH' }) },
  reactivate(id) { return request(`/api/consultations/${id}/reactivate`, { method: 'PATCH' }) },
  paid(id, data = {}) {
    return request(`/api/consultations/${id}/paid`, { method: 'PATCH', body: data })
  },
  createPayment(id, data = {}) {
    return request(`/api/consultations/${id}/payments`, { method: 'POST', body: data })
  },
  syncPrescription(id, data) {
    return request(`/api/consultations/${id}/prescriptions`, { method: 'PATCH', body: data })
  },
  completePrescription(id, prescriptionId, data = {}) {
    return request(`/api/consultations/${id}/prescriptions/${prescriptionId}/complete`, { method: 'PATCH', body: data })
  },
  deletePrescription(id, prescriptionId, data = {}) {
    return request(`/api/consultations/${id}/prescriptions/${prescriptionId}/delete`, { method: 'PATCH', body: data })
  },
  deletedPrescriptions() {
    return request('/api/consultations/deleted-prescriptions')
  },
  restoreDeletedPrescription(id, prescriptionId) {
    return request(`/api/consultations/${id}/prescriptions/${prescriptionId}/restore-deleted`, { method: 'PATCH' })
  },
  hardDeletePrescription(id, prescriptionId, { restoreInventory = false } = {}) {
    const params = restoreInventory ? '?restoreInventory=true' : ''
    return request(`/api/consultations/${id}/prescriptions/${prescriptionId}${params}`, { method: 'DELETE' })
  },
  reopenPrescription(id, prescriptionId) {
    return request(`/api/consultations/${id}/prescriptions/${prescriptionId}/reopen`, { method: 'PATCH' })
  },
  dispensePrescription(id, prescriptionId) {
    return request(`/api/consultations/${id}/prescriptions/${prescriptionId}/dispense`, { method: 'PATCH' })
  },
  dispense(id, { skipDeduct = true } = {}) {
    const params = skipDeduct ? '?skipDeduct=true' : ''
    return request(`/api/consultations/${id}/dispense${params}`, { method: 'PATCH' })
  },
  softDelete(id) { return request(`/api/consultations/${id}/delete`, { method: 'PATCH' }) },
  restore(id) { return request(`/api/consultations/${id}/restore`, { method: 'PATCH' }) },
  hardDelete(id) { return request(`/api/consultations/${id}`, { method: 'DELETE' }) },
  generateReport(id) {
    return request(`/api/consultations/${id}/pdf/report`, { method: 'POST' })
  },
  generateInvoice(id) {
    return request(`/api/consultations/${id}/pdf/invoice`, { method: 'POST' })
  },
}

export const aiApi = {
  consultationNotes(data) {
    return request('/api/ai/consultation-notes', {
      method: 'POST',
      body: data,
      timeoutMs: 20 * 60 * 1000,
    })
  },
}

export const stripeApi = {
  createCheckoutSession(consultationId) {
    return request('/api/stripe/checkout-sessions', {
      method: 'POST',
      body: { consultationId },
    })
  },
  createTerminalPayment(consultationId) {
    return request('/api/stripe/terminal-payments', {
      method: 'POST',
      body: { consultationId },
    })
  },
  getTerminalPaymentStatus(consultationId, paymentIntentId) {
    return request('/api/stripe/terminal-payments/status', {
      method: 'POST',
      body: { consultationId, paymentIntentId },
    })
  },
}

export const inventoryApi = {
  list(options = {}) {
    const params = buildQuery({ includeDeleted: options.includeDeleted ? true : undefined })
    return request(`/api/inventory${params}`)
  },
  create(data) { return request('/api/inventory', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/inventory/${id}`, { method: 'PUT', body: data }) },
  softDelete(id) { return request(`/api/inventory/${id}/delete`, { method: 'PATCH' }) },
  restore(id) { return request(`/api/inventory/${id}/restore`, { method: 'PATCH' }) },
  hardDelete(id) { return request(`/api/inventory/${id}`, { method: 'DELETE' }) },
  adjust(id, delta, reason) {
    return request(`/api/inventory/${id}/adjust`, { method: 'POST', body: { delta, reason } })
  },
  adjustmentHistory(itemId) {
    const params = itemId ? `?itemId=${itemId}` : ''
    return request(`/api/inventory/adjustment-history${params}`)
  },
  batchImport(items) {
    return request('/api/inventory/batch-import', { method: 'POST', body: { items } })
  },
  deductPrescription(herbals, prescriptionType) {
    return request('/api/inventory/deduct-prescription', {
      method: 'POST',
      body: { herbals, prescriptionType },
    })
  },
  listByHerb(herbDictId) {
    return request(`/api/inventory/by-herb/${herbDictId}`)
  },
  restorePrescription(herbals, prescriptionType) {
    return request('/api/inventory/restore-prescription', {
      method: 'POST',
      body: { herbals, prescriptionType },
    })
  },
}

export const branchesApi = {
  list() { return request('/api/branches') },
  create(data) { return request('/api/branches', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/branches/${id}`, { method: 'PUT', body: data }) },
  toggle(id) { return request(`/api/branches/${id}/toggle`, { method: 'PATCH' }) },
  remove(id) { return request(`/api/branches/${id}/delete`, { method: 'PATCH' }) },
}

export const settingsApi = {
  getBundle() { return request('/api/settings') },
  updateBase(data) { return request('/api/settings/base', { method: 'PUT', body: data }) },
  getStripeSettings() { return request('/api/settings/stripe') },
  updateStripeSettings(data) { return request('/api/settings/stripe', { method: 'PUT', body: data }) },
  async uploadSignaturePng(file) {
    const formData = new FormData()
    formData.append('file', file)
    return requestMultipart('/api/settings/signature/upload', formData, '签名上传失败')
  },
  async uploadSealPng(file) {
    const formData = new FormData()
    formData.append('file', file)
    return requestMultipart('/api/settings/seal/upload', formData, '印章上传失败')
  },
  addRoom(data) { return request('/api/settings/rooms', { method: 'POST', body: data }) },
  updateRoom(id, data) { return request(`/api/settings/rooms/${id}`, { method: 'PUT', body: data }) },
  updateServiceType(key, data) {
    return request(`/api/settings/service-types/${key}`, { method: 'PUT', body: data })
  },
  addServiceType(data) {
    return request('/api/settings/service-types', { method: 'POST', body: data })
  },
  deleteServiceType(key) {
    return request(`/api/settings/service-types/${key}`, { method: 'DELETE' })
  },
  addPriceList(data) { return request('/api/settings/price-lists', { method: 'POST', body: data }) },
  updatePriceList(id, data) {
    return request(`/api/settings/price-lists/${id}`, { method: 'PUT', body: data })
  },
  deletePriceList(id) {
    return request(`/api/settings/price-lists/${id}`, { method: 'DELETE' })
  },
}

export const emailLogsApi = {
  list() { return request('/api/email-logs') },
  create(data) { return request('/api/email-logs', { method: 'POST', body: data }) },
}

export const formulasApi = {
  list() { return request('/api/formulas') },
  get(id) { return request(`/api/formulas/${id}`) },
  create(data) { return request('/api/formulas', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/formulas/${id}`, { method: 'PUT', body: data }) },
  softDelete(id) { return request(`/api/formulas/${id}/delete`, { method: 'PATCH' }) },
  restore(id) { return request(`/api/formulas/${id}/restore`, { method: 'PATCH' }) },
  hardDelete(id) { return request(`/api/formulas/${id}`, { method: 'DELETE' }) },
}

export const suppliersApi = {
  list() { return request('/api/suppliers') },
  get(id) { return request(`/api/suppliers/${id}`) },
  create(data) { return request('/api/suppliers', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/suppliers/${id}`, { method: 'PUT', body: data }) },
  softDelete(id) { return request(`/api/suppliers/${id}/delete`, { method: 'PATCH' }) },
  restore(id) { return request(`/api/suppliers/${id}/restore`, { method: 'PATCH' }) },
  hardDelete(id) { return request(`/api/suppliers/${id}`, { method: 'DELETE' }) },
}

export const acupointsApi = {
  list() { return request('/api/acupoints') },
  get(id) { return request(`/api/acupoints/${id}`) },
  create(data) { return request('/api/acupoints', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/acupoints/${id}`, { method: 'PUT', body: data }) },
  softDelete(id) { return request(`/api/acupoints/${id}/delete`, { method: 'PATCH' }) },
  restore(id) { return request(`/api/acupoints/${id}/restore`, { method: 'PATCH' }) },
  hardDelete(id) { return request(`/api/acupoints/${id}`, { method: 'DELETE' }) },
}

export const unitConversionsApi = {
  list() { return request('/api/unit-conversions') },
  create(data) { return request('/api/unit-conversions', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/unit-conversions/${id}`, { method: 'PUT', body: data }) },
  remove(id) { return request(`/api/unit-conversions/${id}`, { method: 'DELETE' }) },
  convert(data) { return request('/api/unit-conversions/convert', { method: 'POST', body: data }) },
}

export const herbDictApi = {
  list() { return request('/api/herb-dict') },
  get(id) { return request(`/api/herb-dict/${id}`) },
  create(data) { return request('/api/herb-dict', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/herb-dict/${id}`, { method: 'PUT', body: data }) },
  softDelete(id) { return request(`/api/herb-dict/${id}/delete`, { method: 'PATCH' }) },
  restore(id) { return request(`/api/herb-dict/${id}/restore`, { method: 'PATCH' }) },
  hardDelete(id) { return request(`/api/herb-dict/${id}`, { method: 'DELETE' }) },
}

export const meridiansApi = {
  list() { return request('/api/meridians') },
  get(id) { return request(`/api/meridians/${id}`) },
  create(data) { return request('/api/meridians', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/meridians/${id}`, { method: 'PUT', body: data }) },
  softDelete(id) { return request(`/api/meridians/${id}/delete`, { method: 'PATCH' }) },
  restore(id) { return request(`/api/meridians/${id}/restore`, { method: 'PATCH' }) },
  hardDelete(id) { return request(`/api/meridians/${id}`, { method: 'DELETE' }) },
}

export const templatesApi = {
  list() { return request('/api/templates') },
  get(id) { return request(`/api/templates/${id}`) },
  create(data) { return request('/api/templates', { method: 'POST', body: data }) },
  update(id, data) { return request(`/api/templates/${id}`, { method: 'PUT', body: data }) },
  softDelete(id) { return request(`/api/templates/${id}/delete`, { method: 'PATCH' }) },
  restore(id) { return request(`/api/templates/${id}/restore`, { method: 'PATCH' }) },
  hardDelete(id) { return request(`/api/templates/${id}`, { method: 'DELETE' }) },
}

async function resolveFileUrl(path) {
  if (!path) throw new Error('Missing file path')
  if (/^(blob:|data:|https?:)/.test(path)) return path
  if (path.startsWith('/api/public/files/access')) return path
  if (
    path.startsWith('/profile/')
    || path.startsWith('hospital-private/')
    || path.startsWith('/hospital-private/')
  ) {
    const payload = await request(`/api/files/access-url?resource=${encodeURIComponent(path)}`)
    return payload.url || path
  }
  return path
}

export const filesApi = {
  upload(file, { patientId, consultationId, fileType } = {}) {
    const formData = new FormData()
    formData.append('file', file)
    if (patientId) formData.append('patientId', patientId)
    if (consultationId) formData.append('consultationId', consultationId)
    if (fileType) formData.append('fileType', fileType)
    return requestMultipart('/api/files/upload', formData, 'Upload failed')
  },
  listByPatient(patientId) {
    return request(`/api/files/patient/${patientId}`)
  },
  listByConsultation(consultationId) {
    return request(`/api/files/consultation/${consultationId}`)
  },
  async downloadAllByPatient(patientId) {
    const token = getToken()
    if (!token) throw new Error('Please log in again.')
    const res = await fetch(`/api/files/patient/${patientId}/download-all`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throw new Error(payload.msg || payload.message || 'Download failed')
    }
    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename="?([^"]+)"?/)
    const fileName = match?.[1] || `patient-${patientId}-files.zip`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  },
  remove(id) {
    return request(`/api/files/${id}`, { method: 'DELETE' })
  },
  async resolveUrl(path) {
    return resolveFileUrl(path)
  },
  async open(path) {
    const resolvedUrl = await resolveFileUrl(path)
    window.open(resolvedUrl, '_blank', 'noopener')
  },
}

export const consentPublicApi = {
  getInfo(token) {
    return request(`/api/consent/${token}`, { auth: false })
  },
  sign(token, signatureName, sectionAcknowledgements = {}) {
    return request(`/api/consent/${token}/sign`, {
      method: 'POST',
      body: { signatureName, sectionAcknowledgements },
      auth: false,
    })
  },
}

export const intakePublicApi = {
  getInfo(token) {
    return request(`/api/intake/${token}`, { auth: false })
  },
  submit(token, formData) {
    return request(`/api/intake/${token}/submit`, {
      method: 'POST',
      body: formData,
      auth: false,
    })
  },
  cancel(token) {
    return request(`/api/intake/${token}/cancel`, {
      method: 'POST',
      auth: false,
    })
  },
}

export const publicBookingApi = {
  options() {
    return request('/api/public-booking/options', { auth: false })
  },
  schedule(params = {}) {
    return request(`/api/public-booking/schedule${buildQuery(normalizeScheduleParams(params))}`, { auth: false })
  },
  availability(params = {}) {
    return request(`/api/public-booking/availability${buildQuery(params)}`, { auth: false })
  },
  create(data) {
    return request('/api/public-booking', {
      method: 'POST',
      body: data,
      auth: false,
    })
  },
  manageInfo(token) {
    return request(`/api/public-booking/manage/${token}`, { auth: false })
  },
  cancel(token, data = {}) {
    return request(`/api/public-booking/manage/${token}/cancel`, {
      method: 'POST',
      body: data,
      auth: false,
    })
  },
}

export function applyBootstrapToLocalStorage(payload) {
  if (!payload) return
  writeStoredJson('tcm_users', payload.users || [])
  writeStoredJson('tcm_patients', payload.patients || [])
  writeStoredJson('tcm_appointments', payload.appointments || [])
  writeStoredJson('tcm_consultations', payload.consultations || [])
  writeStoredJson('tcm_inventory', payload.inventory || [])
  writeStoredJson('tcm_branches', {
    branches: payload.branches || [],
    currentBranchId: readStoredJson('tcm_branches', {})?.currentBranchId || null,
  })
  writeStoredJson('tcm_settings', payload.settings || {})
  writeStoredJson('tcm_email_log', payload.emailLog || [])
  writeStoredJson('tcm_formulas', payload.formulas || [])
  writeStoredJson('tcm_suppliers', payload.suppliers || [])
  writeStoredJson('tcm_acupoints', payload.acupoints || [])
  writeStoredJson('tcm_unit_conversions', payload.unitConversions || [])
  writeStoredJson('tcm_herb_dict', payload.herbDict || [])
  writeStoredJson('tcm_meridians', payload.meridians || [])
  writeStoredJson('tcm_templates', payload.templates || [])
}
