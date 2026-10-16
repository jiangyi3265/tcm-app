import { test, expect } from '@playwright/test'

async function fixture(page, { failLoad = false, roles = ['admin'], locale = 'en' } = {}) {
  const user = { id: 'smtp-qa', name: 'SMTP QA', roles, isActive: true }
  const writes = [], errors = []
  let loadAttempts = 0
  let config = { host: 'smtp.resend.com', port: 465, username: 'resend', fromAddress: 'Clinic <qa@example.invalid>', security: 'ssl', passwordConfigured: true, source: 'environment' }
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(({ user, locale }) => {
    sessionStorage.setItem('tcm_token', 'fixture-token')
    sessionStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_lang', locale)
  }, { user, locale })
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    let body = []
    if (req.method() !== 'GET') writes.push({ path, body: req.postData() ? req.postDataJSON() : null })
    if (path === '/api/users') body = [user]
    else if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, priceLists: [], rooms: [] }
    else if (path === '/api/settings/stripe' || path === '/api/ai/settings' || path === '/api/ai/status') body = {}
    else if (path === '/api/settings/smtp') {
      if (req.method() === 'GET' && failLoad && ++loadAttempts === 1) return route.fulfill({ status: 503, json: { message: 'Temporary error' } })
      if (req.method() === 'PUT') {
        const { password, ...fields } = req.postDataJSON()
        config = { ...config, ...fields, passwordConfigured: true, source: 'admin' }
      }
      body = config
    } else if (path === '/api/settings/smtp/test') body = { success: false, code: 'SMTP_AUTH_FAILED' }
    await route.fulfill({ json: body })
  })
  await page.goto('/admin')
  return { writes, errors }
}

test('rotates a key without retaining it and tests only saved configuration', async ({ page }) => {
  const { writes, errors } = await fixture(page)
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  const panel = page.locator('.smtp-settings')
  await expect(panel.getByLabel('SMTP password / Resend API key')).toHaveValue('')
  await panel.getByLabel('SMTP password / Resend API key').fill('local-test-replacement-key')
  await expect(panel.getByRole('button', { name: 'Test saved connection' })).toBeDisabled()
  await panel.getByRole('button', { name: 'Save SMTP settings', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('SMTP settings saved')
  await expect(panel.getByLabel('SMTP password / Resend API key')).toHaveValue('')
  expect(writes[0].body.password).toBe('local-test-replacement-key')
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
  expect(storage).not.toContain('local-test-replacement-key')
  await panel.getByRole('button', { name: 'Test saved connection' }).click()
  await expect(panel.getByRole('status')).toContainText('SMTP authentication was rejected')
  expect(writes[1]).toEqual({ path: '/api/settings/smtp/test', body: null })
  await panel.getByLabel('Sender address').fill('updated@example.invalid')
  await panel.getByRole('button', { name: 'Save SMTP settings', exact: true }).click()
  await expect(panel.getByRole('status')).toContainText('SMTP settings saved')
  expect(writes[2].body.password).toBe('')
  expect(errors).toEqual([])
})

test('can retry unavailable settings without overwriting them', async ({ page }) => {
  const { writes } = await fixture(page, { failLoad: true })
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  const panel = page.locator('.smtp-settings')
  await expect(panel.getByRole('button', { name: 'Save SMTP settings' })).toHaveCount(0)
  await panel.getByRole('button', { name: 'Reload', exact: true }).click()
  await expect(panel.getByLabel('SMTP host')).toHaveValue('smtp.resend.com')
  expect(writes).toEqual([])
})

test('SMTP settings fit the mobile form and show Chinese labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { errors } = await fixture(page, { locale: 'zh-CN' })
  await page.getByRole('tab', { name: '系统设置', exact: true }).click()
  const panel = page.locator('.smtp-settings')
  await panel.scrollIntoViewIfNeeded()
  await expect(panel.getByLabel('SMTP 服务器')).toHaveValue('smtp.resend.com')
  const bounds = await panel.boundingBox()
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(391)
  await expect(panel.getByLabel('SMTP 密码 / Resend API Key')).toHaveAttribute('type', 'password')
  await panel.screenshot({ path: 'test-results/smtp-settings-mobile.png' })
  expect(errors).toEqual([])
})

test('staff cannot open the admin SMTP configuration', async ({ page }) => {
  const { writes } = await fixture(page, { roles: ['practitioner'] })
  await expect(page).not.toHaveURL(/\/admin$/)
  await expect(page.locator('.smtp-settings')).toHaveCount(0)
  expect(writes).toEqual([])
})
