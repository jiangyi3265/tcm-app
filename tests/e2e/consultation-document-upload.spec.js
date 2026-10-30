import { test, expect } from '@playwright/test'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7l8AAAAASUVORK5CYII=', 'base64')

async function openDocuments(page, { existing = true, uploadStatus = 200, uploadGate = null, initialFiles = [], listHandler = null, deleteStatus = 200, additionalConsultations = [] } = {}) {
  const user = { id: 'doctor', name: 'QA Doctor', roles: ['admin', 'practitioner'], isActive: true }
  const patient = { id: 'patient', name: 'QA Patient', firstName: 'QA', lastName: 'Patient', isActive: true }
  const consultation = {
    id: 'draft', patientId: patient.id, practitionerId: user.id, date: '2026-10-30',
    status: 'draft', chiefComplaint: 'Fixture complaint', documents: [], prescriptions: [], services: [],
  }
  const uploaded = [], errors = [], files = initialFiles.map(file => ({ ...file })), deleted = []
  let listRequests = 0
  page.on('pageerror', error => errors.push(error.message))
  const consultations = [...(existing ? [consultation] : []), ...additionalConsultations]
  await page.addInitScript(({ user, patient, consultations }) => {
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_patients', JSON.stringify([patient]))
    localStorage.setItem('tcm_consultations', JSON.stringify(consultations))
    localStorage.setItem('tcm_appointments', '[]')
    localStorage.setItem('tcm_lang', 'en')
  }, { user, patient, consultations })
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path === '/api/files/upload') {
      const body = request.postDataBuffer().toString('latin1')
      uploaded.push({ body, contentType: request.headers()['content-type'] })
      if (uploadGate) await uploadGate
      const status = Array.isArray(uploadStatus) ? uploadStatus[uploaded.length - 1] : uploadStatus
      if (status !== 200) {
        return route.fulfill({ status, json: { message: 'Upload temporarily unavailable' } })
      }
      const fileName = body.match(/filename="([^"]+)"/)?.[1]
      const file = {
        id: files.length + 1, patientId: patient.id, consultationId: existing ? consultation.id : null,
        fileType: 'document', fileName, filePath: `hospital-private/QA/Consultation/2026/${fileName}`,
        uploadTime: '2026-10-30T10:00:00', fileSize: png.length,
      }
      files.push(file)
      return route.fulfill({ json: { ...file, resource: file.filePath, url: `/api/files/signed-preview?fixture=${file.id}` } })
    }
    if (request.method() === 'DELETE' && path.startsWith('/api/files/')) {
      deleted.push(path)
      const status = Array.isArray(deleteStatus) ? deleteStatus[deleted.length - 1] : deleteStatus
      if (status !== 200) return route.fulfill({ status, json: { message: 'Document deletion temporarily unavailable' } })
      const index = files.findIndex(file => path === `/api/files/${file.id}`)
      if (index >= 0) files.splice(index, 1)
      return route.fulfill({ json: {} })
    }
    let body = []
    if (path === '/api/users') body = [user]
    else if (path === '/api/patients') body = [patient]
    else if (path === '/api/patients/patient') body = patient
    else if (path === '/api/consultations') body = consultations
    else if (consultations.some(record => path === `/api/consultations/${record.id}`)) body = consultations.find(record => path === `/api/consultations/${record.id}`)
    else if (path === '/api/files/consultation/draft') {
      const snapshot = files.map(file => ({ ...file }))
      const handled = listHandler && await listHandler({ route, count: ++listRequests, snapshot, uploaded })
      if (handled) return
      body = snapshot
    }
    else if (path === '/api/settings') body = { currency: 'CAD', serviceTypes: {}, priceLists: [], rooms: [], taxRate: 0.13 }
    else if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    await route.fulfill({ json: body })
  })
  await page.goto(`/patients/patient/consultations/${existing ? 'draft' : 'new'}`)
  await page.getByRole('tab', { name: 'Documents', exact: true }).click()
  const input = page.locator('#pane-documents input[type="file"]')
  await expect(input).toBeAttached()
  return { input, uploaded, errors, deleted }
}

for (const existing of [true, false]) {
  test(`a PNG document uploads for ${existing ? 'an existing draft' : 'a new consultation'}`, async ({ page }) => {
    const { input, uploaded, errors } = await openDocuments(page, { existing })
    await input.setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: png })
    await expect(page.locator('#pane-documents .el-table__row')).toHaveCount(1)
    await expect(page.locator('#pane-documents')).toContainText('scan.png')
    expect(uploaded).toHaveLength(1)
    expect(uploaded[0].contentType).toMatch(/^multipart\/form-data; boundary=/)
    expect(uploaded[0].body).toContain('name="patientId"\r\n\r\npatient')
    expect(uploaded[0].body).toContain('name="fileType"\r\n\r\ndocument')
    expect(uploaded[0].body.includes('name="consultationId"')).toBe(existing)
    expect(errors).toEqual([])
  })
}

test('a server upload failure is visible and does not add a phantom document', async ({ page }) => {
  const { input, uploaded, errors } = await openDocuments(page, { uploadStatus: 503 })
  await input.setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByText('Upload temporarily unavailable', { exact: true })).toBeVisible()
  await expect(page.locator('#pane-documents .el-table__row')).toHaveCount(0)
  expect(uploaded).toHaveLength(1)
  expect(errors).toEqual([])
})

test('a document over the stated 5 MB limit is rejected before upload', async ({ page }) => {
  const { input, uploaded, errors } = await openDocuments(page)
  await input.setInputFiles({ name: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })
  await expect(page.getByText('File must be less than 5MB', { exact: true })).toBeVisible()
  expect(uploaded).toEqual([])
  expect(errors).toEqual([])
})

test('a slow upload shows progress, prevents duplicates and eventually displays the document', async ({ page }) => {
  let release
  const uploadGate = new Promise(resolve => { release = resolve })
  const { input, uploaded, errors } = await openDocuments(page, { uploadGate })
  try {
    await input.setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: png })
    await expect.poll(() => uploaded.length).toBe(1)
    await expect(page.locator('#pane-documents button').filter({ hasText: 'Uploading file…' })).toBeDisabled()
    await expect(input).toBeDisabled()
    await expect(page.locator('#pane-documents .el-table__row')).toHaveCount(0)
    // Even a second change event before the first request finishes must not create a second upload.
    await input.setInputFiles({ name: 'another.png', mimeType: 'image/png', buffer: png })
    expect(uploaded).toHaveLength(1)
  } finally {
    release()
  }
  await expect(page.locator('#pane-documents .el-table__row')).toHaveCount(1)
  await expect(page.locator('#pane-documents button').filter({ hasText: 'Upload File' })).toBeEnabled()
  expect(uploaded).toHaveLength(1)
  expect(errors).toEqual([])
})

test('a failed upload releases the control so the user can retry the same image', async ({ page }) => {
  const { input, uploaded, errors } = await openDocuments(page, { uploadStatus: [503, 200] })
  const image = { name: 'scan.png', mimeType: 'image/png', buffer: png }
  await input.setInputFiles(image)
  await expect(page.getByText('Upload temporarily unavailable', { exact: true })).toBeVisible()
  await expect(page.locator('#pane-documents button').filter({ hasText: 'Upload File' })).toBeEnabled()
  await input.setInputFiles(image)
  await expect(page.locator('#pane-documents .el-table__row')).toHaveCount(1)
  expect(uploaded).toHaveLength(2)
  expect(errors).toEqual([])
})

test('an uploaded image on a new consultation keeps its server ID when removed', async ({ page }) => {
  const { input, deleted, errors } = await openDocuments(page, { existing: false })
  await input.setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: png })
  await expect(page.locator('#pane-documents .el-table__row')).toHaveCount(1)
  await page.locator('#pane-documents').getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click()
  await expect(page.locator('#pane-documents .el-table__row')).toHaveCount(0)
  expect(deleted).toEqual(['/api/files/1'])
  expect(errors).toEqual([])
})

const existingServerDocument = {
  id: 11, patientId: 'patient', consultationId: 'draft', fileType: 'document', fileName: 'existing.pdf',
  filePath: 'hospital-private/QA/Consultation/2026/existing.pdf', fileSize: 20, uploadTime: '2026-10-30T09:00:00',
}

test('an existing server document issues DELETE and disappears after success', async ({ page }) => {
  const { deleted, errors } = await openDocuments(page, { initialFiles: [existingServerDocument] })
  const rows = page.locator('#pane-documents .el-table__row')
  await expect(rows).toHaveCount(1)
  await rows.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click()
  await expect(rows).toHaveCount(0)
  expect(deleted).toEqual(['/api/files/11'])
  expect(errors).toEqual([])
})

test('failed deletion keeps the document, reports the error and allows retry without false success', async ({ page }) => {
  const { deleted, errors } = await openDocuments(page, { initialFiles: [existingServerDocument], deleteStatus: [503, 200] })
  const rows = page.locator('#pane-documents .el-table__row')
  await expect(rows).toHaveCount(1)
  await rows.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click()
  await expect(page.getByText('Document deletion temporarily unavailable', { exact: true })).toBeVisible()
  await expect(page.locator('.el-message--success')).toHaveCount(0)
  await expect(rows).toHaveCount(1)
  expect(deleted).toEqual(['/api/files/11'])
  await rows.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click()
  await expect(rows).toHaveCount(0)
  expect(deleted).toEqual(['/api/files/11', '/api/files/11'])
  expect(errors).toEqual([])
})

test('a refresh failure after successful upload preserves earlier documents and the new upload', async ({ page }) => {
  const { input, uploaded, errors } = await openDocuments(page, {
    initialFiles: [existingServerDocument],
    listHandler: async ({ route, uploaded }) => {
      if (!uploaded.length) return false
      await route.fulfill({ status: 503, json: { message: 'Document list temporarily unavailable' } })
      return true
    },
  })
  const rows = page.locator('#pane-documents .el-table__row')
  await expect(rows).toHaveCount(1)
  await input.setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByText('File uploaded', { exact: true })).toBeVisible()
  await expect(rows).toHaveCount(2)
  await expect(page.locator('#pane-documents')).toContainText('existing.pdf')
  await expect(page.locator('#pane-documents')).toContainText('scan.png')
  expect(uploaded).toHaveLength(1)
  expect(errors).toEqual([])
})

test('an older document list response cannot restore a file deleted by a newer request', async ({ page }) => {
  let release
  const delayed = new Promise(resolve => { release = resolve })
  try {
    const { deleted, errors } = await openDocuments(page, {
      initialFiles: [existingServerDocument],
      listHandler: async ({ route, count, snapshot }) => {
        if (count !== 1) return false
        await delayed
        await route.fulfill({ json: snapshot })
        return true
      },
    })
    const rows = page.locator('#pane-documents .el-table__row')
    await expect(rows).toHaveCount(1)
    await rows.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true }).click()
    await expect(rows).toHaveCount(0)
    expect(deleted).toEqual(['/api/files/11'])
    const late = page.waitForResponse(response => response.url().includes('/api/files/consultation/draft'))
    release()
    await late
    await page.waitForLoadState('networkidle')
    await expect(rows).toHaveCount(0)
    expect(errors).toEqual([])
  } finally { release() }
})

test('navigating to another consultation with a failed document list cannot display or delete the previous files', async ({ page }) => {
  const nextConsultation = {
    id: 'next-draft', patientId: 'patient', practitionerId: 'doctor', date: '2026-10-29',
    status: 'draft', chiefComplaint: 'Separate fixture visit', documents: [], prescriptions: [], services: [],
  }
  const { deleted, errors } = await openDocuments(page, {
    initialFiles: [existingServerDocument], additionalConsultations: [nextConsultation],
  })
  await expect(page.locator('#pane-documents')).toContainText('existing.pdf')
  let nextListRequests = 0
  await page.route('**/api/files/consultation/next-draft', async route => {
    nextListRequests++
    await route.fulfill({ status: 503, json: { message: 'Document list temporarily unavailable' } })
  })
  // Follow real router controls, so this checks the keyed RouterView remount rather than a full reload.
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(/\/patients\/patient$/)
  await page.locator('.timeline-consult').filter({ hasText: nextConsultation.chiefComplaint }).click()
  await expect(page).toHaveURL(/\/consultations\/next-draft$/)
  await page.getByRole('tab', { name: 'Documents', exact: true }).click()
  await expect.poll(() => nextListRequests).toBeGreaterThan(0)
  await page.waitForLoadState('networkidle')
  await expect(page.locator('#pane-documents .el-table__row')).toHaveCount(0)
  await expect(page.locator('#pane-documents')).not.toContainText('existing.pdf')
  await expect(page.locator('#pane-documents').getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
  expect(deleted).toEqual([])
  expect(errors).toEqual([])
})
