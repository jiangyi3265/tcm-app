import { test, expect } from '@playwright/test'

async function openPatient(page, { onSave, withHistory = false, isAdmin = true, signed = true } = {}) {
  const user = { id: 'doctor', name: 'Fixture Doctor', roles: isAdmin ? ['admin', 'practitioner'] : ['practitioner'], isActive: true }
  const patients = ['Alice', 'Bob'].map((firstName, index) => ({
    id: index ? 'bravo' : 'alpha', name: `Fixture ${firstName}`, firstName, lastName: 'Fixture',
    emails: ['family@example.invalid'], isActive: true, deletedAt: null, mergedInto: null, consentSigned: signed, practitionerId: user.id,
    addressCountry: 'CA', notes: 'Original notes', historyAndMedication: 'Original patient history',
    historySourceConsultId: 'history', historySourceConsultDate: '2026-11-01',
  }))
  const consultations = withHistory ? [{ id: 'history', patientId: 'alpha', practitionerId: user.id,
    date: '2026-11-01', createdAt: '2026-11-01', historyAndMedicationSnapshot: 'Protected consultation history', status: 'completed' }] : []
  const writes = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({ user, patients, consultations }) => {
    localStorage.clear()
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_patients', JSON.stringify(patients))
    localStorage.setItem('tcm_consultations', JSON.stringify(consultations))
    localStorage.setItem('tcm_lang', 'en')
  }, { user, patients, consultations })
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET') {
      writes.push({ path, method: request.method(), body: request.postDataJSON() })
      if (onSave && await onSave(route, writes.length)) return
      if (path === '/api/patients/alpha/delete' && request.method() === 'PATCH') {
        patients[0] = { ...patients[0], isActive: false, deletedAt: '2026-11-17' }
        return route.fulfill({ json: patients[0] })
      }
      if (path === '/api/patients/alpha/consent' && request.method() === 'PATCH') {
        patients[0] = { ...patients[0], consentSigned: true, consentSignedAt: '2026-11-17', consentSignatureName: request.postDataJSON().signatureName }
        return route.fulfill({ json: patients[0] })
      }
      const index = patients.findIndex(patient => path === `/api/patients/${patient.id}`)
      if (index < 0 || request.method() !== 'PUT') throw new Error(`Unexpected fixture write: ${request.method()} ${path}`)
      patients[index] = { ...patients[index], ...request.postDataJSON() }
      return route.fulfill({ json: patients[index] })
    }
    let body = []
    if (path === '/api/users') body = [user]
    else if (path === '/api/patients') body = patients
    else if (path === '/api/consultations') body = consultations
    else if (path === '/api/settings') body = { consentTemplate: { title: 'Fixture Consent', version: '1', sections: [{ key: 'agreement', title: 'Fixture agreement', paragraphs: ['Fixture text'] }] } }
    else if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    await route.fulfill({ json: body })
  })
  await page.goto('/patients/alpha')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.locator('.edit-save-panel')).toBeVisible()
  return { writes, errors, patients }
}

function input(page, label) {
  return page.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: new RegExp(`^${label}$`) }) }).locator('input')
}

test('patient edit submits once, locks its draft, and retains failed edits for retry', async ({ page }) => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const state = await openPatient(page, { onSave: async (route, attempt) => {
    if (attempt !== 1) return false
    await pending
    await route.fulfill({ status: 503, json: { message: 'Temporary patient save failure' } })
    return true
  } })
  try {
    await input(page, 'First Name').fill('Alicia')
    await input(page, 'Email 1').fill('updated@example.invalid')
    await page.getByPlaceholder('Allergies, special notes...', { exact: true }).fill('Keep this draft')
    const save = page.getByRole('button', { name: 'Save Changes', exact: true })
    await save.evaluate(button => {
      button.click()
      button.click()
      // Cancel can still receive a click before Vue paints the disabled state.
      button.parentElement.querySelectorAll('button')[1].click()
    })
    await expect.poll(() => state.writes.length).toBe(1)
    await expect(save).toBeDisabled()
    await expect(page.locator('.edit-save-panel').getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await expect(input(page, 'First Name')).toBeDisabled()
    await expect(input(page, 'Email 1')).toBeDisabled()
    await expect(page.getByPlaceholder('Allergies, special notes...', { exact: true })).toBeDisabled()
    release()
    await expect(page.getByText('Temporary patient save failure', { exact: true })).toBeVisible()
    await expect(save).toBeEnabled()
    await expect(input(page, 'First Name')).toHaveValue('Alicia')
    await expect(input(page, 'Email 1')).toHaveValue('updated@example.invalid')
    await expect(page.getByPlaceholder('Allergies, special notes...', { exact: true })).toHaveValue('Keep this draft')
    await save.click()
    await expect(page.locator('.edit-save-panel')).toHaveCount(0)
    expect(state.writes).toHaveLength(2)
    expect(state.writes[1]).toEqual(state.writes[0])
    expect(state.writes[1]).toMatchObject({ path: '/api/patients/alpha', method: 'PUT', body: { firstName: 'Alicia', name: 'Fixture Alicia', emails: ['updated@example.invalid'], notes: 'Keep this draft' } })
    for (const field of ['isActive', 'deletedAt', 'mergedInto']) expect(state.writes[1].body).not.toHaveProperty(field)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(input(page, 'First Name')).toHaveValue('Alicia')
    await expect(input(page, 'Email 1')).toHaveValue('updated@example.invalid')
    expect(state.errors).toEqual([])
  } finally { release() }
})

test('cancelling an unsaved patient edit discards only its draft and permits a fresh edit', async ({ page }) => {
  const state = await openPatient(page)
  await input(page, 'First Name').fill('Unsaved')
  await input(page, 'Email 1').fill('unsaved@example.invalid')
  await page.locator('.edit-save-panel').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(input(page, 'First Name')).toHaveValue('Alice')
  await expect(input(page, 'Email 1')).toHaveValue('family@example.invalid')
  expect(state.writes).toEqual([])
  expect(state.errors).toEqual([])
})

test('patient edit preserves consultation history and the separate family member sharing its email', async ({ page }) => {
  const state = await openPatient(page, { withHistory: true })
  await expect(page.getByText('Protected consultation history', { exact: true })).toBeVisible()
  await input(page, 'First Name').fill('Alicia')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect(page.locator('.edit-save-panel')).toHaveCount(0)
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0].body).not.toHaveProperty('historyAndMedication')
  expect(state.writes[0].body).not.toHaveProperty('historySourceConsultId')
  expect(state.writes[0].body).not.toHaveProperty('historySourceConsultDate')
  expect(state.writes[0].body).toMatchObject({ id: 'alpha', name: 'Fixture Alicia', emails: ['family@example.invalid'] })
  await page.goto('/patients/bravo')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(input(page, 'First Name')).toHaveValue('Bob')
  await expect(input(page, 'Email 1')).toHaveValue('family@example.invalid')
  expect(state.errors).toEqual([])
})

test('a non-admin practitioner preserves failed edits and never submits a practitioner reassignment', async ({ page }) => {
  const state = await openPatient(page, { isAdmin: false, onSave: async (route, attempt) => {
    if (attempt !== 1) return false
    await route.fulfill({ status: 503, json: { message: 'Temporary practitioner edit failure' } })
    return true
  } })
  await expect(input(page, 'Primary Practitioner')).toBeDisabled()
  await expect(input(page, 'Primary Practitioner')).toHaveValue('Fixture Doctor')
  await input(page, 'First Name').fill('Alicia')
  await page.getByPlaceholder('Allergies, special notes...', { exact: true }).fill('Preserve practitioner draft')
  const save = page.getByRole('button', { name: 'Save Changes', exact: true })
  await save.click()
  await expect(page.getByText('Temporary practitioner edit failure', { exact: true })).toBeVisible()
  await expect(save).toBeEnabled()
  await expect(input(page, 'First Name')).toHaveValue('Alicia')
  await expect(page.getByPlaceholder('Allergies, special notes...', { exact: true })).toHaveValue('Preserve practitioner draft')
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0].body).not.toHaveProperty('practitionerId')
  await save.click()
  await expect(page.locator('.edit-save-panel')).toHaveCount(0)
  expect(state.writes).toHaveLength(2)
  expect(state.writes[1].body).not.toHaveProperty('practitionerId')
  expect(state.writes[1]).toEqual(state.writes[0])
  expect(state.patients[0].practitionerId).toBe('doctor')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(input(page, 'First Name')).toHaveValue('Alicia')
  await expect(page.getByPlaceholder('Allergies, special notes...', { exact: true })).toHaveValue('Preserve practitioner draft')
  expect(state.errors).toEqual([])
})

test('a pending patient edit prevents a simultaneous deactivation', async ({ page }) => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const state = await openPatient(page, { signed: false, onSave: async () => { await pending; return false } })
  try {
    await input(page, 'First Name').fill('Alicia')
    await page.getByRole('button', { name: 'Save Changes', exact: true }).evaluate(button => {
      button.click()
      Array.from(document.querySelectorAll('.patient-actions button')).find(action => action.textContent.trim() === 'Deactivate').click()
    })
    await expect.poll(() => state.writes.length).toBe(1)
    await expect(page.getByRole('button', { name: 'Deactivate', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Sign Consent', exact: true })).toBeDisabled()
    await page.getByRole('tab', { name: 'Consent Form', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Sign Consent Form', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Send Signing Email', exact: true })).toBeDisabled()
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await expect(page.locator('.el-message-box:visible')).toHaveCount(0)
    expect(state.writes[0].method).toBe('PUT')
    release()
    await expect(page.locator('.edit-save-panel')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Deactivate', exact: true })).toBeEnabled()
    expect(state.writes).toHaveLength(1)
    expect(state.patients[0]).toMatchObject({ isActive: true, deletedAt: null, firstName: 'Alicia' })
    expect(state.errors).toEqual([])
  } finally { release() }
})

test('consent signing submits once, locks its drawer, and keeps the signature after failure', async ({ page }) => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const state = await openPatient(page, { signed: false, onSave: async (route, attempt) => {
    if (attempt !== 1) return false
    await pending
    await route.fulfill({ status: 503, json: { message: 'Temporary consent failure' } })
    return true
  } })
  try {
    await page.locator('.edit-save-panel').getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Sign Consent', exact: true }).click()
    const drawer = page.locator('.el-drawer').filter({ hasText: 'Sign Consent Form' })
    await drawer.locator('.el-checkbox').click()
    const signature = drawer.getByPlaceholder('Enter signatory name', { exact: true })
    await signature.fill('Alice Fixture')
    const confirm = drawer.getByRole('button', { name: 'Confirm Signature', exact: true })
    await confirm.evaluate(button => {
      button.click()
      button.click()
      button.parentElement.querySelectorAll('button')[0].click()
    })
    await expect.poll(() => state.writes.length).toBe(1)
    expect(state.writes[0]).toMatchObject({ method: 'PATCH', path: '/api/patients/alpha/consent', body: { signatureName: 'Alice Fixture', sectionAcknowledgements: { agreement: true } } })
    await expect(confirm).toBeDisabled()
    await expect(signature).toBeDisabled()
    await expect(drawer.getByRole('checkbox')).toBeDisabled()
    await expect(drawer.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await expect(drawer.locator('.el-drawer__close-btn')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Deactivate', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeVisible()
    release()
    await expect(page.getByText('Temporary consent failure', { exact: true })).toBeVisible()
    await expect(confirm).toBeEnabled()
    await expect(signature).toHaveValue('Alice Fixture')
    await expect(drawer.getByRole('checkbox')).toBeChecked()
    await confirm.click()
    await expect(drawer).not.toBeVisible()
    expect(state.writes).toHaveLength(2)
    expect(state.writes[1]).toEqual(state.writes[0])
    expect(state.patients[0].consentSigned).toBe(true)
    expect(state.errors).toEqual([])
  } finally { release() }
})

for (const [label, path] of [['Send Signing Email', '/api/patients/alpha/consent/send'], ['Send Initial Intake', '/api/patients/alpha/intake/send']]) {
  test(`${label} sends once and prevents another patient mutation while pending`, async ({ page }) => {
    let release
    const pending = new Promise(resolve => { release = resolve })
    const state = await openPatient(page, { signed: false, onSave: async route => {
      await pending
      await route.fulfill({ json: { sent: true, message: 'Fixture delivery complete' } })
      return true
    } })
    try {
      await page.locator('.edit-save-panel').getByRole('button', { name: 'Cancel', exact: true }).click()
      const send = page.getByRole('button', { name: label, exact: true })
      await send.evaluate(button => {
        button.click()
        button.click()
        Array.from(document.querySelectorAll('.patient-actions button')).find(action => action.textContent.trim() === 'Edit').click()
      })
      await expect.poll(() => state.writes.length).toBe(1)
      expect(state.writes[0]).toMatchObject({ method: 'POST', path })
      await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Deactivate', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Sign Consent', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Send Signing Email', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Send Initial Intake', exact: true })).toBeDisabled()
      await expect(page.locator('.edit-save-panel')).toHaveCount(0)
      release()
      await expect(page.getByText('Fixture delivery complete', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled()
      expect(state.writes).toHaveLength(1)
      expect(state.errors).toEqual([])
    } finally { release() }
  })
}

test('deactivation confirmation and request lock edits, then dismiss or failure unlocks the draft', async ({ page }) => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const state = await openPatient(page, { onSave: async (route, attempt) => {
    if (attempt !== 1) return false
    await pending
    await route.fulfill({ status: 503, json: { message: 'Temporary deactivation failure' } })
    return true
  } })
  try {
    await input(page, 'First Name').fill('Preserved draft')
    const deactivate = page.getByRole('button', { name: 'Deactivate', exact: true })
    const save = page.getByRole('button', { name: 'Save Changes', exact: true })
    await deactivate.evaluate(button => {
      button.click()
      button.click()
      document.querySelector('.edit-save-panel button').click()
    })
    await expect(page.locator('.el-message-box:visible')).toHaveCount(1)
    await expect(save).toBeDisabled()
    await expect(input(page, 'First Name')).toBeDisabled()
    expect(state.writes).toEqual([])
    await page.locator('.el-message-box').getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(save).toBeEnabled()
    await expect(deactivate).toBeEnabled()
    await expect(input(page, 'First Name')).toHaveValue('Preserved draft')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await deactivate.click()
    await page.locator('.el-message-box').getByRole('button', { name: 'OK', exact: true }).click()
    await expect.poll(() => state.writes.length).toBe(1)
    await expect(save).toBeDisabled()
    await expect(deactivate).toBeDisabled()
    await expect(page.locator('.edit-save-panel').getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    release()
    await expect(page.getByText('Temporary deactivation failure', { exact: true })).toBeVisible()
    await expect(save).toBeEnabled()
    await expect(deactivate).toBeEnabled()
    await expect(input(page, 'First Name')).toHaveValue('Preserved draft')
    await deactivate.click()
    await page.locator('.el-message-box').getByRole('button', { name: 'OK', exact: true }).click()
    await expect(page).toHaveURL(/\/patients$/)
    expect(state.writes).toHaveLength(2)
    expect(state.writes.every(write => write.method === 'PATCH' && write.path === '/api/patients/alpha/delete')).toBe(true)
    expect(state.errors).toEqual([])
  } finally { release() }
})
