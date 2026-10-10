import { test, expect } from '@playwright/test'

async function fixture(page, targetPath) {
  const user = { id: 'qa', name: 'QA Admin', roles: ['admin'], isActive: true }
  const herb = { id: 'herb', name: 'QA Herb', isActive: true }
  const stock = { id: 'stock', herbDictId: herb.id, name: herb.name, category: 'powder', unit: 'bag', quantity: 100, gramsPerPacket: 6, pricePerUnit: 1, isActive: true }
  const writes = [], pending = [], errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript((user) => {
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_lang', 'en')
  }, user)
  await page.route('**/api/**', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET') {
      writes.push({ path, body: request.postDataJSON() })
      if (path === targetPath) {
        await new Promise((resolve) => pending.push(async (response) => {
          await route.fulfill(response)
          resolve()
        }))
        return
      }
      await route.fulfill({ status: 400, json: { message: 'Unexpected write' } })
      return
    }
    let body = []
    if (path === '/api/users') body = [user]
    else if (path === '/api/herb-dict') body = [herb]
    else if (path === '/api/inventory') body = [stock]
    else if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, priceLists: [], rooms: [], taxRate: 0.13 }
    else if (path === '/api/settings/stripe') body = {}
    await route.fulfill({ status: 200, json: body })
  })
  return {
    writes, errors, stock,
    async respond(status, json) {
      await expect.poll(() => pending.length).toBeGreaterThan(0)
      await pending.shift()({ status, json })
    },
  }
}

test('patient creation submits once and preserves the form for retry after a failed request', async ({ page }) => {
  const { writes, errors, respond } = await fixture(page, '/api/patients')
  await page.goto('/patients')
  await page.getByRole('button', { name: 'New Patient', exact: true }).click()
  const drawer = page.locator('.patient-create-drawer')
  await drawer.getByPlaceholder('Last Name', { exact: true }).fill('Example')
  await drawer.getByPlaceholder('First Name', { exact: true }).fill('Retry')
  await drawer.locator('.email-list input').first().fill('qa@example.invalid')
  const submit = drawer.getByRole('button', { name: 'Create Record', exact: true })
  await submit.dblclick()
  await expect.poll(() => writes.length).toBeGreaterThan(0)
  expect(writes).toHaveLength(1)
  await expect(submit).toBeDisabled()
  await expect(drawer.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await expect(drawer.getByPlaceholder('Last Name', { exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeVisible()
  await respond(500, { message: 'Temporary save failure' })
  await expect(page.getByText('Temporary save failure', { exact: true })).toBeVisible()
  await expect(submit).toBeEnabled()
  await expect(drawer.getByPlaceholder('Last Name', { exact: true })).toHaveValue('Example')
  await expect(drawer.getByPlaceholder('First Name', { exact: true })).toHaveValue('Retry')
  await expect(drawer.locator('.email-list input').first()).toHaveValue('qa@example.invalid')
  await submit.click()
  await expect.poll(() => writes.length).toBe(2)
  await respond(200, { ...writes[1].body, id: 'created', isActive: true })
  await expect(drawer).toBeHidden()
  await expect(page.locator('.patient-name-cell')).toContainText('Example')
  expect(errors).toEqual([])
})

test('stock adjustment applies one delta and retains the amount and reason after a failure', async ({ page }) => {
  const { writes, errors, stock, respond } = await fixture(page, '/api/inventory/stock/adjust')
  await page.goto('/inventory')
  const row = page.locator('.inventory-card .el-table__body tr').filter({ hasText: 'QA Herb' }).first()
  await row.getByRole('button', { name: 'Adjust', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Adjust Stock: QA Herb' })
  await dialog.getByRole('spinbutton').fill('10')
  await dialog.getByPlaceholder('Restock, inventory check, etc.').fill('QA inventory count')
  const submit = dialog.getByRole('button', { name: 'Confirm Adjust', exact: true })
  await submit.dblclick()
  await expect.poll(() => writes.length).toBeGreaterThan(0)
  expect(writes).toHaveLength(1)
  await expect(submit).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('spinbutton')).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await respond(500, { message: 'Temporary adjustment failure' })
  await expect(page.getByText('Temporary adjustment failure', { exact: true })).toBeVisible()
  await expect(submit).toBeEnabled()
  await expect(dialog.getByRole('spinbutton')).toHaveValue('10')
  await expect(dialog.getByPlaceholder('Restock, inventory check, etc.')).toHaveValue('QA inventory count')
  await submit.click()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[1].body).toEqual({ delta: 10, reason: 'QA inventory count' })
  await respond(200, { ...stock, quantity: 110 })
  await expect(dialog).toBeHidden()
  await expect(row).toContainText('110 bag')
  expect(errors).toEqual([])
})
