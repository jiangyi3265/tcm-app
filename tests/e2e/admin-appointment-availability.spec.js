import { test, expect } from '@playwright/test'

const date = '2026-11-17'
const start = time => `${date} ${time}:00`

async function fixture(page, { dripEnabled = true, dripMinutes = 240 } = {}) {
  await page.clock.setFixedTime(new Date('2026-11-17T08:00:00-05:00'))
  const user = { id: 'doctor', name: 'Fixture Doctor', roles: ['admin', 'practitioner'], isActive: true,
    serviceKeys: ['followup'], dripEnabled, workingHours: { tuesday: [{ start: '09:00', end: '17:00' }] } }
  const patient = { id: 'patient', name: 'Fixture Patient', isActive: true, emails: ['fixture@example.invalid'] }
  const appointment = { id: 'existing', patientId: patient.id, practitionerId: user.id, roomId: 'room',
    serviceType: 'followup', status: 'booked', startTime: start('10:30'), endTime: start('11:30') }
  const settings = { currency: 'CAD', publicBookingDripMinutes: dripMinutes, publicBookingDripWindowDays: 7,
    serviceTypes: { followup: { label: 'Fixture follow-up', duration: 60, roomRequired: true, requiredTag: 'acupuncture' } },
    priceLists: [], rooms: [{ id: 'room', name: 'Fixture Room', isActive: true, supportTags: ['acupuncture'] }] }
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
    if (path.startsWith('/api/public-booking')) throw new Error('Staff must never use public drip availability')
    let body = []
    if (path === '/api/users') body = [user]
    else if (path === '/api/patients') body = [patient]
    else if (path === '/api/settings') body = settings
    else if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    else if (path === '/api/appointments') body = method === 'GET' ? [appointment] : { id: 'created', ...request.postDataJSON() }
    else if (path === '/api/appointments/existing') body = { ...appointment, ...request.postDataJSON() }
    else if (path === '/api/appointments/availability') {
      reads.push(Object.fromEntries(url.searchParams))
      if (holdAvailability) await availabilityGate
      const day = url.searchParams.get('date')
      body = { duration: 60, slotStepMinutes: 10, slots: ['10:00', '10:30', '14:00'].map(time => ({
        startTime: `${day} ${time}:00`, endTime: `${day} ${String(Number(time.slice(0, 2)) + 1).padStart(2, '0')}:${time.slice(3)}:00`,
        assignedPractitionerId: user.id, availablePractitionerIds: [user.id], roomId: 'room',
      })) }
    }
    await route.fulfill({ json: body })
  })
  await page.goto('/appointments')
  await expect(page.locator('.appt-block').filter({ hasText: 'Fixture Patient' })).toBeVisible()
  return { reads, writes, errors, hold() { holdAvailability = true; availabilityGate = new Promise(resolve => { releaseAvailability = resolve }) },
    release() { holdAvailability = false; releaseAvailability?.() } }
}

async function openEdit(page) {
  await page.locator('.appt-block').filter({ hasText: 'Fixture Patient' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const drawer = page.locator('.el-drawer').filter({ hasText: 'Edit Appointment' })
  await expect(drawer.locator('.availability-card')).toHaveCount(3)
  return drawer
}

for (const dripEnabled of [true, false]) {
  for (const time of ['10:00', '14:00']) {
    test(`staff can select and save ${time} with drip ${dripEnabled ? 'enabled at 240 minutes' : 'disabled'}`, async ({ page }) => {
      const state = await fixture(page, { dripEnabled })
      const drawer = await openEdit(page)
      await drawer.locator('.availability-card').filter({ hasText: `${time} -` }).click()
      await drawer.getByRole('button', { name: 'Save Changes', exact: true }).click()
      await expect.poll(() => state.writes.length).toBe(1)
      expect(state.writes[0]).toMatchObject({ method: 'PUT', path: '/api/appointments/existing', body: { startTime: start(time), practitionerId: 'doctor', serviceType: 'followup' } })
      expect(state.reads.at(-1)).toMatchObject({ excludeId: 'existing', serviceType: 'followup', practitionerId: 'doctor' })
      expect(state.errors).toEqual([])
    })
  }
}

test('staff cannot save a stale time while loading availability for a changed date', async ({ page }) => {
  const state = await fixture(page)
  const drawer = await openEdit(page)
  state.hold()
  const dateInput = drawer.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: /^Date$/ }) }).locator('input')
  await dateInput.fill('2026-11-18')
  await dateInput.press('Enter')
  await expect.poll(() => state.reads.at(-1)?.date).toBe('2026-11-18')
  await expect(drawer.getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
  expect(state.writes).toEqual([])
  state.release()
  await expect(drawer.locator('.availability-card')).toHaveCount(3)
  await drawer.locator('.availability-card').filter({ hasText: '14:00 -' }).click()
  await drawer.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0].body.startTime).toBe('2026-11-18 14:00:00')
  expect(state.errors).toEqual([])
})

test('a failed availability refresh clears old times and prevents saving', async ({ page }) => {
  const state = await fixture(page)
  const drawer = await openEdit(page)
  await page.route('**/api/appointments/availability**', route => route.fulfill({ status: 503, json: { message: 'Availability temporarily unavailable' } }))
  const dateInput = drawer.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: /^Date$/ }) }).locator('input')
  await dateInput.fill('2026-11-18')
  await dateInput.press('Enter')
  await expect(page.getByText('Availability temporarily unavailable', { exact: true })).toBeVisible()
  await expect(drawer.locator('.availability-card')).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
  expect(state.writes).toEqual([])
  expect(state.errors).toEqual([])
})
