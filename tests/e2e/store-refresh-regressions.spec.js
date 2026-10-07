import { test, expect } from '@playwright/test'

async function setup(page) {
  const herb = { id: 'herb', name: '通草', isActive: true }
  const dictionary = [herb]
  const item = { id: 'stock', name: herb.name, herbDictId: herb.id, category: 'powder', unit: 'bag', quantity: 111, gramsPerPacket: 6, pricePerUnit: 4, isActive: true, last30DaysUsage: 67 }
  const reads = { inventory: 0, formulas: 0 }
  const delayed = {}
  await page.addInitScript(() => {
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: { id: 'qa', name: 'QA', roles: ['admin'] } }))
    localStorage.setItem('tcm_lang', 'en')
    localStorage.setItem('tcm_herb_dict', JSON.stringify([{ id: 'obsolete', name: 'Cached obsolete herb', isActive: true }]))
  })
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    let body = []
    if (path === '/api/herb-dict') {
      if (method === 'POST') { body = { ...route.request().postDataJSON(), id: 'new-herb', isActive: true }; dictionary.push(body) }
      else body = dictionary
    }
    else if (path === '/api/herb-dict/herb') { Object.assign(herb, route.request().postDataJSON()); body = herb }
    else if (path === '/api/inventory') { reads.inventory++; body = [{ ...item, name: herb.name }] }
    else if (path === '/api/inventory/stock') { Object.assign(item, route.request().postDataJSON()); body = item }
    else if (path === '/api/formulas') {
      reads.formulas++
      body = [{ id: 'formula', name: 'QA Formula', isActive: true, items: [{ herbDictId: herb.id, herbName: herb.name, dosage: 6, unit: 'g' }] }]
    } else if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, priceLists: [], rooms: [] }
    else if (path === '/api/settings/stripe') body = {}
    const json = JSON.stringify(body)
    // Freeze the old response before awaiting; later writes cannot change its snapshot.
    if (delayed[path]) { const wait = delayed[path]; delete delayed[path]; await wait }
    await route.fulfill({ body: json, contentType: 'application/json' })
  })
  return { reads, item, delayed }
}

test('a delayed inventory list cannot overwrite a saved edit or restore obsolete usage', async ({ page }) => {
  const { reads, item, delayed } = await setup(page)
  await page.goto('/inventory')
  await expect(page.locator('.inventory-card')).toContainText('通草')
  let release
  delayed['/api/inventory'] = new Promise((resolve) => { release = resolve })
  await page.evaluate(async () => {
    const { useInventoryStore } = await import('/src/stores/inventory.js')
    window.oldInventoryRequest = useInventoryStore().refreshFromApi()
  })
  await expect.poll(() => reads.inventory).toBe(2)
  item.last30DaysUsage = 0
  const row = page.locator('.inventory-card .el-table__body tr').filter({ hasText: '通草' }).first()
  await row.getByRole('button', { name: 'Edit', exact: true }).click()
  await row.getByRole('spinbutton').last().fill('10')
  await row.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(row).not.toContainText('67 bag')
  release()
  await page.evaluate(() => window.oldInventoryRequest)
  await row.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(row.getByRole('spinbutton').last()).toHaveValue('10')
  await expect(row).not.toContainText('67 bag')
  expect(reads.inventory).toBe(2)
})

test('concurrent inventory refreshes share one request', async ({ page }) => {
  const { reads } = await setup(page)
  await page.goto('/inventory')
  await expect(page.locator('.inventory-card')).toContainText('通草')
  await page.evaluate(async () => {
    const { useInventoryStore } = await import('/src/stores/inventory.js')
    const inventory = useInventoryStore()
    await Promise.all([inventory.refreshFromApi(), inventory.refreshFromApi(), inventory.refreshFromApi()])
  })
  expect(reads.inventory).toBe(2)
})

test('dictionary rename obtains new formula and inventory names despite an older formula request', async ({ page }) => {
  const { reads, delayed } = await setup(page)
  await page.goto('/formulas')
  await expect(page.locator('.fv-card-name')).toHaveText(['QA Formula'])
  let release
  delayed['/api/formulas'] = new Promise((resolve) => { release = resolve })
  await page.evaluate(async () => {
    const { useFormulasStore } = await import('/src/stores/formulas.js')
    window.oldFormulaRequest = useFormulasStore().refreshFromApi()
  })
  await expect.poll(() => reads.formulas).toBe(2)
  const renamed = await page.evaluate(async () => {
    const { useHerbDictStore } = await import('/src/stores/herbDict.js')
    const { useFormulasStore } = await import('/src/stores/formulas.js')
    const { useInventoryStore } = await import('/src/stores/inventory.js')
    await useHerbDictStore().updateHerb('herb', { name: '通草新版' })
    return { formula: useFormulasStore().getFormula('formula').items[0].herbName, inventory: useInventoryStore().getItem('stock').name }
  })
  release()
  await page.evaluate(() => window.oldFormulaRequest)
  expect(renamed).toEqual({ formula: '通草新版', inventory: '通草新版' })
  expect(reads.formulas).toBe(3)
  expect(await page.evaluate(async () => (await import('/src/stores/formulas.js')).useFormulasStore().getFormula('formula').items[0].herbName)).toBe('通草新版')
})

test('formula creation waits for the server dictionary rather than offering obsolete cached herbs', async ({ page }) => {
  const { delayed } = await setup(page)
  let release
  delayed['/api/herb-dict'] = new Promise((resolve) => { release = resolve })
  await page.goto('/formulas')
  await page.getByRole('button', { name: 'Add Formula', exact: true }).click()
  const select = page.locator('.fv-add-panel').getByRole('combobox').last()
  await expect(select).toBeDisabled()
  release()
  await expect(select).toBeEnabled()
  await select.click()
  await expect(page.getByRole('option', { name: '通草', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Cached obsolete herb', exact: true })).toHaveCount(0)
})

test('adding a herb during the first dictionary load still exposes the new server herb', async ({ page }) => {
  const { delayed } = await setup(page)
  let release
  delayed['/api/herb-dict'] = new Promise((resolve) => { release = resolve })
  await page.goto('/formulas')
  await page.getByRole('button', { name: 'Add Formula', exact: true }).click()
  const select = page.locator('.fv-add-panel').getByRole('combobox').last()
  await expect(select).toBeDisabled()
  await page.evaluate(async () => {
    const { useHerbDictStore } = await import('/src/stores/herbDict.js')
    await useHerbDictStore().addHerb({ name: '新增药材' })
  })
  release()
  await expect(select).toBeEnabled()
  await select.click()
  await expect(page.getByRole('option', { name: '新增药材', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Cached obsolete herb', exact: true })).toHaveCount(0)
})
