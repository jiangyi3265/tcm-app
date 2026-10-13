import { test, expect } from '@playwright/test'

async function fixture(page, { delayInitialUsers = false } = {}) {
  const user = { id: 'qa', name: 'Session QA', roles: ['admin'], isActive: true }
  const state = { meStatus: 401, delayedMe: null, meStarted: false }
  const oldUsersDelay = delayInitialUsers ? new Promise(resolve => { state.releaseOldUsers = resolve }) : null
  state.freshUsersReads = 0
  await page.addInitScript(user => {
    if (!sessionStorage.getItem('qa_session_initialized')) {
      sessionStorage.setItem('tcm_token', 'old-token')
      sessionStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
      sessionStorage.setItem('qa_session_initialized', '1')
    }
    localStorage.setItem('tcm_lang', 'en')
  }, user)
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/me') {
      state.meStarted = true
      if (state.delayedMe) await state.delayedMe
      return route.fulfill({ status: state.meStatus, json: { message: 'Session expired' } })
    }
    if (path === '/api/inventory/invoices/recognize') return route.fulfill({ status: 401, json: { message: 'Session expired' } })
    if (path === '/api/patients' && state.delayedPatients) {
      state.patientsStarted = true
      await state.delayedPatients
      return route.fulfill({ json: [{ id: 'old-patient', name: 'Previous session patient' }] })
    }
    let body = []
    if (path === '/api/auth/login') body = { token: 'fresh-token', user }
    if (path === '/api/users') {
      if (route.request().headers().authorization === 'Bearer old-token') {
        if (oldUsersDelay) await oldUsersDelay
        body = [user]
      } else {
        state.freshUsersReads++
        body = [user, { id: 'doctor', name: 'Current Doctor', roles: ['practitioner'], isActive: true }]
      }
    }
    if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, priceLists: [], rooms: [] }
    if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    await route.fulfill({ json: body })
  })
  await page.goto('/dashboard')
  if (!delayInitialUsers) await page.waitForLoadState('networkidle')
  await page.locator('main').waitFor()
  return state
}

test('an expired session returns to login and can sign in again', async ({ page }) => {
  await fixture(page)
  await page.evaluate(() => { void import('/src/utils/api.js').then(api => api.authApi.me()).catch(() => {}) })
  await expect(page).toHaveURL(/\/login$/)
  await page.locator('input').first().fill('session-qa@example.test')
  await page.locator('input[type=password]').fill('fixture-only')
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  expect(await page.evaluate(() => sessionStorage.getItem('tcm_token'))).toBe('fresh-token')
})

test('an old unauthorized response cannot clear a newly signed-in session', async ({ page }) => {
  const state = await fixture(page)
  let release
  state.delayedMe = new Promise(resolve => { release = resolve })
  await page.evaluate(async () => {
    window.oldSessionRequest = (await import('/src/utils/api.js')).authApi.me().catch(() => {})
  })
  await expect.poll(() => state.meStarted).toBe(true)
  await page.evaluate(async () => (await import('/src/stores/auth.js')).useAuthStore().login('session-qa@example.test', 'fixture-only'))
  release()
  await page.evaluate(() => window.oldSessionRequest)
  expect(await page.evaluate(() => sessionStorage.getItem('tcm_token'))).toBe('fresh-token')
  await page.locator('.sidebar .nav-item').filter({ hasText: /^Appointments$/ }).click()
  await expect(page).toHaveURL(/\/appointments$/)
})

test('an expired invoice upload session also allows signing in again', async ({ page }) => {
  await fixture(page)
  await page.evaluate(() => { void import('/src/utils/api.js').then(api => api.inventoryApi
    .recognizeInvoice(new File(['fixture'], 'invoice.txt', { type: 'text/plain' }))).catch(() => {}) })
  await expect(page).toHaveURL(/\/login$/)
})

test('a temporary server failure does not sign out a valid session', async ({ page }) => {
  const state = await fixture(page)
  state.meStatus = 503
  await page.evaluate(async () => (await import('/src/utils/api.js')).authApi.me().catch(() => {}))
  await page.locator('.sidebar .nav-item').filter({ hasText: /^Appointments$/ }).click()
  await expect(page).toHaveURL(/\/appointments$/)
  expect(await page.evaluate(() => sessionStorage.getItem('tcm_token'))).toBe('old-token')
})

test('a new login loads its own doctors while the expired session user list is still pending', async ({ page }) => {
  const state = await fixture(page, { delayInitialUsers: true })
  await page.evaluate(async () => (await import('/src/stores/auth.js')).useAuthStore().login('session-qa@example.test', 'fixture-only'))
  await expect.poll(() => state.freshUsersReads).toBe(1)
  state.releaseOldUsers()
  await page.waitForLoadState('networkidle')
  const doctors = await page.evaluate(async () => (await import('/src/stores/auth.js')).useAuthStore().getPractitioners().map(user => user.name))
  expect(doctors).toContain('Current Doctor')
})

test('a late successful response from the previous login cannot return old patient data', async ({ page }) => {
  const state = await fixture(page)
  let release
  state.delayedPatients = new Promise(resolve => { release = resolve })
  await page.evaluate(async () => {
    window.oldPatientsRequest = (await import('/src/utils/api.js')).patientsApi.list()
      .then(data => ({ data })).catch(error => ({ error: error.message }))
  })
  await expect.poll(() => state.patientsStarted).toBe(true)
  await page.evaluate(async () => (await import('/src/stores/auth.js')).useAuthStore().login('session-qa@example.test', 'fixture-only'))
  release()
  expect(await page.evaluate(() => window.oldPatientsRequest)).toEqual({ error: 'Session changed. Please retry.' })
  expect(await page.evaluate(() => sessionStorage.getItem('tcm_token'))).toBe('fresh-token')
})
