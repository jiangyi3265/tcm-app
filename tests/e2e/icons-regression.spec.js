import { test, expect } from '@playwright/test'

function trackIconErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (/Failed to resolve component|Invalid vnode type/.test(message.text())) errors.push(message.text())
  })
  return errors
}

test('login retains string icons and the internal Element Plus password and message icons', async ({ page }) => {
  const errors = trackIconErrors(page)
  await page.addInitScript(() => localStorage.setItem('tcm_lang', 'en'))
  await page.goto('/login')
  await expect(page.locator('.login-logo svg')).toHaveCount(1)
  await expect(page.locator('.el-input__prefix svg')).toHaveCount(2)
  const password = page.locator('input[type="password"]')
  await password.fill('local-icon-check')
  const visibility = page.locator('.el-input__password')
  await expect(visibility.locator('svg')).toHaveCount(1)
  await visibility.click()
  await expect(page.locator('input').nth(1)).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await expect(page.locator('.el-message__icon svg')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('all dynamic sidebar icons render in expanded and collapsed navigation', async ({ page }) => {
  const errors = trackIconErrors(page)
  const user = { id: 'qa', name: 'QA Admin', roles: ['admin'], isActive: true }
  await page.addInitScript((user) => {
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_lang', 'en')
  }, user)
  await page.route('**/api/**', async (route) => {
    if (route.request().method() !== 'GET') return route.abort()
    const path = new URL(route.request().url()).pathname
    let body = []
    if (path === '/api/users') body = [user]
    else if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, priceLists: [], rooms: [], taxRate: 0.13 }
    else if (path === '/api/settings/stripe') body = {}
    await route.fulfill({ status: 200, json: body })
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/dashboard')
  const items = page.locator('.sidebar-nav .nav-item')
  await expect(items).toHaveCount(11)
  for (const item of await items.all()) await expect(item.locator('.nav-icon svg')).toHaveCount(1)
  await page.locator('.hamburger-btn').click()
  await expect(page.locator('.sidebar')).toHaveClass(/collapsed/)
  await expect(page.locator('.hamburger-btn svg')).toHaveCount(1)
  for (const item of await items.all()) await expect(item.locator('.nav-icon svg')).toBeVisible()
  await page.locator('.hamburger-btn').click()
  await items.filter({ hasText: 'Patients' }).click()
  await expect(page).toHaveURL(/\/patients$/)
  await expect(page.getByRole('button', { name: 'Merge Records', exact: true }).locator('svg')).toHaveCount(1)
  await expect(page.locator('.el-input__prefix svg')).toHaveCount(1)
  expect(errors).toEqual([])
})
