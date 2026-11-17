import { test, expect } from '@playwright/test'

async function openManage(page, onCancel) {
  await page.addInitScript(() => localStorage.setItem('tcm_lang', 'en'))
  const errors = [], writes = []
  const appointment = {
    patientName: 'Fixture Family', startTime: '2026-11-19 10:00:00',
    serviceLabel: 'Fixture Acupuncture', practitionerName: 'Fixture Doctor',
    status: 'booked', canCancel: true,
  }
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path === '/api/public-booking/manage/fixture-token') return route.fulfill({ json: appointment })
    if (path === '/api/public-booking/manage/fixture-token/cancel') {
      writes.push({ method: request.method(), body: request.postDataJSON() })
      return onCancel(route, writes.length, appointment)
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/manage/fixture-token')
  await expect(page.getByRole('button', { name: 'Cancel Appointment', exact: true })).toBeEnabled()
  return { errors, writes }
}

test('repeated cancellation in one tick sends one request and waits for its result', async ({ page }) => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const state = await openManage(page, async (route, attempt, appointment) => {
    await pending
    return route.fulfill({ json: { ok: true, appointment: { ...appointment, status: 'cancelled' } } })
  })
  try {
    const cancel = page.getByRole('button', { name: 'Cancel Appointment', exact: true })
    await cancel.evaluate(button => { button.click(); button.click() })
    await expect.poll(() => state.writes.length).toBe(1)
    expect(state.writes[0]).toEqual({ method: 'POST', body: { source: 'patient_manage_page' } })
    await expect(page.getByRole('button', { name: 'Cancelling...', exact: true })).toBeDisabled()
    await expect(page.locator('.detail-grid')).toContainText('Fixture Family')
    release()
    await expect(page.getByRole('heading', { name: 'Appointment Cancelled', exact: true })).toBeVisible()
    await expect(page.getByRole('button')).toHaveCount(0)
    expect(state.writes).toHaveLength(1)
    expect(state.errors).toEqual([])
  } finally { release() }
})

test('failed cancellation keeps appointment details and unlocks a successful retry', async ({ page }) => {
  const state = await openManage(page, (route, attempt, appointment) => attempt === 1
    ? route.fulfill({ status: 503, json: { message: 'Temporary cancellation failure' } })
    : route.fulfill({ json: { ok: true, appointment: { ...appointment, status: 'cancelled' } } }))
  const cancel = page.getByRole('button', { name: 'Cancel Appointment', exact: true })
  await cancel.click()
  await expect(page.getByText('Temporary cancellation failure', { exact: true })).toBeVisible()
  await expect(cancel).toBeEnabled()
  await expect(page.locator('.detail-grid')).toContainText('Fixture Family')
  await expect(page.locator('.detail-grid')).toContainText('Fixture Acupuncture')
  await expect(page.getByRole('heading', { name: 'Appointment Cancelled', exact: true })).toHaveCount(0)
  await cancel.click()
  await expect(page.getByRole('heading', { name: 'Appointment Cancelled', exact: true })).toBeVisible()
  await expect(page.locator('.form-error')).toHaveCount(0)
  expect(state.writes).toHaveLength(2)
  expect(state.writes[1]).toEqual(state.writes[0])
  expect(state.errors).toEqual([])
})
