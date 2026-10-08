import { test, expect } from '@playwright/test'

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function schedule(weekStart = '2026-10-05') {
  const date = weekStart === '2026-10-05' ? '2026-10-07' : '2026-10-14'
  return {
    weekStart,
    days: [{
      date, availableCount: 1, releaseMode: 'drip',
      slots: [{ date, startTime: `${date}T09:00:00`, endTime: `${date}T09:30:00`, status: 'available', assignedPractitionerId: 'qa-practitioner' }],
    }],
  }
}

async function openBooking(page, onSchedule, embedded = false) {
  await page.addInitScript(() => localStorage.setItem('tcm_lang', 'en'))
  await page.route('**/api/public-booking/options', route => route.fulfill({ json: {
    serviceTypes: [{ key: 'acupuncture', label: 'Acupuncture', publicVisible: true }],
    practitioners: [{ id: 'qa-practitioner', name: 'QA Practitioner' }],
    publicWindowStart: '2026-10-07', publicWindowEnd: '2026-10-21',
  } }))
  await page.route('**/api/public-booking/schedule**', async route => {
    const weekStart = new URL(route.request().url()).searchParams.get('weekStart')
    if (onSchedule) await onSchedule(weekStart)
    await route.fulfill({ json: schedule(weekStart) })
  })
  if (embedded) {
    await page.route('**/booking-test-host', route => route.fulfill({ contentType: 'text/html', body: `
      <!doctype html><html><body style="margin:0"><iframe title="Booking" src="/booking?embed=1" style="display:block;width:100%;height:400px;border:0"></iframe>
      <script>const frame = document.querySelector('iframe'); window.addEventListener('message', event => {
        if (event.source === frame.contentWindow && event.data.type === 'otcm-booking-height') frame.style.height = event.data.height + 'px';
      });</script></body></html>
    ` }))
  }
  await page.goto(embedded ? '/booking-test-host' : '/booking')
  const booking = embedded ? page.frameLocator('iframe') : page
  await expect(booking.locator('.time-block-button')).toBeVisible()
  await booking.getByPlaceholder('Last name', { exact: true }).fill('QA')
  await booking.getByPlaceholder('First name', { exact: true }).fill('Booking')
  await booking.getByPlaceholder('Enter your phone number', { exact: true }).fill('5550100')
  return booking
}

test('a double click submits one booking and locks the form until the response', async ({ page }) => {
  const response = deferred()
  const submitted = []
  await page.route('**/api/public-booking', async route => {
    submitted.push(route.request().postDataJSON())
    await response.promise
    await route.fulfill({ json: { appointment: { ...submitted[0] } } })
  })
  try {
    await openBooking(page)
    const submit = page.getByRole('button', { name: 'Submit Booking', exact: true })
    await submit.dblclick()
    await expect(submit).toBeDisabled({ timeout: 1000 })
    expect(submitted).toHaveLength(1)
    await expect(page.getByPlaceholder('First name', { exact: true })).toBeDisabled()
    await expect(page.locator('.date-card')).toBeDisabled()
    response.resolve()
    await expect(page.getByRole('heading', { name: 'Booking Submitted', exact: true })).toBeVisible()
    await expect(page.locator('.success-card')).toContainText('2026-10-07 09:00')
    await expect(page.getByRole('img', { name: 'OTCM Acupuncture', exact: true })).toBeVisible()
  } finally { response.resolve() }
})

test('changing weeks cannot submit the previous week while the new schedule loads', async ({ page }) => {
  const response = deferred()
  const requested = deferred()
  const submitted = []
  await page.route('**/api/public-booking', async route => {
    submitted.push(route.request().postDataJSON())
    await route.fulfill({ json: { appointment: submitted.at(-1) } })
  })
  try {
    await openBooking(page, async weekStart => {
      if (weekStart === '2026-10-12') {
        requested.resolve()
        await response.promise
      }
    })
    await page.locator('.week-nav button').last().click()
    await requested.promise
    const submit = page.getByRole('button', { name: 'Submit Booking', exact: true })
    await expect(submit).toBeDisabled({ timeout: 1000 })
    await expect(page.locator('.selected-slot-panel').first()).not.toContainText('2026-10-07')
    expect(submitted).toHaveLength(0)
    response.resolve()
    await expect(page.locator('.selected-slot-panel').first()).toContainText('2026-10-14')
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(page.getByRole('heading', { name: 'Booking Submitted', exact: true })).toBeVisible()
    expect(submitted).toHaveLength(1)
    expect(submitted[0].startTime).toBe('2026-10-14 09:00:00')
  } finally { response.resolve() }
})

test('a failed submission unlocks the form and retains entries for retry', async ({ page }) => {
  let submissions = 0
  await page.route('**/api/public-booking', async route => {
    submissions++
    if (submissions === 1) {
      await route.fulfill({ status: 503, json: { message: 'Temporary booking failure' } })
    } else {
      await route.fulfill({ json: { appointment: route.request().postDataJSON() } })
    }
  })
  await openBooking(page)
  const submit = page.getByRole('button', { name: 'Submit Booking', exact: true })
  await submit.click()
  await expect(page.getByText('Temporary booking failure', { exact: true })).toBeVisible()
  await expect(submit).toBeEnabled()
  await expect(page.getByPlaceholder('First name', { exact: true })).toHaveValue('Booking')
  await submit.click()
  await expect(page.getByRole('heading', { name: 'Booking Submitted', exact: true })).toBeVisible()
  expect(submissions).toBe(2)
})

test('the embedded page shrinks after booking and grows when booking another appointment', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/public-booking', route => route.fulfill({ json: { appointment: route.request().postDataJSON() } }))
  const booking = await openBooking(page, undefined, true)
  const frameHeight = () => page.locator('iframe').evaluate(el => el.clientHeight)
  await expect.poll(frameHeight).toBeGreaterThan(1000)
  const formHeight = await frameHeight()
  await booking.getByRole('button', { name: 'Submit Booking', exact: true }).click()
  await expect(booking.getByRole('heading', { name: 'Booking Submitted', exact: true })).toBeVisible()
  await expect.poll(frameHeight, { timeout: 1500 }).toBeLessThan(formHeight / 2)
  const bookAnother = booking.getByRole('button', { name: 'Book Another', exact: true })
  await expect(bookAnother).toBeEnabled()
  await bookAnother.press('Enter')
  await expect(booking.locator('.time-block-button')).toBeVisible()
  await expect.poll(frameHeight).toBeGreaterThan(1000)
})
