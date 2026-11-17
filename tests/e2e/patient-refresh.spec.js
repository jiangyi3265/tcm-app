import { test, expect } from '@playwright/test'

test.use({ timezoneId: 'America/Toronto' })
let patientGate, patientReadStarted = false

const date = '2026-11-17'
const start = time => `${date} ${time}:00`

async function fixture(page, { dripEnabled = true, dripMinutes = 240, onWrite, multipleServices = false } = {}) {
  await page.clock.setFixedTime(new Date('2026-11-17T08:00:00-05:00'))
  const user = { id: 'doctor', name: 'Fixture Doctor', roles: ['admin', 'practitioner'], isActive: true,
    serviceKeys: ['followup', 'brief'], dripEnabled, workingHours: { tuesday: [{ start: '09:00', end: '17:00' }] } }
  const users = multipleServices ? [user, { ...user, id: 'other-doctor', name: 'Other Fixture Doctor' }] : [user]
  const patient = { id: 'patient', name: 'Fixture Patient', isActive: true, emails: ['fixture@example.invalid'] }
  const appointment = { id: 'existing', patientId: patient.id, practitionerId: user.id, roomId: 'room',
    serviceType: 'followup', status: 'booked', startTime: start('10:30'), endTime: start('11:30') }
  const settings = { currency: 'CAD', publicBookingDripMinutes: dripMinutes, publicBookingDripWindowDays: 7,
    serviceTypes: { followup: { label: 'Fixture follow-up', duration: 60, roomRequired: true, requiredTag: 'acupuncture' } },
    priceLists: [], rooms: [{ id: 'room', name: 'Fixture Room', isActive: true, supportTags: ['acupuncture'] }] }
  if (multipleServices) settings.serviceTypes.brief = { label: 'Brief fixture service', duration: 30 }
  const reads = [], writes = [], errors = []
  let holdAvailability = false, releaseAvailability
  let availabilityGate = Promise.resolve()
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({ user, patient, appointment }) => {
    localStorage.clear()
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_patients', JSON.stringify([patient]))
    localStorage.setItem('tcm_appointments', JSON.stringify([appointment]))
    localStorage.setItem('tcm_lang', 'en')
  }, { user, patient, appointment })
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    const method = request.method()
    if (method !== 'GET') writes.push({ path, method, body: request.postDataJSON() })
    if (method !== 'GET' && onWrite) return onWrite(route)
    if (path.startsWith('/api/public-booking')) throw new Error('Staff must never use public drip availability')
    let body = []
    if (path === '/api/users') body = users
    else if (path === '/api/patients') { patientReadStarted = true; await patientGate; body = [patient] }
    else if (path === '/api/settings') body = settings
    else if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    else if (path === '/api/appointments') body = method === 'GET' ? [appointment] : { id: 'created', ...request.postDataJSON() }
    else if (path === '/api/appointments/existing') body = { ...appointment, ...request.postDataJSON() }
    else if (path === '/api/appointments/availability') {
      reads.push(Object.fromEntries(url.searchParams))
      if (holdAvailability) await availabilityGate
      const day = url.searchParams.get('date')
      const duration = settings.serviceTypes[url.searchParams.get('serviceType')]?.duration || 60
      const practitionerId = url.searchParams.get('practitionerId') || user.id
      body = { duration, slotStepMinutes: 10, slots: ['10:00', '10:30', '14:00'].map(time => ({
        startTime: `${day} ${time}:00`, endTime: `${day} ${new Date(Date.parse(`2000-01-01T${time}:00Z`) + duration * 60000).toISOString().slice(11, 19)}`,
        assignedPractitionerId: practitionerId, availablePractitionerIds: [practitionerId], roomId: 'room',
      })) }
    }
    await route.fulfill({ json: body })
  })
  await page.goto('/appointments')
  await expect(page.locator('.appt-block').filter({ hasText: 'Fixture Patient' })).toBeVisible()
  return { reads, writes, errors, hold() { holdAvailability = true; availabilityGate = new Promise(resolve => { releaseAvailability = resolve }) },
    release() { holdAvailability = false; releaseAvailability?.() } }
}

async function openCreate(page) {
  await page.getByRole('button', { name: 'New Appointment', exact: true }).click()
  const drawer = page.locator('.el-drawer').filter({ hasText: 'New Appointment' })
  await expect(drawer.locator('.availability-card')).toHaveCount(3)
  await drawer.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: /^Patient$/ }) }).getByRole('combobox').click()
  await page.getByRole('option', { name: /Fixture Patient/ }).click()
  return drawer
}

test('a delayed initial patient list preserves the name of a quick-created patient and their appointment', async ({ page }) => {
  let release
  patientGate = new Promise(resolve => { release = resolve })
  const state = await fixture(page, { onWrite: async route => route.fulfill({json: {...route.request().postDataJSON(), id: new URL(route.request().url()).pathname === '/api/patients' ? 'quick-patient' : 'created', isActive:true}}) })
  await expect.poll(() => patientReadStarted).toBe(true)
  const drawer = await openCreate(page)
  await drawer.getByRole('button', { name: '新建', exact:true }).click()
  await drawer.getByPlaceholder('姓 Last name',{exact:true}).fill('Newfamily')
  await drawer.getByPlaceholder('名 First name',{exact:true}).fill('Newperson')
  await drawer.getByPlaceholder('邮箱',{exact:true}).fill('new-patient@example.invalid')
  await drawer.getByRole('button',{name:'创建并选择',exact:true}).click()
  await expect(drawer).toContainText('Newfamily Newperson')
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('tcm_patients')).some(p=>p.id==='quick-patient'))).toBe(true)
  const initialList = page.waitForResponse(response => new URL(response.url()).pathname === '/api/patients' && response.request().method() === 'GET')
  release()
  await initialList
  await page.waitForLoadState('networkidle')
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('tcm_patients')).some(p=>p.id==='quick-patient'))).toBe(true)
  await drawer.locator('.availability-card').filter({hasText:'14:00 -'}).click()
  await drawer.getByRole('button',{name:'Confirm Appointment',exact:true}).click()
  await expect(drawer).not.toBeVisible()
  const appointment = page.locator('.appt-block').filter({hasText:'14:00 - 15:00'})
  await expect(appointment).toContainText('Newfamily Newperson')
  await expect(appointment).not.toContainText('Unknown')
  expect(state.writes.find(write=>write.path==='/api/appointments').body.patientId).toBe('quick-patient')
  expect(state.errors).toEqual([])
})
