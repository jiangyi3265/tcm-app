import { test, expect } from '@playwright/test'

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
    else if (path === '/api/patients') body = [patient]
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


test('time block submits once, locks its dialog while pending and safely retries failure', async ({ page }) => {
  let release, attempts = 0
  const gate = new Promise(resolve => { release = resolve })
  const state = await fixture(page, { onWrite: async route => {
    attempts++
    if (attempts === 1) {
      await gate
      return route.fulfill({ status: 503, json: { message: 'Fixture time block failure' } })
    }
    return route.fulfill({ json: { ...route.request().postDataJSON(), id: 'new-block' } })
  } })
  await page.getByRole('button', { name: '添加时间占用', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '添加时间占用', exact: true })
  await dialog.getByPlaceholder('可选，如：全天请假', { exact: true }).fill('Synthetic blocked period')
  const submit = dialog.getByRole('button', { name: '确认占用', exact: true })
  await submit.evaluate(button => { button.click(); button.click() })
  await expect.poll(() => state.writes.length).toBe(1)
  await expect(submit).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await expect(dialog.getByPlaceholder('可选，如：全天请假', { exact: true })).toBeDisabled()
  await expect(dialog.locator('.el-dialog__headerbtn')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  release()
  await expect(page.getByText('Fixture time block failure', { exact: true })).toBeVisible()
  await expect(submit).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled()
  await expect(dialog.getByPlaceholder('可选，如：全天请假', { exact: true })).toHaveValue('Synthetic blocked period')
  await submit.click()
  await expect.poll(() => state.writes.length).toBe(2)
  expect(state.writes[0].body).toMatchObject({ serviceType: 'time_block', status: 'blocked', practitionerId: 'doctor', patientId: null })
  expect(state.writes[1].body).toMatchObject(state.writes[0].body)
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.appt-block').filter({ hasText: 'Synthetic blocked period' })).toBeVisible()
  await page.getByRole('button', { name: '添加时间占用', exact: true }).click()
  await expect(dialog).toBeVisible()
  await expect(submit).toBeEnabled()
  await expect(dialog.getByPlaceholder('可选，如：全天请假', { exact: true })).toHaveValue('')
  expect(state.errors).toEqual([])
})
