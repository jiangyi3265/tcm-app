import { test, expect } from '@playwright/test'

test.use({ timezoneId: 'America/Toronto' })

const visitDate = '2026-10-09'
const intake = { chiefComplaint: 'Intake complaint', allergies: 'Example allergy' }
const appointment = (id, overrides = {}) => ({
  id, patientId: 'patient', practitionerId: 'doctor', status: 'booked',
  serviceType: 'acupuncture', startTime: `${visitDate}T10:00:00`, intakeFormData: {},
  ...overrides,
})

async function fixture(page, { appointments, existing = null, patientIntake = null }) {
  await page.clock.setFixedTime(new Date('2026-10-09T12:00:00-04:00'))
  const user = { id: 'doctor', name: 'QA Doctor', roles: ['admin', 'practitioner'], isActive: true }
  const patient = { id: 'patient', name: 'QA Patient', firstName: 'QA', lastName: 'Patient', isActive: true, latestIntakeFormData: patientIntake }
  let consultations = existing ? [{
    id: 'draft', patientId: patient.id, practitionerId: user.id, date: visitDate,
    status: 'draft', chiefComplaint: 'Existing complaint', prescriptions: [], services: [], ...existing,
  }] : []
  const writes = [], errors = [], appointmentRefreshesAfterCompletion = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(({ user, patient, consultations, appointments }) => {
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_patients', JSON.stringify([patient]))
    localStorage.setItem('tcm_consultations', JSON.stringify(consultations))
    localStorage.setItem('tcm_appointments', JSON.stringify(appointments))
    localStorage.setItem('tcm_lang', 'en')
  }, { user, patient, consultations, appointments })
  await page.route('**/api/**', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    const payload = request.postData() ? request.postDataJSON() : null
    if (method !== 'GET') writes.push({ path, method, body: payload })
    if (path === '/api/appointments' && method === 'GET' && consultations.some((row) => row.status === 'completed')) {
      appointmentRefreshesAfterCompletion.push(path)
    }
    let body = []
    if (path === '/api/users') body = [user]
    else if (path === '/api/patients') body = [patient]
    else if (path === '/api/appointments') body = appointments
    else if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, priceLists: [], rooms: [], taxRate: 0.13 }
    else if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    else if (path === '/api/consultations' && method === 'POST') {
      body = { ...payload, id: 'created' }
      consultations.push(body)
    } else if (path === '/api/consultations') body = consultations
    else if (/^\/api\/consultations\/(created|draft)$/.test(path)) {
      const id = path.split('/').at(-1), index = consultations.findIndex((row) => row.id === id)
      if (method === 'PUT') consultations[index] = { ...consultations[index], ...payload }
      body = consultations[index]
    } else if (/^\/api\/consultations\/(created|draft)\/complete$/.test(path)) {
      const id = path.split('/').at(-2), index = consultations.findIndex((row) => row.id === id)
      consultations[index] = { ...consultations[index], status: 'completed' }
      body = consultations[index]
    }
    await route.fulfill({ status: 200, json: body })
  })
  await page.goto(`/patients/patient/consultations/${existing ? 'draft' : 'new'}`)
  await page.waitForLoadState('networkidle')
  return { writes, errors, appointmentRefreshesAfterCompletion }
}

const scenarios = [
  { name: 'future intake only', appointments: [appointment('future', { startTime: '2026-10-16T10:00:00', intakeFormData: intake })], expected: null },
  { name: 'historical intake only', appointments: [appointment('past', { startTime: '2026-10-02T10:00:00', intakeFormData: intake })], expected: null },
  { name: 'unique current visit despite a newer future intake', appointments: [appointment('today'), appointment('future', { startTime: '2026-10-16T10:00:00', intakeFormData: intake })], expected: 'today' },
  { name: 'another practitioner', appointments: [appointment('other-doctor', { practitionerId: 'other', intakeFormData: intake })], expected: null },
  { name: 'missing practitioner', appointments: [appointment('unassigned', { practitionerId: null, intakeFormData: intake })], expected: null },
  { name: 'multiple matching appointments', appointments: [appointment('first', { intakeFormData: intake }), appointment('second', { status: 'confirmed' })], expected: null },
  { name: 'closed appointments and time blocks', appointments: [
    appointment('cancelled', { status: 'cancelled', intakeFormData: intake }),
    appointment('completed', { status: 'completed' }), appointment('blocked', { status: 'blocked' }),
    appointment('time-block', { serviceType: 'time_block' }),
  ], expected: null },
  { name: 'another patient', appointments: [appointment('other-patient', { patientId: 'other' })], patientIntake: intake, expected: null },
  { name: 'confirmed visit without its own intake', appointments: [appointment('today', { status: 'confirmed' })], patientIntake: intake, expected: 'today' },
]

for (const scenario of scenarios) {
  test(`completing a consultation safely handles ${scenario.name}`, async ({ page }) => {
    const { writes, errors, appointmentRefreshesAfterCompletion } = await fixture(page, scenario)
    await expect(page.locator('.el-form-item').filter({ hasText: 'Chief Complaint *' })).toContainText('Intake complaint')
    await page.getByRole('button', { name: 'Complete', exact: true }).click()
    await expect(page).toHaveURL(/\/patients\/patient$/)
    const created = writes.find((write) => write.path === '/api/consultations' && write.method === 'POST')
    expect(created.body).toMatchObject({ date: visitDate, chiefComplaint: intake.chiefComplaint, appointmentId: scenario.expected })
    expect(writes.filter((write) => write.path.endsWith('/complete'))).toHaveLength(1)
    expect(writes.filter((write) => write.path.startsWith('/api/appointments'))).toEqual([])
    expect(appointmentRefreshesAfterCompletion).toHaveLength(1)
    expect(errors).toEqual([])
  })
}

test('editing the consultation date rechecks the automatic appointment before saving', async ({ page }) => {
  const { writes, errors } = await fixture(page, { appointments: [appointment('today', { intakeFormData: intake })] })
  const dateInput = page.locator('.el-form-item').filter({ hasText: 'Date of Consultation *' }).locator('input')
  await dateInput.fill('2026-10-08')
  await dateInput.press('Enter')
  await page.getByRole('button', { name: 'Complete', exact: true }).click()
  await expect(page).toHaveURL(/\/patients\/patient$/)
  expect(writes.find((write) => write.path === '/api/consultations' && write.method === 'POST').body)
    .toMatchObject({ date: '2026-10-08', appointmentId: null })
  expect(writes.filter((write) => write.path.startsWith('/api/appointments'))).toEqual([])
  expect(errors).toEqual([])
})

test('an existing draft with a legacy future link delegates completion only to the backend', async ({ page }) => {
  const { writes, errors } = await fixture(page, {
    appointments: [appointment('future', { startTime: '2026-10-16T10:00:00' })],
    existing: { appointmentId: 'future' },
  })
  await page.getByRole('button', { name: 'Complete', exact: true }).click()
  await expect(page).toHaveURL(/\/patients\/patient$/)
  expect(writes.filter((write) => write.path === '/api/consultations/draft/complete')).toHaveLength(1)
  expect(writes.filter((write) => write.path.startsWith('/api/appointments'))).toEqual([])
  expect(errors).toEqual([])
})
