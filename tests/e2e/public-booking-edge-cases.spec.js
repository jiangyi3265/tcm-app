import { test, expect } from '@playwright/test'

const options = {
  serviceTypes: [{ key: 'acupuncture', label: 'Acupuncture', publicVisible: true }, { key: 'consultation', label: 'Consultation', publicVisible: true }],
  practitioners: [{ id: 'acu-doctor', name: 'Acupuncture Doctor', serviceKeys: ['acupuncture'] }, { id: 'consult-doctor', name: 'Consultation Doctor', serviceKeys: ['consultation'] }],
  publicWindowStart: '2026-10-07', publicWindowEnd: '2026-11-21',
}

function schedule(weekStart = '2026-10-05', practitionerId = 'acu-doctor') {
  const date = new Date(Date.parse(weekStart + 'T12:00:00Z') + 2 * 86400000).toISOString().slice(0, 10)
  return { weekStart, publicWindowStart: options.publicWindowStart, publicWindowEnd: options.publicWindowEnd, days: [{ date, availableCount: 1, slots: [{ date, startTime: `${date}T09:00:00`, endTime: `${date}T09:30:00`, status: 'available', assignedPractitionerId: practitionerId }] }] }
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
  await page.route('**/api/public-booking/schedule**', route => route.fulfill({ json: schedule(new URL(route.request().url()).searchParams.get('weekStart')) }))
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
  await page.getByRole('button', { name: 'Next month', exact: true }).click()
  const retry = page.getByRole('button', { name: 'Retry', exact: true })
  await expect(retry).toBeVisible({ timeout: 1500 })
  await expect(page.getByRole('button', { name: 'Submit Booking', exact: true })).toBeDisabled()
  await expect(page.locator('.time-block-button')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/booking-schedule-error-390.png', fullPage: true })
  fail = false
  await retry.click()
  await expect(page.locator('.date-card[data-date="2026-11-04"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByPlaceholder('First name', { exact: true })).toHaveValue('QA')
  await expect(page.getByRole('button', { name: 'Submit Booking', exact: true })).toBeEnabled()
})

test('late month responses cannot overwrite the month the patient returned to', async ({ page }) => {
  let release
  const delayed = new Promise(resolve => { release = resolve })
  let nextRequested
  const nextRequest = new Promise(resolve => { nextRequested = resolve })
  let lateResponse
  await page.route('**/api/public-booking/options', route => route.fulfill({ json: options }))
  await page.route('**/api/public-booking/schedule**', async route => {
    const weekStart = new URL(route.request().url()).searchParams.get('weekStart')
    if (weekStart === '2026-11-02') {
      nextRequested()
      await delayed
    }
    await route.fulfill({ json: schedule(weekStart) })
  })
  try {
    await page.goto('/booking')
    await expect(page.locator('.time-block-button')).toBeVisible()
    await page.getByRole('button', { name: 'Next month', exact: true }).click()
    await nextRequest
    await page.getByRole('button', { name: 'Previous month', exact: true }).click()
    await expect(page.locator('.date-card[data-date="2026-10-07"]')).toHaveAttribute('aria-pressed', 'true')
    lateResponse = page.waitForResponse(response => response.url().includes('weekStart=2026-11-02'))
    release()
    await lateResponse
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.month-label')).toHaveText('October 2026')
    await expect(page.locator('.date-card[data-date="2026-10-07"]')).toHaveAttribute('aria-pressed', 'true')
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
  await page.getByRole('radio', { name: 'Consultation', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Consultation', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.time-block-button')).toBeVisible()
  await page.getByPlaceholder('Last name', { exact: true }).fill('Test')
  await page.getByPlaceholder('First name', { exact: true }).fill('QA')
  await page.getByPlaceholder('Phone number', { exact: true }).fill('5550100')
  await page.getByPlaceholder('Email', { exact: true }).fill('qa@example.invalid')
  await page.getByRole('button', { name: 'Submit Booking', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Booking Submitted', exact: true })).toBeVisible()
  expect(booking.serviceType).toBe('consultation')
  expect(booking.practitionerId).toBe('consult-doctor')
  expect(requests.filter(request => request.service === 'consultation').every(request => request.practitioner === 'consult-doctor')).toBe(true)
})

test('late service responses cannot replace the selected service or its practitioner', async ({ page }) => {
  let release, requested
  const delayed = new Promise(resolve => { release = resolve })
  const nextRequest = new Promise(resolve => { requested = resolve })
  let booking
  await page.route('**/api/public-booking/options', route => route.fulfill({ json: options }))
  await page.route('**/api/public-booking/schedule**', async route => {
    const query = new URL(route.request().url()).searchParams
    if (query.get('serviceType') === 'consultation') {
      requested()
      await delayed
    }
    await route.fulfill({ json: schedule(query.get('weekStart'), query.get('practitionerId')) })
  })
  await page.route('**/api/public-booking', route => {
    booking = route.request().postDataJSON()
    return route.fulfill({ json: { appointment: booking } })
  })
  try {
    await page.goto('/booking')
    await expect(page.locator('.time-block-button')).toBeVisible()
    await page.getByRole('radio', { name: 'Consultation', exact: true }).click()
    await nextRequest
    await expect(page.locator('button[type="submit"]')).toBeDisabled()
    await page.getByRole('radio', { name: 'Acupuncture', exact: true }).click()
    await expect(page.locator('.time-block-button')).toBeVisible()
    const lateResponse = page.waitForResponse(response => response.url().includes('serviceType=consultation'))
    release()
    await lateResponse
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('radio', { name: 'Acupuncture', exact: true })).toHaveAttribute('aria-checked', 'true')
    await page.getByPlaceholder('Last name', { exact: true }).fill(' Test ')
    await page.getByPlaceholder('First name', { exact: true }).fill(' QA ')
    await page.getByPlaceholder('Phone number', { exact: true }).fill(' 5550100 ')
    await page.getByPlaceholder('Email', { exact: true }).fill(' qa@example.invalid ')
    await page.locator('button[type="submit"]').click()
    await expect(page.getByRole('heading', { name: 'Booking Submitted', exact: true })).toBeVisible()
    expect(booking).toMatchObject({ serviceType: 'acupuncture', practitionerId: 'acu-doctor', firstName: 'QA', lastName: 'Test', phone: '5550100', email: 'qa@example.invalid' })
  } finally { release() }
})
