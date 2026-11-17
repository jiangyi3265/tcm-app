import { test, expect } from '@playwright/test'

async function fixture(page) {
  const user = { id: 'qa', name: 'QA Admin', roles: ['admin'], isActive: true }
  let patients = ['Alice', 'Bob', 'Carol'].map(name => ({ id: name.toLowerCase(), name: `Family ${name}`,
    firstName: name, lastName: 'Family', isActive: true, emails: [`${name.toLowerCase()}@example.invalid`] }))
  const writes = [], reads = [], pending = [], errors = [], failures = new Set()
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(user => {
    localStorage.clear()
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_lang', 'en')
  }, user)
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET') {
      writes.push({ path, method: request.method(), body: request.postDataJSON() })
      if (path === '/api/patients/alice/merge') {
        await new Promise(resolve => pending.push(async (status, json) => {
          if (status === 200 && json.ok === true) patients = patients.map(patient => patient.id === 'bob' ? { ...patient, isActive: false, mergedInto: 'alice' } : patient)
          await route.fulfill({ status, json })
          resolve()
        }))
      } else await route.fulfill({ status: 400, json: { message: 'Unexpected write' } })
      return
    }
    reads.push(path)
    if (failures.has(path)) return route.fulfill({ status: 503, json: { message: 'Fixture refresh failure' } })
    let body = []
    if (path === '/api/patients') body = patients
    else if (path === '/api/users') body = [user]
    else if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, priceLists: [], rooms: [] }
    else if (path === '/api/settings/stripe') body = {}
    await route.fulfill({ json: body })
  })
  await page.goto('/patients')
  await expect(page.locator('.patient-name-cell')).toHaveCount(3)
  return { writes, reads, errors, failures, async respond(status, json) {
    await expect.poll(() => pending.length).toBeGreaterThan(0)
    await pending.shift()(status, json)
  } }
}

async function openMerge(page) {
  await page.getByRole('button', { name: 'Merge Records', exact: true }).click()
  const drawer = page.locator('.el-drawer').filter({ hasText: 'Merge Patient Records' })
  for (const [index, name] of ['Alice', 'Bob'].entries()) {
    const input = drawer.getByRole('combobox').nth(index)
    await input.click()
    const listId = await input.getAttribute('aria-controls')
    await page.locator(`#${listId}`).getByRole('option', { name: `${name} Family (${name.toLowerCase()}@example.invalid)`, exact: true }).click()
  }
  return drawer
}

async function confirmMerge(page, drawer) {
  await drawer.getByRole('button', { name: 'Confirm Merge', exact: true }).click()
  await page.locator('.el-message-box .el-button--primary').click()
}

test('dismissing merge confirmation is silent, retains the selection and makes no write', async ({ page }) => {
  const state = await fixture(page)
  const drawer = await openMerge(page)
  await drawer.getByRole('button', { name: 'Confirm Merge', exact: true }).evaluate(button => { button.click(); button.click() })
  await expect(page.locator('.el-message-box:visible')).toHaveCount(1)
  for (const input of await drawer.getByRole('combobox').all()) await expect(input).toBeDisabled()
  await page.locator('.el-message-box').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.el-message-box')).not.toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Confirm Merge', exact: true })).toBeEnabled()
  await expect(drawer).toContainText('Alice Family')
  await expect(drawer).toContainText('Bob Family')
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  expect(state.writes).toHaveLength(0)
  expect(state.errors).toEqual([])
})

test('pending merge captures one pair, locks the drawer and completes normally once', async ({ page }) => {
  const state = await fixture(page)
  const drawer = await openMerge(page)
  await drawer.getByRole('button', { name: 'Confirm Merge', exact: true }).evaluate(button => { button.click(); button.click() })
  await page.locator('.el-message-box .el-button--primary').evaluate(button => { button.click(); button.click() })
  await expect.poll(() => state.writes.length).toBe(1)
  await expect(drawer.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Merge Records', exact: true })).toBeDisabled()
  await expect(drawer.locator('.el-drawer__close-btn')).toHaveCount(0)
  await expect(drawer.getByRole('combobox')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(drawer).toBeVisible()
  await state.respond(200, { ok: true })
  await expect(drawer).not.toBeVisible()
  await expect(page.getByText('Records merged successfully', { exact: true })).toBeVisible()
  await expect(page.locator('.patient-name-cell')).toHaveCount(2)
  expect(state.writes).toEqual([{ path: '/api/patients/alice/merge', method: 'POST', body: { mergeId: 'bob' } }])
  expect(state.errors).toEqual([])
})

test('confirmed merge with refresh failure survives navigation and retries only the reads', async ({ page }) => {
  const state = await fixture(page)
  let drawer = await openMerge(page)
  await confirmMerge(page, drawer)
  await expect.poll(() => state.writes.length).toBe(1)
  state.failures.add('/api/patients')
  const beforeRefresh = state.reads.length
  await state.respond(200, { ok: true })
  await expect(drawer).toContainText('The merge succeeded, but some records could not be refreshed.')
  await expect(drawer.getByRole('button', { name: 'Refresh Records', exact: true })).toBeEnabled()
  await expect(drawer.getByRole('button', { name: 'Confirm Merge', exact: true })).toHaveCount(0)
  for (const path of ['/api/patients', '/api/consultations', '/api/appointments']) expect(state.reads.slice(beforeRefresh)).toContain(path)
  await drawer.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('.sidebar-nav').getByText('Appointments', { exact: true }).click()
  await expect(page).toHaveURL(/\/appointments$/)
  await page.locator('.sidebar-nav').getByText('Patients', { exact: true }).click()
  await expect(page).toHaveURL(/\/patients$/)
  await expect(page.locator('.patient-list')).toContainText('The merge succeeded, but some records could not be refreshed.')
  await page.getByRole('button', { name: 'Merge Records', exact: true }).click()
  drawer = page.locator('.el-drawer').filter({ hasText: 'Merge Patient Records' })
  await expect(drawer.getByRole('button', { name: 'Confirm Merge', exact: true })).toHaveCount(0)
  state.failures.clear()
  await drawer.getByRole('button', { name: 'Refresh Records', exact: true }).evaluate(button => { button.click(); button.click() })
  await expect(drawer).not.toBeVisible()
  await expect(page.getByText('Records merged successfully', { exact: true })).toBeVisible()
  await expect(page.locator('.patient-name-cell')).toHaveCount(2)
  expect(state.writes).toHaveLength(1)
  expect(state.errors).toEqual([])
})

test('unconfirmed POST failure requires read-only verification before a new merge decision', async ({ page }) => {
  const state = await fixture(page)
  const drawer = await openMerge(page)
  await confirmMerge(page, drawer)
  await expect.poll(() => state.writes.length).toBe(1)
  await state.respond(503, { message: 'Fixture connection lost' })
  await expect(drawer).toContainText('The merge result could not be confirmed.')
  await expect(drawer.getByRole('button', { name: 'Confirm Merge', exact: true })).toHaveCount(0)
  await expect(page.locator('.patient-name-cell')).toHaveCount(3)
  state.failures.add('/api/appointments')
  const beforeRefresh = state.reads.length
  await drawer.getByRole('button', { name: 'Refresh Records', exact: true }).click()
  await expect(drawer.getByRole('button', { name: 'Refresh Records', exact: true })).toBeEnabled()
  for (const path of ['/api/patients', '/api/consultations', '/api/appointments']) expect(state.reads.slice(beforeRefresh)).toContain(path)
  await expect(drawer.getByRole('button', { name: 'Confirm Merge', exact: true })).toHaveCount(0)
  state.failures.clear()
  await drawer.getByRole('button', { name: 'Refresh Records', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page.getByText('Records refreshed. Review the current patients before deciding whether to merge again.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Merge Records', exact: true }).click()
  await expect(drawer).not.toContainText('Alice Family')
  await expect(drawer).not.toContainText('Bob Family')
  expect(state.writes).toHaveLength(1)
  expect(state.errors).toEqual([])
})
