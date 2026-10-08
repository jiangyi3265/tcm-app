import { test, expect } from '@playwright/test'
test.use({ hasTouch: true })

async function fixture(page) {
  const user = { id: 'qa', name: 'QA Practitioner', roles: ['admin', 'practitioner'], isActive: true }
  const patient = { id: 'patient', name: 'Example Alexandra', lastName: 'Example', firstName: 'Alexandra', emails: ['qa@example.invalid'], isActive: true }
  const herbs = Array.from({ length: 16 }, (_, i) => ({ id: `herb-${i}`, name: `QA Herb ${i + 1}`, isActive: true }))
  const inventory = herbs.map((h, i) => ({ id: `stock-${i}`, name: h.name, herbDictId: h.id, category: 'raw_herbs', quantity: 1000, unit: 'g', pricePerUnit: 1, isActive: true }))
  const rx = { id: 'rx', formulaName: 'QA 16 herbs', prescriptionType: 'raw_herbs', whereToGet: 'Clinic', quantity: 2, rxStatus: 'editing', items: herbs.map((h, i) => ({ name: h.name, herbDictId: h.id, inventoryId: `stock-${i}`, dosage: 3, convertedQty: 6, convertedUnit: 'g', pricePerUnit: 1, subtotal: 6 })) }
  const consultations = [0, 1, 2].map((i) => ({ id: `consult-${i}`, consultationId: `QA-${i}`, patientId: patient.id, practitionerId: user.id, date: `2026-09-0${3 - i}`, status: 'draft', chiefComplaint: `Complaint ${i}`, prescriptions: i === 0 ? [rx] : [], services: [], currency: 'CAD' }))
  const writes = [], reads = [], errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(({ user, patient, consultations }) => {
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_patients', JSON.stringify([patient]))
    localStorage.setItem('tcm_consultations', JSON.stringify(consultations))
    localStorage.setItem('tcm_lang', 'en')
  }, { user, patient, consultations })
  await page.route('**/api/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname
    if (req.method() !== 'GET') writes.push({ path, method: req.method(), body: req.postDataJSON() })
    else reads.push(url.pathname + url.search)
    let body = []
    if (path === '/api/users') body = [user]
    else if (path === '/api/patients') body = req.method() === 'POST' ? { ...req.postDataJSON(), id: 'created', isActive: true } : [patient]
    else if (path === '/api/herb-dict') body = herbs
    else if (path === '/api/inventory') body = inventory
    else if (path === '/api/inventory/adjustment-history') body = [{ createdAt: '2026-09-03 10:00:00', targetName: 'QA Herb 1', userName: user.name, action: 'PRESCRIPTION_DEDUCT', details: 'Prescription stock reserved [rx]: 1000 -> 994 g (-6)' }]
    else if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, priceLists: [], rooms: [], taxRate: 0.13 }
    else if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    else if (path === '/api/consultations') body = consultations
    else if (/^\/api\/consultations\/consult-\d$/.test(path)) body = consultations.find((c) => path.endsWith(c.id))
    else if (path.endsWith('/prescriptions') && req.method() === 'PATCH') body = consultations[0]
    await route.fulfill({ json: body, status: 200 })
  })
  return { writes, reads, errors }
}

for (const width of [390, 768]) {
  test(`patient list and new patient form are usable at ${width}px`, async ({ page }) => {
    const { writes, reads, errors } = await fixture(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/patients')
    await expect(page.getByRole('columnheader', { name: 'Date of Birth' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Created Date' })).toHaveCount(0)
    await expect(page.locator('.patient-name-cell')).toContainText('Example')
    await page.waitForLoadState('networkidle')
    for (const path of ['/api/patients', '/api/consultations', '/api/appointments']) {
      expect(reads.filter((entry) => entry === path)).toHaveLength(1)
    }
    expect(reads).not.toContain('/api/herb-dict')
    expect((await page.locator('.patient-name-cell').boundingBox()).width).toBeGreaterThan(200)
    await page.getByRole('button', { name: 'New Patient', exact: true }).click()
    const drawer = page.locator('.patient-create-drawer')
    await expect(drawer).toBeVisible()
    await expect.poll(async () => { const b = await drawer.boundingBox(); return b.x + b.width }).toBeLessThanOrEqual(width + 1)
    const box = await drawer.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
    await drawer.getByPlaceholder('Last Name', { exact: true }).fill('Test')
    await drawer.getByPlaceholder('First Name', { exact: true }).fill('Mobile')
    await drawer.locator('.email-list input').first().fill('qa@example.invalid')
    const fonts = await drawer.locator('input').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)))
    expect(Math.min(...fonts)).toBeGreaterThanOrEqual(16)
    const overflow = await drawer.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(overflow).toBe(false)
    await page.screenshot({ path: `test-results/patient-create-${width}.png` })
    await drawer.getByRole('button', { name: 'Create Record', exact: true }).click()
    await expect(drawer).toBeHidden()
    expect(writes.find((w) => w.path === '/api/patients')?.body).toMatchObject({ firstName: 'Mobile', lastName: 'Test' })
    expect(errors).toEqual([])
  })
}

for (const width of [768, 1180]) {
  test(`history comparison arrows remain clickable with sidebar at ${width}px`, async ({ page }) => {
    const { errors } = await fixture(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/patients/patient/consultations/consult-0')
    await page.getByRole('button', { name: 'Compare History', exact: true }).click()
    const dialog = page.locator('.compare-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.compare-nav-info')).toContainText('QA-1')
    await dialog.getByRole('button', { name: 'Older record', exact: true }).click()
    await expect(dialog.locator('.compare-nav-info')).toContainText('QA-2')
    await dialog.getByRole('button', { name: 'Newer record', exact: true }).click()
    await expect(dialog.locator('.compare-nav-info')).toContainText('QA-1')
    const box = await dialog.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `test-results/compare-${width}.png` })
    expect(errors).toEqual([])
  })
}

test('tablet prescription shows 16 compact herb rows and the complete gram total', async ({ page }) => {
  const { errors } = await fixture(page)
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('/patients/patient/consultations/consult-0')
  await page.getByRole('tab', { name: /Treatment/ }).click()
  const row = page.locator('.el-table__body tr').filter({ hasText: 'QA 16 herbs' })
  await expect(row).toContainText('16 herbs · 96 g')
  await row.getByRole('button', { name: 'Edit', exact: true }).click()
  const table = page.locator('.rx-items-table')
  await expect(table.locator('.el-table__body tr')).toHaveCount(16)
  await expect(page.locator('.rx-dialog-body .rx-summary')).toHaveText('16 herbs · 96 g')
  const sizes = await table.evaluate((el) => ({
    rows: [...el.querySelectorAll('.el-table__body tr')].reduce((sum, row) => sum + row.getBoundingClientRect().height, 0),
    viewport: el.querySelector('.el-table__body-wrapper .el-scrollbar__wrap').clientHeight,
  }))
  expect(sizes.viewport + 1).toBeGreaterThanOrEqual(sizes.rows)
  await table.screenshot({ path: 'test-results/prescription-tablet-16.png' })
  expect(errors).toEqual([])
})

test('each inventory herb opens its own prescription deduction audit', async ({ page }) => {
  const { reads, errors } = await fixture(page)
  await page.goto('/inventory')
  await page.getByRole('tab', { name: /Raw Herbs/ }).click()
  const row = page.locator('.el-table__body tr').filter({ hasText: 'QA Herb 1' }).first()
  await row.getByRole('button', { name: 'History', exact: true }).click()
  const drawer = page.locator('.el-drawer').filter({ hasText: 'Adjustment History - QA Herb 1' })
  await expect(drawer).toContainText('1000 -> 994 g (-6)')
  expect(reads).toContain('/api/inventory/adjustment-history?itemId=stock-0')
  expect(errors).toEqual([])
})
