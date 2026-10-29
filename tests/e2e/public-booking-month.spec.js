import { test, expect } from '@playwright/test'

const options = {
  serviceTypes: [
    { key: 'acupuncture', label: 'Supercare Acupuncture 30min', description: 'Follow-up acupuncture with your practitioner.', duration: 30, defaultPrice: 90, publicVisible: true },
    { key: 'consultation', label: 'Basic Acupuncture 60min', description: 'An initial visit and acupuncture treatment.', duration: 60, defaultPrice: 120, publicVisible: true },
  ],
  practitioners: [{ id: 'clinic-doctor', name: 'Clinic Doctor', serviceKeys: ['acupuncture', 'consultation'] }],
  publicWindowStart: '2026-10-20', publicWindowEnd: '2026-11-10',
}
const availableDates = ['2026-10-19', '2026-10-21', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-09', '2026-11-10', '2026-11-11']

function weeklySchedule(weekStart, service = 'acupuncture') {
  const end = new Date(Date.parse(weekStart + 'T12:00:00Z') + 6 * 86400000).toISOString().slice(0, 10)
  return {
    weekStart, publicWindowStart: options.publicWindowStart, publicWindowEnd: options.publicWindowEnd,
    days: availableDates.filter(date => date >= weekStart && date <= end).map(date => ({
      date, availableCount: 2,
      slots: ['09:30', '11:00'].map(time => ({
        date, startTime: `${date} ${time}:00`,
        endTime: `${date} ${time === '09:30' ? (service === 'acupuncture' ? '10:00' : '10:30') : (service === 'acupuncture' ? '11:30' : '12:00')}:00`,
        assignedPractitionerId: 'clinic-doctor', roomId: 'clinic-room', status: 'available',
      })),
    })),
  }
}

async function setup(page, override = {}) {
  const reads = [], writes = []
  await page.addInitScript(() => localStorage.setItem('tcm_lang', 'en'))
  await page.route('**/api/public-booking/options', route => route.fulfill({ json: { ...options, ...override } }))
  await page.route('**/api/public-booking/schedule**', route => {
    const query = new URL(route.request().url()).searchParams
    reads.push(query.get('weekStart'))
    return route.fulfill({ json: weeklySchedule(query.get('weekStart'), query.get('serviceType')) })
  })
  await page.route('**/api/public-booking', route => {
    writes.push(route.request().postDataJSON())
    return route.fulfill({ json: { appointment: writes.at(-1) } })
  })
  await page.goto('/booking')
  await expect(page.locator('.time-block-button')).toHaveCount(2)
  return { reads, writes }
}

async function fillDetails(page) {
  await page.getByPlaceholder('First name', { exact: true }).fill('Jane')
  await page.getByPlaceholder('Last name', { exact: true }).fill('Test')
  await page.getByPlaceholder('Email', { exact: true }).fill('qa@example.invalid')
  await page.getByPlaceholder('Phone number', { exact: true }).fill('5550100')
}

test('the whole month makes later weeks directly selectable without a week switch', async ({ page }) => {
  const { reads } = await setup(page)
  await expect(page.locator('.month-label')).toHaveText('October 2026')
  await expect(page.locator('.date-card')).toHaveCount(31)
  await expect(page.getByRole('button', { name: 'Next week', exact: true })).toHaveCount(0)
  await expect(page.locator('[data-date="2026-10-21"]')).toBeEnabled()
  await expect(page.locator('[data-date="2026-10-30"]')).toBeEnabled()
  await page.locator('[data-date="2026-10-30"]').click()
  await expect(page.locator('[data-date="2026-10-30"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.time-block-button').first()).toContainText('9:30 AM')
  expect([...new Set(reads)]).toEqual(['2026-10-19', '2026-10-26'])
})

test('visible month navigation reaches future dates and obeys the configured booking window', async ({ page }) => {
  await setup(page)
  const previous = page.getByRole('button', { name: 'Previous month', exact: true })
  const next = page.getByRole('button', { name: 'Next month', exact: true })
  await expect(previous).toBeDisabled()
  await expect(page.locator('[data-date="2026-10-19"]')).toBeDisabled()
  await next.click()
  await expect(page.locator('.month-label')).toHaveText('November 2026')
  await expect(page.locator('.date-card')).toHaveCount(30)
  await expect(page.locator('[data-date="2026-11-10"]')).toBeEnabled()
  await expect(page.locator('[data-date="2026-11-11"]')).toBeDisabled()
  await expect(next).toBeDisabled()
  await expect(previous).toBeEnabled()
  await page.locator('[data-date="2026-11-10"]').click()
  await expect(page.locator('[data-date="2026-11-10"]')).toHaveAttribute('aria-pressed', 'true')
})

test('only four personal details are collected and the chosen later appointment is submitted', async ({ page }) => {
  const { writes } = await setup(page)
  await expect(page.locator('input:not([type="radio"]):not([type="checkbox"])')).toHaveCount(4)
  await expect(page.locator('textarea')).toHaveCount(0)
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await page.locator('[data-date="2026-10-30"]').click()
  await page.locator('.time-block-button').last().click()
  await fillDetails(page)
  await page.getByRole('button', { name: 'Submit Booking', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Booking Submitted', exact: true })).toBeVisible()
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ firstName: 'Jane', lastName: 'Test', email: 'qa@example.invalid', phone: '5550100', startTime: '2026-10-30 11:00:00', endTime: '2026-10-30 11:30:00', practitionerId: 'clinic-doctor', roomId: 'clinic-room' })
  expect(writes[0]).not.toHaveProperty('notes')
  expect(writes[0]).not.toHaveProperty('intakeFormData')
  expect(writes[0]).not.toHaveProperty('address')
})

test('required fields and malformed email cannot submit a booking', async ({ page }) => {
  const { writes } = await setup(page)
  const submit = page.getByRole('button', { name: 'Submit Booking', exact: true })
  await submit.click()
  expect(writes).toHaveLength(0)
  await fillDetails(page)
  await page.getByPlaceholder('Email', { exact: true }).fill('')
  await submit.click()
  expect(writes).toHaveLength(0)
  await page.getByPlaceholder('Email', { exact: true }).fill('not-an-email')
  await submit.click()
  expect(writes).toHaveLength(0)
  await page.getByPlaceholder('Email', { exact: true }).fill('qa@example.invalid')
  await page.getByPlaceholder('Phone number', { exact: true }).fill('')
  await submit.click()
  expect(writes).toHaveLength(0)
  await expect(page.getByPlaceholder('First name', { exact: true })).toHaveValue('Jane')
})

test('service cards display actual configured fees and durations and remain keyboard operable', async ({ page }) => {
  await setup(page)
  const first = page.locator('.service-card').first()
  await expect(first).toContainText('90')
  await expect(first).toContainText('30')
  const second = page.getByRole('radio', { name: 'Basic Acupuncture 60min', exact: true })
  await second.focus()
  await second.press('Enter')
  await expect(second).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.service-card').last()).toContainText('120')
  await expect(page.locator('.time-block-button')).toHaveCount(2)
  await expect(page.locator('.booking-summary')).toContainText('Basic Acupuncture 60min')
})

for (const width of [320, 390, 1440]) test(`month calendar and four-field booking remain usable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.name))
  await setup(page)
  await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next month', exact: true })).toContainText('Next month')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.getByRole('button', { name: 'Next month', exact: true }).click()
  await page.locator('[data-date="2026-11-10"]').click()
  await expect(page.locator('[data-date="2026-11-10"]')).toHaveAttribute('aria-pressed', 'true')
  await fillDetails(page)
  await page.screenshot({ path: `test-results/booking-month-${width}.png`, fullPage: true })
  expect(pageErrors).toEqual([])
})

test('unavailable dates do not manufacture appointment times', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tcm_lang', 'en'))
  await page.route('**/api/public-booking/options', route => route.fulfill({ json: options }))
  await page.route('**/api/public-booking/schedule**', route => route.fulfill({ json: { days: [] } }))
  await page.goto('/booking')
  await expect(page.locator('.month-label')).toHaveText('October 2026')
  await expect(page.locator('.date-card:enabled')).toHaveCount(0)
  await expect(page.locator('.time-block-button')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Submit Booking', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeEnabled()
})

for (const scenario of [
  { start: '2026-12-20', end: '2027-01-10', label: 'December 2026', days: 31, nextLabel: 'January 2027', nextDays: 31 },
  { start: '2028-02-20', end: '2028-02-29', label: 'February 2028', days: 29 },
  { start: '2027-02-20', end: '2027-02-28', label: 'February 2027', days: 28 },
]) test(`calendar handles ${scenario.label} and its configured final day`, async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tcm_lang', 'en'))
  await page.route('**/api/public-booking/options', route => route.fulfill({ json: {
    ...options, publicWindowStart: scenario.start, publicWindowEnd: scenario.end,
  } }))
  await page.route('**/api/public-booking/schedule**', route => {
    const weekStart = new URL(route.request().url()).searchParams.get('weekStart')
    const weekEnd = new Date(Date.parse(weekStart + 'T12:00:00Z') + 6 * 86400000).toISOString().slice(0, 10)
    return route.fulfill({ json: {
      weekStart, publicWindowStart: scenario.start, publicWindowEnd: scenario.end,
      days: [scenario.start, scenario.end].filter(date => date >= weekStart && date <= weekEnd).map(date => ({
        date, availableCount: 1, slots: [{ date, startTime: `${date} 09:30:00`, endTime: `${date} 10:00:00`, assignedPractitionerId: 'clinic-doctor', status: 'available' }],
      })),
    } })
  })
  await page.goto('/booking')
  await expect(page.locator('.month-label')).toHaveText(scenario.label)
  await expect(page.locator('.date-card')).toHaveCount(scenario.days)
  await expect(page.locator(`[data-date="${scenario.start}"]`)).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Previous month', exact: true })).toBeDisabled()
  expect(await page.locator('.date-card:disabled').count()).toBeGreaterThan(20)
  if (scenario.nextLabel) {
    await page.getByRole('button', { name: 'Next month', exact: true }).click()
    await expect(page.locator('.month-label')).toHaveText(scenario.nextLabel)
    await expect(page.locator('.date-card')).toHaveCount(scenario.nextDays)
    await expect(page.getByRole('button', { name: 'Previous month', exact: true })).toBeEnabled()
  }
  await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeDisabled()
  const lastDay = page.locator(`[data-date="${scenario.end}"]`)
  await expect(lastDay).toBeEnabled()
  await lastDay.click()
  await expect(lastDay).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.time-block-button')).toHaveCount(1)
})
