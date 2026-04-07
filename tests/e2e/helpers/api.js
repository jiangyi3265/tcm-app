const ADMIN_CREDENTIALS = {
  email: 'admin@clinic.com',
  password: 'admin123',
}
const BROWSER_LIKE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function readJson(response) {
  const contentType = response.headers()['content-type'] || ''
  if (!contentType.includes('application/json')) {
    return null
  }
  return response.json()
}

async function expectOk(response, context) {
  if (response.ok()) {
    return readJson(response)
  }
  const payload = await readJson(response)
  throw new Error(payload?.msg || payload?.message || `${context} failed with ${response.status()}`)
}

export async function loginAsAdmin(request) {
  return loginWithCredentials(request, ADMIN_CREDENTIALS)
}

export async function loginWithCredentials(request, credentials) {
  const response = await request.post('http://127.0.0.1:8006/api/auth/login', {
    headers: { 'User-Agent': BROWSER_LIKE_USER_AGENT },
    data: credentials,
  })
  return expectOk(response, `login ${credentials?.email || 'unknown'}`)
}

export async function apiJson(request, path, { method = 'GET', token, data } = {}) {
  const response = await request.fetch(`http://127.0.0.1:8006${path}`, {
    method,
    headers: {
      'User-Agent': BROWSER_LIKE_USER_AGENT,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    data,
  })
  return expectOk(response, `${method} ${path}`)
}

export async function getUserById(request, userId) {
  const { token } = await loginAsAdmin(request)
  const payload = await apiJson(request, '/api/users', { token })
  const users = Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : []
  return users.find((item) => String(item.id) === String(userId)) || null
}

export async function ensurePractitionerSchedule(request, practitionerId, workingHours) {
  const { token } = await loginAsAdmin(request)
  return apiJson(request, `/api/users/${practitionerId}`, {
    method: 'PUT',
    token,
    data: { workingHours },
  })
}

export async function withTemporaryPractitionerSchedule(request, practitionerId, workingHours, callback) {
  const originalUser = await getUserById(request, practitionerId)
  const originalWorkingHours = originalUser?.workingHours || {}
  await ensurePractitionerSchedule(request, practitionerId, workingHours)
  try {
    return await callback()
  } finally {
    await ensurePractitionerSchedule(request, practitionerId, originalWorkingHours)
  }
}

export async function createPatient(request, overrides = {}) {
  const { token } = await loginAsAdmin(request)
  const suffix = uniqueSuffix()
  return apiJson(request, '/api/patients', {
    method: 'POST',
    token,
    data: {
      name: overrides.name || `E2E预约病人-${suffix}`,
      phone: overrides.phone || `139${String(Date.now()).slice(-8)}`,
      email: overrides.email || '',
      isActive: true,
      ...overrides,
    },
  })
}

export async function createDraftConsultation(request, overrides = {}) {
  const { token } = await loginAsAdmin(request)
  return apiJson(request, '/api/consultations', {
    method: 'POST',
    token,
    data: {
      patientId: 'patient-1',
      practitionerId: '101',
      date: new Date().toISOString().slice(0, 10),
      chiefComplaint: `E2E draft ${uniqueSuffix()}`,
      differentiation: 'E2E smoke',
      prescriptions: [],
      herbals: [],
      services: [],
      consultationFee: 0,
      discountType: 'none',
      discountValue: 0,
      taxable: false,
      includeRxAmount: true,
      currency: 'CAD',
      totalAmount: 0,
      taxAmount: 0,
      totalWithoutTax: 0,
      ...overrides,
    },
  })
}
