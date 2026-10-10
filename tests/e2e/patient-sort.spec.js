import { test, expect } from '@playwright/test'

test.use({ locale: 'en-US' })

async function syntheticPatientsFixture(page) {
  const user = { id: 'sort-qa', name: 'Synthetic Sort QA', roles: ['admin'], isActive: true }
  let patients = [
    { id: 'zulu', lastName: 'Zulu', firstName: 'Zoe' },
    { id: 'baker10', lastName: 'Baker 10', firstName: 'Amy' },
    { id: 'zhang10', lastName: '张 10', firstName: '一' },
    { id: 'adams', lastName: 'Adams', firstName: 'Amy' },
    { id: 'baker2', lastName: 'Baker 2', firstName: 'Amy' },
    { id: 'zhang2', lastName: '张 2', firstName: '一' },
  ]
  let patientReads = 0
  const writes = [], errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.addInitScript((user) => {
    localStorage.setItem('tcm_token', 'synthetic-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_lang', 'en')
  }, user)
  await page.route('**/api/**', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET') {
      writes.push({ path, method: request.method() })
      await route.fulfill({ status: 400, json: { message: 'Read-only synthetic fixture' } })
      return
    }
    let body = []
    if (path === '/api/users') body = [user]
    else if (path === '/api/patients') {
      patientReads++
      body = patients.map((patient) => ({ ...patient, name: `${patient.lastName} ${patient.firstName}`, isActive: true }))
    } else if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, priceLists: [], rooms: [], taxRate: 0.13 }
    else if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    await route.fulfill({ status: 200, json: body })
  })
  return {
    writes, errors,
    get patientReads() { return patientReads },
    replacePatients(update) { patients = update(patients) },
  }
}

const ascendingNames = ['Amy Adams', 'Amy Baker 2', 'Amy Baker 10', 'Zoe Zulu', '一 张 2', '一 张 10']
const displayedNames = (page) => page.locator('.patient-name-cell > div > div:first-child')
const sortCaret = (page, direction) => page.getByRole('button', { name: 'Sort by Name', exact: true }).locator(`.sort-caret.${direction}`)

test('patient names keep natural ascending and descending order through search filters', async ({ page }) => {
  const fixture = await syntheticPatientsFixture(page)
  await page.goto('/patients')
  await expect(displayedNames(page)).toHaveText(ascendingNames)
  await sortCaret(page, 'descending').click()
  await expect(displayedNames(page)).toHaveText([...ascendingNames].reverse())

  const search = page.getByPlaceholder('Search name, email or phone...', { exact: true })
  await search.fill('Baker')
  await expect(displayedNames(page)).toHaveText(['Amy Baker 10', 'Amy Baker 2'])
  await sortCaret(page, 'ascending').click()
  await expect(displayedNames(page)).toHaveText(['Amy Baker 2', 'Amy Baker 10'])
  await search.fill('张')
  await expect(displayedNames(page)).toHaveText(['一 张 2', '一 张 10'])
  await sortCaret(page, 'descending').click()
  await expect(displayedNames(page)).toHaveText(['一 张 10', '一 张 2'])
  await search.fill('')
  await expect(displayedNames(page)).toHaveText([...ascendingNames].reverse())
  await sortCaret(page, 'ascending').click()
  await expect(displayedNames(page)).toHaveText(ascendingNames)
  expect(fixture.writes).toEqual([])
  expect(fixture.errors).toEqual([])
})

test('refresh sorts renamed and newly returned patients instead of retaining the previous order', async ({ page }) => {
  const fixture = await syntheticPatientsFixture(page)
  await page.goto('/patients')
  await expect(displayedNames(page)).toHaveText(ascendingNames)
  const originalReads = fixture.patientReads
  fixture.replacePatients((patients) => [
    ...patients.map((patient) => patient.id === 'zulu' ? { ...patient, lastName: 'Aaron' } : patient).reverse(),
    { id: 'new-baker1', lastName: 'Baker 1', firstName: 'Amy' },
  ])

  await page.reload()
  await expect.poll(() => fixture.patientReads).toBeGreaterThan(originalReads)
  const refreshedNames = ['Zoe Aaron', 'Amy Adams', 'Amy Baker 1', 'Amy Baker 2', 'Amy Baker 10', '一 张 2', '一 张 10']
  await expect(displayedNames(page)).toHaveText(refreshedNames)
  await sortCaret(page, 'descending').click()
  await expect(displayedNames(page)).toHaveText([...refreshedNames].reverse())
  expect(fixture.writes).toEqual([])
  expect(fixture.errors).toEqual([])
})
