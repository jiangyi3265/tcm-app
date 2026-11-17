import { test, expect } from '@playwright/test'

async function fixture(page, { failFirst = false } = {}) {
  await page.clock.setFixedTime(new Date('2026-11-17T08:00:00-05:00'))
  const user = { id: 'doctor', name: 'Fixture Doctor', roles: ['admin', 'practitioner'], isActive: true, serviceKeys: ['followup'], workingHours: { tuesday: [{ start: '09:00', end: '17:00' }] } }
  const patients = ['Alpha', 'Bravo'].map((name, index) => ({ id: `patient-${index}`, name: `${name} Fixture`, isActive: true, emails: [`${name.toLowerCase()}@example.invalid`] }))
  const appointments = patients.map((p, index) => ({ id: `appt-${index}`, patientId: p.id, practitionerId: 'doctor', roomId: 'room', serviceType: 'followup', status: 'booked', startTime: `2026-11-17 ${index ? '14' : '10'}:00:00`, endTime: `2026-11-17 ${index ? '15' : '11'}:00:00` }))
  const settings = { currency: 'CAD', serviceTypes: { followup: { label: 'Fixture follow-up', duration: 60, roomRequired: true, requiredTag: 'acupuncture' } }, priceLists: [], rooms: [{ id: 'room', name: 'Fixture Room', isActive: true, supportTags: ['acupuncture'] }] }
  const writes = [], errors = []
  let release
  const gate = new Promise(resolve => { release = resolve })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({ user, patients, appointments }) => {
    localStorage.clear()
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_patients', JSON.stringify(patients))
    localStorage.setItem('tcm_appointments', JSON.stringify(appointments))
    localStorage.setItem('tcm_lang', 'en')
  }, { user, patients, appointments })
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    let body = []
    if (request.method() !== 'GET') {
      const sent = request.postDataJSON()
      writes.push({ path, method: request.method(), body: sent })
      const attempt = writes.length
      await gate
      if (failFirst && attempt === 1) return route.fulfill({ status: 503, json: { message: 'Fixture status failure' } })
      const original = appointments.find(a => path.includes(a.id))
      return route.fulfill({ json: { ...original, ...sent } })
    }
    if (path === '/api/users') body = [user]
    else if (path === '/api/patients') body = patients
    else if (path === '/api/settings') body = settings
    else if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    else if (path === '/api/appointments') body = appointments
    await route.fulfill({ json: body })
  })
  await page.goto('/appointments')
  await expect(page.locator('.appt-block').filter({ hasText: 'Alpha Fixture' })).toBeVisible()
  return { writes, errors, release }
}

const details = page => page.locator('.el-drawer').filter({ hasText: 'Appointment Details' })

async function expectBusyDetails(page) {
  const drawer = details(page)
  for (const name of ['Close', 'Edit', 'Confirm', 'Cancel Appointment', 'View Patient']) {
    await expect(drawer.getByRole('button', { name, exact: true })).toBeDisabled()
  }
  await expect(drawer.locator('.el-drawer__close-btn')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(drawer).toBeVisible()
  await expect(drawer.locator('.detail-panel')).toContainText('Alpha Fixture')
}

test('confirmation submits once, locks the detail, and keeps the original appointment available after retry', async ({ page }) => {
  const state = await fixture(page, { failFirst: true })
  await page.locator('.appt-block').filter({ hasText: 'Alpha Fixture' }).click()
  const confirm = details(page).getByRole('button', { name: 'Confirm', exact: true })
  await confirm.evaluate(button => { button.click(); button.click() })
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0]).toMatchObject({ method: 'PATCH', path: '/api/appointments/appt-0/status', body: { status: 'confirmed' } })
  await expectBusyDetails(page)
  state.release()
  await expect(page.getByText('Fixture status failure', { exact: true })).toBeVisible()
  await expect(confirm).toBeEnabled()
  await expect(details(page).getByRole('button', { name: 'Edit', exact: true })).toBeEnabled()
  await expect(details(page).locator('.detail-panel')).toContainText('Alpha Fixture')
  await confirm.click()
  await expect.poll(() => state.writes.length).toBe(2)
  await expect(details(page).locator('.detail-panel .el-tag')).toHaveText('Confirmed')
  await details(page).getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.appt-block').filter({ hasText: 'Bravo Fixture' }).click()
  await expect(details(page).locator('.detail-panel')).toContainText('Bravo Fixture')
  await expect(details(page).locator('.detail-panel .el-tag')).toHaveText('Booked')
  expect(state.writes[1]).toEqual(state.writes[0])
  expect(state.errors).toEqual([])
})

test('cancellation locks the detail and retries a failed request without cancelling another appointment', async ({ page }) => {
  const state = await fixture(page, { failFirst: true })
  await page.locator('.appt-block').filter({ hasText: 'Alpha Fixture' }).click()
  const cancel = details(page).getByRole('button', { name: 'Cancel Appointment', exact: true })
  await cancel.evaluate(button => { button.click(); button.click() })
  await expect(page.locator('.el-message-box:visible')).toHaveCount(1)
  await page.locator('.el-message-box').getByRole('button', { name: 'OK', exact: true }).evaluate(button => { button.click(); button.click() })
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0]).toMatchObject({ method: 'PATCH', path: '/api/appointments/appt-0/status', body: { status: 'cancelled' } })
  await expectBusyDetails(page)
  state.release()
  await expect(page.getByText('Fixture status failure', { exact: true })).toBeVisible()
  await expect(cancel).toBeEnabled()
  await expect(details(page).locator('.detail-panel')).toContainText('Alpha Fixture')
  await cancel.click()
  await page.locator('.el-message-box').getByRole('button', { name: 'OK', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(2)
  await expect(details(page)).not.toBeVisible()
  await expect(page.locator('.appt-block').filter({ hasText: 'Alpha Fixture' })).toHaveCount(0)
  await page.locator('.appt-block').filter({ hasText: 'Bravo Fixture' }).click()
  await expect(details(page).locator('.detail-panel')).toContainText('Bravo Fixture')
  await expect(details(page).locator('.detail-panel .el-tag')).toHaveText('Booked')
  expect(state.writes[1]).toEqual(state.writes[0])
  expect(state.errors).toEqual([])
})

test('dismissing the cancellation confirmation leaves the appointment unchanged and unlocks its actions', async ({ page }) => {
  const state = await fixture(page)
  await page.locator('.appt-block').filter({ hasText: 'Alpha Fixture' }).click()
  const cancel = details(page).getByRole('button', { name: 'Cancel Appointment', exact: true })
  for (const dismiss of ['button', 'escape', 'close']) {
    await cancel.click()
    const dialog = page.locator('.el-message-box')
    await expect(dialog).toBeVisible()
    if (dismiss === 'button') await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    else if (dismiss === 'close') await dialog.locator('.el-message-box__headerbtn').click()
    else await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(cancel).toBeEnabled()
    await expect(details(page).getByRole('button', { name: 'Edit', exact: true })).toBeEnabled()
    await expect(details(page).locator('.detail-panel .el-tag')).toHaveText('Booked')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
  }
  expect(state.writes).toEqual([])
  expect(state.errors).toEqual([])
})

