import { test, expect } from '@playwright/test'

async function fixture(page, { roles = ['admin'], failFirst = [] } = {}) {
  const user = { id: 'qa', name: 'QA User', roles, isActive: true }
  const reads = new Map()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(user => {
    localStorage.clear()
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_lang', 'en')
  }, user)
  await page.route('**/api/**', async route => {
    expect(route.request().method()).toBe('GET')
    const path = new URL(route.request().url()).pathname
    reads.set(path, (reads.get(path) || 0) + 1)
    if (failFirst.includes(path) && reads.get(path) === 1) {
      return route.fulfill({ status: 503, json: { message: 'Temporary connection failure' } })
    }
    let body = []
    if (path === '/api/users') body = [user]
    if (path === '/api/patients') body = [{ id: 'patient', name: 'Example Patient', isActive: true }]
    if (path === '/api/inventory') body = [{ id: 'low-stock', name: 'QA Low Stock', category: 'raw_herbs', quantity: 2, last30DaysUsage: 10, unit: 'g', isActive: true }]
    if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, priceLists: [], rooms: [] }
    if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    await route.fulfill({ json: body })
  })
  return { reads, errors }
}

test('a cold dashboard fetches current inventory before reporting stock as sufficient', async ({ page }) => {
  const { reads, errors } = await fixture(page)
  await page.goto('/dashboard')
  await expect(page.locator('.stock-item')).toContainText('QA Low Stock')
  await expect(page.locator('.stat-card').filter({ hasText: 'Low Stock Alert' }).locator('.stat-number')).toHaveText('1')
  expect(reads.get('/api/inventory')).toBe(1)
  expect(reads.has('/api/herb-dict')).toBe(false)
  expect(errors).toEqual([])
})

test('failed workspace resources retry on navigation without reloading successful resources', async ({ page }) => {
  const { reads, errors } = await fixture(page, { failFirst: ['/api/patients', '/api/settings'] })
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  expect(reads.get('/api/patients')).toBe(1)
  await page.locator('.sidebar .nav-item').filter({ hasText: /^Appointments$/ }).click()
  await expect(page).toHaveURL(/\/appointments$/)
  await expect.poll(() => reads.get('/api/patients')).toBe(2)
  await expect.poll(() => reads.get('/api/settings')).toBe(2)
  expect(reads.get('/api/consultations')).toBe(1)
  expect(reads.get('/api/appointments')).toBe(1)
  await page.locator('.sidebar .nav-item').filter({ hasText: /^Dashboard$/ }).click()
  await expect(page.locator('.stat-card').filter({ hasText: 'Total Patients' }).locator('.stat-number')).toHaveText('1')
  expect(reads.get('/api/patients')).toBe(2)
  expect(errors).toEqual([])
})

test('cashier dashboard does not fetch inventory it does not display', async ({ page }) => {
  const { reads } = await fixture(page, { roles: ['cashier'] })
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.stat-card').filter({ hasText: 'Low Stock Alert' })).toHaveCount(0)
  expect(reads.has('/api/inventory')).toBe(false)
})
