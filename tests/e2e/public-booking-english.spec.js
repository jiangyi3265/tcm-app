import { test, expect } from '@playwright/test'

test.use({ locale: 'zh-CN' })

const options = {
  serviceTypes: [{ key: 'acupuncture_new', label: 'Acupuncture consultation', description: 'An initial consultation and acupuncture treatment.', duration: 60, defaultPrice: 100, publicVisible: true }],
  practitioners: [{ id: 'fixture-doctor', name: 'Clinic Doctor', serviceKeys: ['acupuncture_new'] }],
  publicWindowStart: '2026-11-10', publicWindowEnd: '2026-12-10',
}

function schedule(weekStart) {
  const end = new Date(Date.parse(`${weekStart}T12:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10)
  return {
    weekStart, publicWindowStart: options.publicWindowStart, publicWindowEnd: options.publicWindowEnd,
    days: ['2026-11-10', '2026-11-20', '2026-12-08'].filter(date => date >= weekStart && date <= end).map(date => ({
      date, availableCount: 1,
      slots: [{ date, startTime: `${date} 09:30:00`, endTime: `${date} 10:30:00`, status: 'available', assignedPractitionerId: 'fixture-doctor' }],
    })),
  }
}

async function installFixtures(page, { saved = true, optionsHandler, scheduleHandler, createHandler } = {}) {
  await page.addInitScript(savedValue => {
    if (savedValue) localStorage.setItem('tcm_lang', 'zh-CN')
    else localStorage.removeItem('tcm_lang')
  }, saved)
  await page.route('**/api/public-booking/options', optionsHandler || (route => route.fulfill({ json: options })))
  await page.route('**/api/public-booking/schedule**', scheduleHandler || (route => route.fulfill({ json: schedule(new URL(route.request().url()).searchParams.get('weekStart')) })))
  await page.route('**/api/public-booking', createHandler || (route => route.fulfill({ json: { appointment: route.request().postDataJSON() } })))
}

async function assertEnglishBooking(page) {
  await expect(page.locator('.time-block-button')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Treatment with OTCM', exact: true })).toBeVisible()
  await expect(page.locator('.month-label')).toHaveText('November 2026')
  await expect(page.getByRole('button', { name: 'November 10, 2026', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.weekday-label')).toHaveText(['S', 'M', 'T', 'W', 'T', 'F', 'S'])
  await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('First name', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('Last name', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('Email', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('Phone number', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit Booking', exact: true })).toBeVisible()
  await expect(page.locator('.public-booking-page')).toHaveAttribute('lang', 'en')
  await expect(page.locator('.public-booking-page')).not.toContainText(/[\u3400-\u9fff]/)
}

async function fillDetails(page) {
  await page.getByPlaceholder('First name', { exact: true }).fill('Jane')
  await page.getByPlaceholder('Last name', { exact: true }).fill('Fixture')
  await page.getByPlaceholder('Email', { exact: true }).fill('fixture@example.invalid')
  await page.getByPlaceholder('Phone number', { exact: true }).fill('5550100')
}

test('saved Chinese preference cannot change booking and is preserved when leaving the page', async ({ page }) => {
  await installFixtures(page)
  await page.goto('/booking')
  await assertEnglishBooking(page)
  await expect(page).toHaveTitle(/Booking/i)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  expect(await page.evaluate(() => localStorage.getItem('tcm_lang'))).toBe('zh-CN')

  // Trigger a same-document history navigation so leaving Booking does not reset
  // the application by loading a new document or recreating its global locale.
  await page.evaluate(() => {
    window.__bookingEnglishDocument = 'same-document'
    window.history.pushState(null, '', '/login')
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  })
  await expect(page.locator('.login-page')).toBeVisible()
  await expect(page.getByPlaceholder('邮箱地址', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '登 录', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', /zh/)
  await expect(page).toHaveTitle('中医诊所综合管理系统')
  expect(await page.evaluate(() => window.__bookingEnglishDocument)).toBe('same-document')
  expect(await page.evaluate(() => localStorage.getItem('tcm_lang'))).toBe('zh-CN')
})

test('a fresh Chinese browser gets English booking without writing a language preference', async ({ page }) => {
  await installFixtures(page, { saved: false })
  await page.goto('/book')
  await assertEnglishBooking(page)
  await page.getByRole('button', { name: 'Next month', exact: true }).click()
  await expect(page.locator('.month-label')).toHaveText('December 2026')
  await expect(page.getByRole('button', { name: 'December 8, 2026', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => localStorage.getItem('tcm_lang'))).toBeNull()
})

test('embedded booking is English on a mobile Chinese browser', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installFixtures(page)
  await page.route('**/english-booking-host', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="zh-CN"><body style="margin:0"><iframe title="Booking" src="/booking?embed=1" style="display:block;width:100%;height:2200px;border:0"></iframe></body></html>' }))
  await page.goto('/english-booking-host')
  await assertEnglishBooking(page.frameLocator('iframe'))
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  expect(await page.evaluate(() => localStorage.getItem('tcm_lang'))).toBe('zh-CN')
})

test('required fields and server errors use English before successful submission', async ({ page }) => {
  let submissions = 0
  await installFixtures(page, { createHandler: route => {
    submissions++
    return submissions === 1
      ? route.fulfill({ status: 409, json: { message: '预约时间已被占用，请重新选择' } })
      : route.fulfill({ json: { appointment: route.request().postDataJSON() } })
  } })
  await page.goto('/booking')
  await assertEnglishBooking(page)
  const submit = page.getByRole('button', { name: 'Submit Booking', exact: true })
  await submit.click()
  await expect(page.getByText('Please enter your name', { exact: true })).toBeVisible()
  await page.getByPlaceholder('First name', { exact: true }).fill('Jane')
  await page.getByPlaceholder('Last name', { exact: true }).fill('Fixture')
  await submit.click()
  await expect(page.getByText('Please enter a phone number', { exact: true })).toBeVisible()
  await page.getByPlaceholder('Phone number', { exact: true }).fill('5550100')
  await page.getByPlaceholder('Email', { exact: true }).fill('not-an-email')
  await submit.click()
  await expect(page.getByText('Please enter a valid email address', { exact: true })).toBeVisible()
  expect(submissions).toBe(0)
  await fillDetails(page)
  await submit.click()
  await expect(page.locator('.el-message--error')).toBeVisible()
  await expect(page.locator('.el-message--error')).not.toContainText(/[\u3400-\u9fff]/)
  await expect(page.locator('.el-message--error')).toContainText(/[A-Za-z]/)
  expect(submissions).toBe(1)
  await submit.click()
  await expect(page.getByRole('heading', { name: 'Booking Submitted', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Book Another', exact: true })).toBeVisible()
  await expect(page.locator('.success-card')).not.toContainText(/[\u3400-\u9fff]/)
  expect(submissions).toBe(2)
  expect(await page.evaluate(() => localStorage.getItem('tcm_lang'))).toBe('zh-CN')
})

test('option and schedule errors remain English and can be retried', async ({ page }) => {
  let optionAttempts = 0
  let failSchedule = true
  await installFixtures(page, {
    optionsHandler: route => ++optionAttempts === 1
      ? route.fulfill({ status: 503, json: { message: '服务加载失败' } })
      : route.fulfill({ json: options }),
    scheduleHandler: route => failSchedule
      ? route.fulfill({ status: 503, json: { message: '时间加载失败' } })
      : route.fulfill({ json: schedule(new URL(route.request().url()).searchParams.get('weekStart')) }),
  })
  await page.goto('/booking')
  await expect(page.getByRole('alert')).toContainText('Unable to load booking options')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Unable to load appointment times. Please try again.')
  failSchedule = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await assertEnglishBooking(page)
})

test('loading and missing service-label fallback remain English', async ({ page }) => {
  let release
  const delayed = new Promise(resolve => { release = resolve })
  await installFixtures(page, {
    optionsHandler: route => route.fulfill({ json: { ...options, serviceTypes: [{ key: 'acupuncture_new', duration: 60, defaultPrice: 100, publicVisible: true }] } }),
    scheduleHandler: async route => {
      await delayed
      return route.fulfill({ json: schedule(new URL(route.request().url()).searchParams.get('weekStart')) })
    },
  })
  try {
    await page.goto('/booking')
    await expect(page.locator('.schedule-section').getByRole('status')).toContainText('Loading')
    await expect(page.locator('.service-name')).toContainText(/Acupuncture/i)
    await expect(page.locator('.service-name')).not.toContainText(/[\u3400-\u9fff]/)
    release()
    await assertEnglishBooking(page)
  } finally { release() }
})
