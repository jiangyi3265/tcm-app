import { test, expect } from '@playwright/test'

async function fixture(page, { copy = false, pricing = false, paid = false, rxSubtotal = 103.04, services = [] } = {}) {
  const user = { id: 'qa', name: 'QA', roles: ['admin', 'practitioner'], isActive: true }
  const patient = { id: 'patient', name: 'QA Patient', isActive: true }
  const rx = { id: 'rx', formulaName: 'QA Powder', prescriptionType: 'powder', whereToGet: 'Clinic', quantity: 10, rxStatus: 'pending', items: [
    { name: 'QA herb', herbDictId: 'herb', inventoryId: 'stock', dosage: 6, unit: 'g', packetsPerDose: 1, convertedQty: 10, convertedUnit: '包', gramsPerPacket: 6, pricePerUnit: 1, subtotal: 10 },
  ] }
  const record = { id: 'consult', consultationId: 'QA-1', patientId: patient.id, practitionerId: user.id, date: '2026-10-13', status: 'draft', chiefComplaint: 'Copied clinical notes', prescriptions: [rx], services, currency: 'CAD' }
  if (pricing) { rx.subtotal = rxSubtotal; record.includeRxAmount = true; record.overrideTaxRate = 0.13 }
  if (paid) Object.assign(record, { status: 'paid', paymentStatus: 'paid', totalAmount: 103.04, totalWithoutTax: 103.04, taxAmount: 0, paidAmount: 103.04 })
  const writes = [], state = { list: [record], delay: null, failSave: false, failInventory: false, reads: 0, inventoryReads: 0, inventoryDelay: null, stock: 100 }
  await page.addInitScript(({ user, patient, record, copy }) => {
    sessionStorage.setItem('tcm_token', 'fixture-token')
    sessionStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    sessionStorage.setItem('tcm_patients', JSON.stringify([patient]))
    sessionStorage.setItem('tcm_consultations', JSON.stringify([record]))
    localStorage.setItem('tcm_lang', 'en')
    if (copy) sessionStorage.setItem('tcm_copy_consult', JSON.stringify(record))
  }, { user, patient, record, copy })
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    const input = request.postData() ? request.postDataJSON() : null
    if (method !== 'GET') writes.push({ path, method, body: input })
    let body = []
    if (path === '/api/users') body = [user]
    else if (path === '/api/patients') body = [patient]
    else if (path === '/api/herb-dict') body = [{ id: 'herb', name: 'QA herb', isActive: true }]
    else if (path === '/api/inventory') {
      state.inventoryReads++
      if (state.failInventory) return route.fulfill({ status: 500, json: { message: 'Inventory unavailable; retry' } })
      body = [{ id: 'stock', herbDictId: 'herb', name: 'QA herb', quantity: state.stock, gramsPerPacket: 6, pricePerUnit: 1, category: 'powder', unit: 'bag', isActive: true }]
      if (state.inventoryDelay) { const delay = state.inventoryDelay; state.inventoryDelay = null; await delay }
    }
    else if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, rooms: [], priceLists: [] }
    else if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    else if (path === '/api/consultations' && method === 'POST') {
      body = { ...input, id: 'created', consultationId: 'QA-NEW' }; state.list.push(body)
    } else if (path === '/api/consultations') {
      state.reads++
      const frozen = JSON.stringify(state.list)
      if (state.delay) { const delay = state.delay; state.delay = null; await delay }
      return route.fulfill({ contentType: 'application/json', body: frozen })
    } else if (/^\/api\/consultations\/(consult|created|uncached)$/.test(path)) {
      const id = path.split('/').at(-1)
      if (method === 'PUT') {
        if (state.failSave) return route.fulfill({ status: 500, json: { message: 'Save unavailable; retry' } })
        body = { ...record, ...input, id, prescriptions: [{ ...rx, inventoryReservation: [{ inventoryId: 'stock', reservedQty: 10 }] }] }
        state.list = state.list.filter(r => r.id !== id).concat(body)
      } else if (method === 'DELETE') {
        state.stock += 10
        state.list = state.list.filter(r => r.id !== id)
        body = { success: true }
      } else body = state.list.find(r => r.id === id)
    } else if (path.endsWith('/prescriptions') && method === 'PATCH') {
      body = { ...record, ...input.consultation, prescriptions: [{ ...input.prescription, inventoryReservation: [{ inventoryId: 'stock', reservedQty: 20 }] }] }
      state.list = [body]
    } else if (path.endsWith('/delete')) {
      state.stock += 10
      body = { ...state.list.find(r => r.id === path.split('/')[3]), deletedAt: '2026-10-13 13:00:00', prescriptions: [] }
    }
    await route.fulfill({ json: body })
  })
  return { state, writes }
}

test('herb-only pricing displays and persists tax, exemption, and exclusion consistently', async ({ page }) => {
  const { writes } = await fixture(page, { pricing: true })
  await page.goto('/patients/patient/consultations/consult')
  await page.getByRole('tab', { name: 'Pricing', exact: true }).click()
  await expect(page.locator('.price-summary .tax-row')).toContainText('$13.40')
  await expect(page.locator('.price-summary .grand-total')).toContainText('$116.44')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => writes.filter(w => w.method === 'PUT').length).toBe(1)
  expect(writes.find(w => w.method === 'PUT').body).toMatchObject({ totalWithoutTax: 103.04, taxAmount: 13.4, totalAmount: 116.44 })
  await page.reload()
  await page.getByRole('tab', { name: 'Pricing', exact: true }).click()
  await expect(page.locator('.price-summary .tax-row')).toContainText('$13.40')
  await page.locator('.el-radio-button').filter({ hasText: /^0%/ }).click()
  await expect(page.locator('.price-summary .tax-row')).toContainText('$0.00')
  await expect(page.locator('.price-summary .grand-total')).toContainText('$103.04')
  await page.locator('.el-radio-button').filter({ hasText: /^13%$/ }).click()
  await page.locator('.el-form-item').filter({ hasText: 'Include Prescription Amount?' }).locator('.el-switch__core').click()
  await expect(page.locator('.price-summary .grand-total')).toContainText('$0.00')
  await page.locator('.el-form-item').filter({ hasText: 'Include Prescription Amount?' }).locator('.el-switch__core').click()
  await page.getByRole('button', { name: 'Percentage %', exact: true }).click()
  await page.locator('.el-form-item').filter({ hasText: 'Discount Type' }).getByRole('spinbutton').fill('10')
  await expect(page.locator('.price-summary .tax-row')).toContainText('$12.06')
  await expect(page.locator('.price-summary .grand-total')).toContainText('$104.80')
  await page.screenshot({ path: 'test-results/herb-pricing-tax.png', fullPage: true })
})

test('historical paid invoices retain their charged amounts when opened after tax fixes', async ({ page }) => {
  const { writes } = await fixture(page, { pricing: true, paid: true })
  await page.goto('/patients/patient/consultations/consult')
  await page.getByRole('tab', { name: 'Pricing', exact: true }).click()
  await expect(page.locator('.price-summary .tax-row')).toContainText('$0.00')
  await expect(page.locator('.price-summary .grand-total')).toContainText('$103.04')
  await expect(page.getByRole('radio', { name: '13%', exact: true })).toBeDisabled()
  expect(writes).toHaveLength(0)
})

test('discounted half-cent pricing displays and saves the same rounded amounts', async ({ page }) => {
  const { writes } = await fixture(page, { pricing: true, rxSubtotal: 2.3 })
  await page.goto('/patients/patient/consultations/consult')
  await page.getByRole('tab', { name: 'Pricing', exact: true }).click()
  await page.getByRole('button', { name: 'Percentage %', exact: true }).click()
  await page.locator('.el-form-item').filter({ hasText: 'Discount Type' }).getByRole('spinbutton').fill('5')
  await expect(page.locator('.price-summary .total-before-tax')).toContainText('$2.19')
  await expect(page.locator('.price-summary .tax-row')).toContainText('$0.28')
  await expect(page.locator('.price-summary .grand-total')).toContainText('$2.47')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => writes.filter(w => w.method === 'PUT').length).toBe(1)
  expect(writes.find(w => w.method === 'PUT').body).toMatchObject({ totalWithoutTax: 2.19, taxAmount: 0.28, totalAmount: 2.47 })
})

test('service-row tax and invoice tax agree at a half-cent boundary', async ({ page }) => {
  await fixture(page, { services: [{ name: 'QA taxable service', price: 4.5, quantity: 1, taxable: true }] })
  await page.goto('/patients/patient/consultations/consult')
  await page.getByRole('tab', { name: 'Pricing', exact: true }).click()
  await page.locator('.el-radio-button').filter({ hasText: /^13%$/ }).click()
  await expect(page.locator('.el-table__body tr').filter({ hasText: 'QA taxable service' })).toContainText('$0.59')
  await expect(page.locator('.price-summary .tax-row')).toContainText('$0.59')
  await expect(page.locator('.price-summary .grand-total')).toContainText('$5.09')
})

test('uncached consultation saves and stale list cannot replace authoritative reservations', async ({ page }) => {
  const { state } = await fixture(page)
  await page.goto('/patients'); await page.waitForLoadState('networkidle')
  let release
  state.delay = new Promise(resolve => { release = resolve })
  const reads = state.reads
  await page.evaluate(async () => {
    const store = (await import('/src/stores/consultations.js')).useConsultationsStore()
    window.oldConsultationRead = store.refreshFromApi()
  })
  await expect.poll(() => state.reads).toBe(reads + 1)
  const saved = await page.evaluate(async () => (await import('/src/stores/consultations.js')).useConsultationsStore()
    .updateConsultation('uncached', { chiefComplaint: 'Saved despite missing list', prescriptions: [] }))
  expect(saved.prescriptions[0].inventoryReservation[0].reservedQty).toBe(10)
  release()
  await page.evaluate(() => window.oldConsultationRead)
  const latest = await page.evaluate(async () => (await import('/src/stores/consultations.js')).useConsultationsStore().getConsultation('uncached'))
  expect(latest.chiefComplaint).toBe('Saved despite missing list')
  expect(latest.prescriptions[0].inventoryReservation).toHaveLength(1)
})

test('first consultation save preserves feedback, previous treatment rating, and explicit tax rate', async ({ page }) => {
  const { writes } = await fixture(page)
  await page.goto('/patients/patient/consultations/new')
  await page.locator('.el-form-item').filter({ hasText: 'Rate for Last Treatment' }).locator('.el-rate__item').nth(3).click()
  await page.getByRole('tab', { name: /Treatment/ }).click()
  await page.getByPlaceholder('Patient feedback for this treatment (fill in at next visit)...').fill('Feedback entered before the first Save')
  await page.getByRole('tab', { name: 'Pricing', exact: true }).click()
  await page.locator('.el-radio-button').filter({ hasText: /^13%$/ }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/consultations\/created$/)
  const created = writes.find(w => w.method === 'POST' && w.path === '/api/consultations')
  expect(created.body.feedback).toBe('Feedback entered before the first Save')
  expect(created.body.rateForLast).toBeGreaterThan(0)
  expect(created.body.overrideTaxRate).toBe(0.13)
  await page.getByRole('tab', { name: 'Pricing', exact: true }).click()
  await expect(page.getByRole('radio', { name: '13%', exact: true })).toBeChecked()
  await page.getByRole('tab', { name: /Treatment/ }).click()
  await expect(page.getByPlaceholder('Patient feedback for this treatment (fill in at next visit)...')).toHaveValue('Feedback entered before the first Save')
})

test('returning prescription stock replaces an inventory request started before deletion', async ({ page }) => {
  const { state } = await fixture(page)
  await page.goto('/patients'); await page.waitForLoadState('networkidle')
  let release
  state.inventoryDelay = new Promise(resolve => { release = resolve })
  const reads = state.inventoryReads
  await page.evaluate(async () => {
    const inventory = (await import('/src/stores/inventory.js')).useInventoryStore()
    window.oldInventoryRead = inventory.refreshFromApi()
  })
  await expect.poll(() => state.inventoryReads).toBe(reads + 1)
  await page.evaluate(async () => {
    window.deletion = (await import('/src/stores/consultations.js')).useConsultationsStore().deleteConsultation('consult')
  })
  await expect.poll(() => state.stock).toBe(110)
  release()
  await page.evaluate(() => Promise.all([window.oldInventoryRead, window.deletion]))
  expect(await page.evaluate(async () => (await import('/src/stores/inventory.js')).useInventoryStore().getItem('stock').quantity)).toBe(110)
})

test('permanent consultation deletion immediately refreshes stock restored by the server', async ({ page }) => {
  await fixture(page)
  await page.goto('/patients'); await page.waitForLoadState('networkidle')
  await page.evaluate(async () => (await import('/src/stores/inventory.js')).useInventoryStore().refreshFromApi())
  await page.evaluate(async () => (await import('/src/stores/consultations.js')).useConsultationsStore().physicalDeleteConsultation('consult'))
  expect(await page.evaluate(async () => (await import('/src/stores/inventory.js')).useInventoryStore().getItem('stock').quantity)).toBe(110)
})

test('failed consultation save preserves cached record and a retry succeeds', async ({ page }) => {
  const { state, writes } = await fixture(page)
  await page.goto('/patients'); await page.waitForLoadState('networkidle')
  state.failSave = true
  const result = await page.evaluate(async () => {
    const store = (await import('/src/stores/consultations.js')).useConsultationsStore()
    try { await store.updateConsultation('consult', { chiefComplaint: 'Retry notes' }) } catch (error) { return { message: error.message, record: store.getConsultation('consult') } }
  })
  expect(result.record.chiefComplaint).toBe('Copied clinical notes')
  expect(result.message).toContain('Save unavailable')
  state.failSave = false
  await page.evaluate(async () => (await import('/src/stores/consultations.js')).useConsultationsStore().updateConsultation('consult', { chiefComplaint: 'Retry notes' }))
  expect(writes.filter(w => w.method === 'PUT')).toHaveLength(2)
})

test('copying a prescription saves its parent and clinical notes before manual Save', async ({ page }) => {
  const { writes } = await fixture(page, { copy: true })
  await page.goto('/patients/patient/consultations/new')
  await expect(page).toHaveURL(/\/consultations\/created$/)
  const creates = writes.filter(w => w.method === 'POST' && w.path === '/api/consultations')
  expect(creates).toHaveLength(1)
  expect(creates[0].body.chiefComplaint).toBe('Copied clinical notes')
  expect(creates[0].body.prescriptions).toHaveLength(1)
  expect(creates[0].body.prescriptions[0].items[0].convertedQty).toBe(10)
  expect(creates[0].body.prescriptions[0].items[0].packetsPerDose).toBe(1)
  expect(creates[0].body.prescriptions[0].items[0].inventoryId).toBe('stock')
  expect(writes.filter(w => w.path.endsWith('/prescriptions'))).toHaveLength(0)
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
  await page.locator('.el-message-box').getByRole('button', { name: /OK|Confirm/ }).click()
  await expect(page).toHaveURL(/\/patients\/patient$/)
  expect(writes.filter(w => w.path === '/api/consultations/created/delete')).toHaveLength(1)
})

test('copied prescription is retained for retry when its inventory cannot be loaded', async ({ page }) => {
  const { state, writes } = await fixture(page, { copy: true })
  state.failInventory = true
  await page.goto('/patients/patient/consultations/new')
  await expect(page.locator('.el-message--error').filter({ hasText: 'Inventory unavailable; retry' })).toBeVisible()
  expect(writes.filter(w => w.path === '/api/consultations' && w.method === 'POST')).toHaveLength(0)
  expect(await page.evaluate(() => sessionStorage.getItem('tcm_copy_consult'))).not.toBeNull()
  state.failInventory = false
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/consultations\/created$/)
  const creates = writes.filter(w => w.path === '/api/consultations' && w.method === 'POST')
  expect(creates).toHaveLength(1)
  expect(creates[0].body.prescriptions[0].items[0].convertedQty).toBe(10)
  expect(creates[0].body.prescriptions[0].items[0].inventoryId).toBe('stock')
  expect(await page.evaluate(() => sessionStorage.getItem('tcm_copy_consult'))).toBeNull()
})

test('pharmacy displays per-dose packets and shows dose count once', async ({ page }) => {
  await fixture(page); await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('/pharmacy')
  await page.locator('.rx-card').first().click()
  await expect(page.locator('.rx-dose-summary')).toHaveText('Total Types: 1 · Per Dose: 1 bag (包) · Doses: 10')
  await expect(page.locator('.rx-dose-amount')).toHaveText('1 bag (包)/dose')
  expect(await page.locator('.rx-dose-amount').evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(17)
  await expect.poll(async () => { const b = await page.locator('.el-drawer').boundingBox(); return b.x + b.width }).toBeLessThanOrEqual(769)
  await page.screenshot({ path: 'test-results/pharmacy-single-dose.png', animations: 'disabled' })
})

test('prescription autosave includes clinical notes entered before manual Save', async ({ page }) => {
  const { writes } = await fixture(page)
  await page.goto('/patients/patient/consultations/consult')
  await page.locator('.el-form-item').filter({ hasText: 'Chief Complaint Description' }).locator('textarea').fill('New clinical notes saved with herbs')
  await page.getByRole('tab', { name: /Treatment/ }).click()
  await page.locator('.el-table__body tr').filter({ hasText: 'QA Powder' }).getByRole('button', { name: 'Edit', exact: true }).click()
  await page.locator('.rx-items-table').getByRole('spinbutton').first().fill('12')
  await expect.poll(() => writes.filter(w => w.path.endsWith('/prescriptions')).length).toBeGreaterThan(0)
  expect(writes.find(w => w.path.endsWith('/prescriptions')).body.consultation.chiefComplaintDescription).toBe('New clinical notes saved with herbs')
})

test('calendar shows and updates current day and current time without reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-13T10:35:00') })
  await fixture(page); await page.goto('/appointments')
  await expect(page.locator('.sg-date[aria-current=date]')).toHaveText('10-13')
  await expect(page.locator('.sg-now-line')).toHaveText('10:35')
  await page.clock.fastForward(60000)
  await expect(page.locator('.sg-now-line')).toHaveText('10:36')
  await page.locator('.sg-now-line').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/calendar-current-time.png' })
})

for (const width of [390, 768]) test(`booking logo precedes title and links home at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.route('**/api/**', route => route.fulfill({ json: { serviceTypes: [], practitioners: [], branches: [] } }))
  await page.goto('/booking')
  const title = page.getByRole('heading', { name: 'Treatment with OTCM', exact: true })
  await expect(title).toBeVisible()
  await expect(page.locator('.page-head .clinic-home-link')).toHaveAttribute('href', 'https://otcm.ca/')
  const logo = await page.locator('.page-head .clinic-logo').boundingBox(), heading = await title.boundingBox()
  expect(logo.y + logo.height <= heading.y || logo.x + logo.width < heading.x).toBe(true)
  expect(heading.x + heading.width).toBeLessThanOrEqual(width)
  await expect(page.getByText('Back to OTCM', { exact: true })).toHaveCount(0)
  await expect(page.locator('.auto-match-banner')).toHaveCount(0)
  await page.screenshot({ path: `test-results/booking-brand-${width}.png` })
})
