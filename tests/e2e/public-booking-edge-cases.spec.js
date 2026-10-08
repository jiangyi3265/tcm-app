import { test, expect } from '@playwright/test'

const options = {
  serviceTypes: [{ key: 'acupuncture', label: 'Acupuncture', publicVisible: true }, { key: 'consultation', label: 'Consultation', publicVisible: true }],
  practitioners: [{ id: 'acu-doctor', name: 'Acupuncture Doctor', serviceKeys: ['acupuncture'] }, { id: 'consult-doctor', name: 'Consultation Doctor', serviceKeys: ['consultation'] }],
  publicWindowStart: '2026-10-07', publicWindowEnd: '2026-10-21',
}

function schedule(weekStart = '2026-10-05', practitionerId = 'acu-doctor') {
  const date = weekStart === '2026-10-05' ? '2026-10-07' : '2026-10-14'
  return { weekStart, days: [{ date, availableCount: 1, slots: [{ date, startTime: `${date}T09:00:00`, endTime: `${date}T09:30:00`, status: 'available', assignedPractitionerId: practitionerId }] }] }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tcm_lang', 'en'))
})

test('an empty public service list does not show sample services or request schedules', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let scheduleRequests = 0
  await page.route('**/api/public-booking/options', route => route.fulfill({ json: { ...options, serviceTypes: [] } }))
  await page.route('**/api/public-booking/schedule**', route => {
    scheduleRequests++
    return route.fulfill({ json: schedule() })
  })
  await page.goto('/booking')
  await expect(page.getByText('No services are currently available for online booking.', { exact: true })).toBeVisible({ timeout: 1500 })
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Submit Booking', exact: true })).toHaveCount(0)
  expect(scheduleRequests).toBe(0)
  await page.screenshot({ path: 'test-results/booking-no-services-390.png', fullPage: true })
})

test('booking options can be retried after a network error', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let attempts = 0
  await page.route('**/api/public-booking/options', route => {
    attempts++
    return attempts === 1
      ? route.fulfill({ status: 503, json: { message: 'Temporary service failure' } })
      : route.fulfill({ json: options })
  })
  await page.route('**/api/public-booking/schedule**', route => route.fulfill({ json: schedule() }))
  await page.goto('/booking')
  const retry = page.getByRole('button', { name: 'Retry', exact: true })
  await expect(retry).toBeVisible({ timeout: 1500 })
  await expect(page.getByRole('alert')).toContainText('Unable to load booking options')
  await page.screenshot({ path: 'test-results/booking-options-error-390.png', fullPage: true })
  await retry.click()
  await expect(page.locator('.time-block-button')).toBeVisible()
  expect(attempts).toBe(2)
})

test('schedule failures show a retry action and keep entered patient details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let fail = false
  await page.route('**/api/public-booking/options', route => route.fulfill({ json: options }))
  await page.route('**/api/public-booking/schedule**', route => {
    if (fail) return route.fulfill({ status: 503, json: { message: 'Temporary schedule failure' } })
    const query = new URL(route.request().url()).searchParams
    return route.fulfill({ json: schedule(query.get('weekStart'), query.get('practitionerId')) })
  })
  await page.goto('/booking')
  await expect(page.locator('.time-block-button')).toBeVisible()
  await page.getByPlaceholder('First name', { exact: true }).fill('QA')
  fail = true
  await page.getByRole('button', { name: 'Next week', exact: true }).click()
  const retry = page.getByRole('button', { name: 'Retry', exact: true })
  await expect(retry).toBeVisible({ timeout: 1500 })
  await expect(page.getByRole('button', { name: 'Submit Booking', exact: true })).toBeDisabled()
  await expect(page.locator('.time-block-button')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/booking-schedule-error-390.png', fullPage: true })
  fail = false
  await retry.click()
  await expect(page.locator('.selected-slot-panel').first()).toContainText('2026-10-14')
  await expect(page.getByPlaceholder('First name', { exact: true })).toHaveValue('QA')
  await expect(page.getByRole('button', { name: 'Submit Booking', exact: true })).toBeEnabled()
})

test('late week responses cannot overwrite the week the patient returned to', async ({ page }) => {
  let release
  const delayed = new Promise(resolve => { release = resolve })
  let nextRequested
  const nextRequest = new Promise(resolve => { nextRequested = resolve })
  let lateResponse
  await page.route('**/api/public-booking/options', route => route.fulfill({ json: options }))
  await page.route('**/api/public-booking/schedule**', async route => {
    const weekStart = new URL(route.request().url()).searchParams.get('weekStart')
    if (weekStart === '2026-10-12') {
      nextRequested()
      await delayed
    }
    await route.fulfill({ json: schedule(weekStart) })
  })
  try {
    await page.goto('/booking')
    await expect(page.locator('.time-block-button')).toBeVisible()
    await page.getByRole('button', { name: 'Next week', exact: true }).click()
    await nextRequest
    await page.getByRole('button', { name: 'Previous week', exact: true }).click()
    await expect(page.locator('.selected-slot-panel').first()).toContainText('2026-10-07')
    lateResponse = page.waitForResponse(response => response.url().includes('weekStart=2026-10-12'))
    release()
    await lateResponse
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.week-label')).toHaveText('2026-10-05 - 2026-10-11')
    await expect(page.locator('.selected-slot-panel').first()).toContainText('2026-10-07')
  } finally { release() }
})

test('switching service selects its eligible practitioner and submits that combination', async ({ page }) => {
  const requests = []
  let booking
  await page.route('**/api/public-booking/options', route => route.fulfill({ json: options }))
  await page.route('**/api/public-booking/schedule**', route => {
    const query = new URL(route.request().url()).searchParams
    requests.push({ service: query.get('serviceType'), practitioner: query.get('practitionerId') })
    return route.fulfill({ json: schedule(query.get('weekStart'), query.get('practitionerId')) })
  })
  await page.route('**/api/public-booking', route => {
    booking = route.request().postDataJSON()
    return route.fulfill({ json: { appointment: booking } })
  })
  await page.goto('/booking')
  await expect(page.locator('.time-block-button')).toBeVisible()
  await page.locator('.el-select__selected-item.el-select__placeholder').first().click()
  await page.getByRole('option', { name: 'Consultation', exact: true }).click()
  await expect(page.locator('.el-select').nth(1)).toContainText('Consultation Doctor')
  await expect(page.locator('.time-block-button')).toBeVisible()
  await page.getByPlaceholder('Last name', { exact: true }).fill('Test')
  await page.getByPlaceholder('First name', { exact: true }).fill('QA')
  await page.getByPlaceholder('Enter your phone number', { exact: true }).fill('5550100')
  await page.getByRole('button', { name: 'Submit Booking', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Booking Submitted', exact: true })).toBeVisible()
  expect(booking.serviceType).toBe('consultation')
  expect(booking.practitionerId).toBe('consult-doctor')
  expect(requests.filter(request => request.service === 'consultation').every(request => request.practitioner === 'consult-doctor')).toBe(true)
})
