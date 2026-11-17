import { test, expect } from '@playwright/test'

test.use({ timezoneId: 'America/Toronto' })
const date = '2026-11-17'
const at = time => `${date} ${time}:00`

async function setup(page) {
  await page.clock.setFixedTime(new Date('2026-11-17T08:00:00-05:00'))
  const user = { id: 'doctor', name: 'Fixture Doctor', roles: ['admin', 'practitioner'], isActive: true,
    serviceKeys: ['followup'], workingHours: { tuesday: [{ start: '09:00', end: '17:00' }] } }
  const patients = [{ id: 'cached-patient', name: 'Cache Patient', emails: ['cached@example.invalid'], isActive: true },
    { id: 'server-patient', name: 'Server Patient', emails: ['server@example.invalid'], isActive: true }]
  const cached = { id: 'existing', patientId: 'cached-patient', practitionerId: 'doctor', serviceType: 'followup',
    status: 'booked', startTime: at('10:00'), endTime: at('11:00') }
  const serverOnly = { ...cached, id: 'server-only', patientId: 'server-patient', startTime: at('12:00'), endTime: at('13:00') }
  let release, initialReadStarted = false
  const delayedList = new Promise(resolve => { release = resolve })
  const writes = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({ user, patients, cached }) => {
    localStorage.clear()
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_patients', JSON.stringify(patients))
    localStorage.setItem('tcm_appointments', JSON.stringify([cached]))
    localStorage.setItem('tcm_lang', 'en')
  }, { user, patients, cached })
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const method = request.method()
    let body = []
    if (method !== 'GET') writes.push({ path, method, body: request.postDataJSON() })
    if (path === '/api/users') body = [user]
    else if (path === '/api/patients') body = patients
    else if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: { followup: { label: 'Fixture followup', duration: 60 } }, priceLists: [], rooms: [] }
    else if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    else if (path === '/api/appointments' && method === 'GET') {
      initialReadStarted = true
      await delayedList
      body = [cached, serverOnly]
    } else if (path === '/api/appointments' && method === 'POST') body = { ...request.postDataJSON(), id: 'created' }
    else if (path === '/api/appointments/existing') body = { ...cached, ...request.postDataJSON() }
    else if (path === '/api/appointments/existing/status') body = { ...cached, ...request.postDataJSON() }
    else if (path === '/api/appointments/availability') body = { duration: 60, slots: ['10:00', '11:00', '14:00'].map(time => ({
      startTime: at(time), endTime: at(`${String(Number(time.slice(0, 2)) + 1).padStart(2, '0')}:00`), assignedPractitionerId: 'doctor',
    })) }
    await route.fulfill({ json: body })
  })
  await page.goto('/appointments')
  await expect.poll(() => initialReadStarted).toBe(true)
  await expect(page.locator('.appt-block').filter({ hasText: 'Cache Patient' })).toBeVisible()
  return { release, writes, errors }
}

async function releaseAndVerify(page, state) {
  state.release()
  await expect(page.locator('.appt-block').filter({ hasText: 'Server Patient' })).toBeVisible()
  expect(state.errors).toEqual([])
}

test('a delayed initial list cannot remove a newly saved appointment', async ({ page }) => {
  const state = await setup(page)
  await page.getByRole('button', { name: 'New Appointment', exact: true }).click()
  const drawer = page.locator('.el-drawer').filter({ hasText: 'New Appointment' })
  await expect(drawer.locator('.availability-card')).toHaveCount(3)
  await drawer.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: /^Patient$/ }) }).getByRole('combobox').click()
  await page.getByRole('option', { name: /Cache Patient/ }).click()
  await drawer.locator('.availability-card').filter({ hasText: '14:00 -' }).click()
  await drawer.getByRole('button', { name: 'Confirm Appointment', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page.locator('.appt-block').filter({ hasText: 'Cache Patient' })).toHaveCount(2)
  await releaseAndVerify(page, state)
  await expect(page.locator('.appt-block').filter({ hasText: 'Cache Patient' })).toHaveCount(2)
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0]).toMatchObject({ method: 'POST', path: '/api/appointments', body: { startTime: at('14:00') } })
})

test('a delayed initial list cannot undo a saved appointment time change', async ({ page }) => {
  const state = await setup(page)
  await page.locator('.appt-block').filter({ hasText: 'Cache Patient' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const drawer = page.locator('.el-drawer').filter({ hasText: 'Edit Appointment' })
  await expect(drawer.locator('.availability-card')).toHaveCount(3)
  await drawer.locator('.availability-card').filter({ hasText: '11:00 -' }).click()
  await drawer.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page.locator('.appt-block').filter({ hasText: 'Cache Patient' })).toContainText('11:00 - 12:00')
  await releaseAndVerify(page, state)
  await expect(page.locator('.appt-block').filter({ hasText: 'Cache Patient' })).toContainText('11:00 - 12:00')
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0]).toMatchObject({ method: 'PUT', path: '/api/appointments/existing', body: { startTime: at('11:00') } })
})

test('a delayed initial list cannot restore a cancelled appointment', async ({ page }) => {
  const state = await setup(page)
  await page.locator('.appt-block').filter({ hasText: 'Cache Patient' }).click()
  await page.getByRole('button', { name: 'Cancel Appointment', exact: true }).click()
  await page.locator('.el-message-box .el-button--primary').click()
  await expect(page.locator('.appt-block').filter({ hasText: 'Cache Patient' })).toHaveCount(0)
  await releaseAndVerify(page, state)
  await expect(page.locator('.appt-block').filter({ hasText: 'Cache Patient' })).toHaveCount(0)
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0]).toMatchObject({ method: 'PATCH', path: '/api/appointments/existing/status', body: { status: 'cancelled' } })
})
