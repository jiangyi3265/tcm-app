import { test, expect } from '@playwright/test'

async function fixture(page) {
  const herb = { id: 'server-herb', name: '通草', pinyin: 'Tong Cao', isActive: true }
  const stock = { id: 'stock', herbDictId: herb.id, name: herb.name, category: 'powder', unit: 'bag', quantity: 111, gramsPerPacket: 6, pricePerUnit: 4, isActive: true, last30DaysUsage: 0 }
  const formulas = [
    { id: 'first', name: 'First formula', isActive: true, items: [{ herbDictId: herb.id, herbName: herb.name, dosage: 6, unit: 'g' }] },
    { id: 'second', name: 'Second formula', isActive: true, items: [{ herbDictId: herb.id, herbName: herb.name, dosage: 10, unit: 'g' }] },
  ]
  const writes = []
  const reads = []
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: { id: 'qa', name: 'QA Admin', roles: ['admin'] } }))
    localStorage.setItem('tcm_lang', 'en')
    localStorage.setItem('tcm_inventory', JSON.stringify([{ id: 'stock', name: '通草', category: 'powder', unit: 'bag', quantity: 111, gramsPerPacket: 6, isActive: true, last30DaysUsage: 67 }]))
  })
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (method === 'GET') reads.push(path)
    let body = []
    if (path === '/api/herb-dict') body = [herb]
    else if (path === '/api/formulas') {
      if (method === 'POST') { body = { ...route.request().postDataJSON(), id: 'created' }; formulas.push(body); writes.push(body) }
      else body = formulas
    } else if (path.startsWith('/api/formulas/')) body = formulas.find((f) => path.endsWith(f.id))
    else if (path === '/api/inventory') body = [stock]
    else if (path === '/api/inventory/stock') { Object.assign(stock, route.request().postDataJSON()); body = stock; writes.push(body) }
    else if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, priceLists: [], rooms: [], taxRate: 0.13 }
    else if (path === '/api/settings/stripe') body = {}
    else if (path === '/api/ai/settings') {
      body = { configured: true, apiKeyMasked: '••••5678', model: 'deepseek-flash' }
      if (method === 'PUT') writes.push(route.request().postDataJSON())
    } else if (path === '/api/inventory/invoices/recognize') body = { invoiceId: 'preview', currency: 'CAD', supplier: 'QA Supplier', items: [{ invoiceName: 'Tong Cao', quantity: 3, unit: 'bag', unitPriceBeforeDiscount: 2.5, gramsPerPacket: 10 }] }
    else if (path === '/api/inventory/invoices/confirm') { writes.push(route.request().postDataJSON()); body = { imported: true } }
    await route.fulfill({ json: body ?? {}, status: 200 })
  })
  return { writes, errors, reads }
}

test('new formula uses the current server dictionary and keeps the selected herb name', async ({ page }) => {
  const { writes, errors, reads } = await fixture(page)
  await page.goto('/formulas')
  await page.getByRole('button', { name: 'Add Formula', exact: true }).click()
  const panel = page.locator('.fv-add-panel')
  await panel.locator('.el-form-item').filter({ hasText: 'Formula Name' }).locator('input').fill('New formula')
  await panel.getByRole('combobox').last().click()
  await page.getByRole('option', { name: '通草', exact: true }).click()
  await panel.getByRole('button', { name: 'Add Herb', exact: true }).click()
  await expect(panel.getByRole('cell', { name: '通草', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Add Formula', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].items[0]).toMatchObject({ herbDictId: 'server-herb', herbName: '通草' })
  expect(reads).not.toContain('/api/patients')
  expect(reads).not.toContain('/api/consultations')
  expect(errors).toEqual([])
})

test('switching formula edit links loads the requested formula', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.goto('/formulas?edit=first')
  await expect(page.locator('.fv-card-name')).toHaveText(['First formula'])
  await expect(page.locator('.fv-card-body input').first()).toHaveValue('First formula')
  await page.goto('/formulas?edit=second')
  await expect(page.locator('.fv-card-name')).toHaveText(['Second formula'])
  await expect(page.locator('.fv-card-body input').first()).toHaveValue('Second formula')
  expect(errors).toEqual([])
})

test('editing inventory retains the herb and replaces cached usage with zero', async ({ page }) => {
  const { writes, errors } = await fixture(page)
  await page.goto('/inventory')
  const row = page.locator('.inventory-card .el-table__body tr').filter({ hasText: '通草' }).first()
  await expect(row).toBeVisible()
  await expect(row).not.toContainText('67 bag')
  await row.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(row.locator('.el-select').first()).toContainText('通草')
  await expect(row.getByRole('spinbutton').first()).toHaveValue('111')
  await row.getByRole('spinbutton').last().fill('10')
  await row.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toMatchObject({ name: '通草', herbDictId: 'server-herb', quantity: 111, gramsPerPacket: 10 })
  expect(errors).toEqual([])
})

test('invoice preview maps a herb and sends original purchase price once', async ({ page }) => {
  const { writes, errors } = await fixture(page)
  await page.goto('/inventory')
  await page.getByRole('button', { name: 'Import supplier invoice', exact: true }).click()
  await page.locator('.invoice-import input[type=file]').setInputFiles({ name: 'invoice.png', mimeType: 'image/png', buffer: Buffer.from('test invoice') })
  const panel = page.locator('.invoice-import')
  await expect(panel.getByRole('cell', { name: 'Tong Cao', exact: true })).toBeVisible()
  await expect(panel).toContainText('5.0000')
  await panel.getByRole('button', { name: 'Confirm and update inventory', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Invoice imported', exact: true })).toBeDisabled()
  expect(writes).toHaveLength(1)
  expect(writes[0].items[0]).toMatchObject({ herbDictId: 'server-herb', inventoryId: 'stock', quantity: 3, purchasePrice: 2.5 })
  expect(errors).toEqual([])
})

test('AI settings shows a mask and preserves the key when left blank', async ({ page }) => {
  const { writes, errors } = await fixture(page)
  await page.goto('/admin')
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  const heading = page.getByRole('heading', { name: 'DeepSeek AI settings', exact: true })
  await expect(heading).toBeVisible()
  const form = page.locator('form').filter({ has: page.getByPlaceholder('••••5678') })
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({ apiKey: '', model: 'deepseek-flash' })
  expect(errors).toEqual([])
})

for (const width of [390, 768]) {
  test(`inventory invoice panel fits a ${width}px viewport`, async ({ page }) => {
    const { errors } = await fixture(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/inventory')
    await page.getByRole('button', { name: 'Import supplier invoice', exact: true }).click()
    await expect(page.locator('.invoice-import')).toBeVisible()
    const geometry = await page.locator('.invoice-import').boundingBox()
    expect(geometry.x).toBeGreaterThanOrEqual(0)
    expect(geometry.x + geometry.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `test-results/invoice-${width}.png`, fullPage: true, animations: 'disabled' })
    expect(errors).toEqual([])
  })
}
