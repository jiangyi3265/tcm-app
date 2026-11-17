import { test, expect } from '@playwright/test'

const date = '2026-11-17'
const start = time => `${date} ${time}:00`

async function fixture(page, { dripEnabled = true, dripMinutes = 240, onWrite, multipleServices = false } = {}) {
  await page.clock.setFixedTime(new Date('2026-11-17T08:00:00-05:00'))
  const user = { id: 'doctor', name: 'Fixture Doctor', roles: ['admin', 'practitioner'], isActive: true,
    serviceKeys: ['followup', 'brief'], dripEnabled, workingHours: { tuesday: [{ start: '09:00', end: '17:00' }] } }
  const users = multipleServices ? [user, { ...user, id: 'other-doctor', name: 'Other Fixture Doctor' }] : [user]
  const patient = { id: 'patient', name: 'Fixture Patient', isActive: true, emails: ['fixture@example.invalid'] }
  const appointment = { id: 'existing', patientId: patient.id, practitionerId: user.id, roomId: 'room',
    serviceType: 'followup', status: 'booked', startTime: start('10:30'), endTime: start('11:30') }
  const settings = { currency: 'CAD', publicBookingDripMinutes: dripMinutes, publicBookingDripWindowDays: 7,
    serviceTypes: { followup: { label: 'Fixture follow-up', duration: 60, roomRequired: true, requiredTag: 'acupuncture' } },
    priceLists: [], rooms: [{ id: 'room', name: 'Fixture Room', isActive: true, supportTags: ['acupuncture'] }] }
  if (multipleServices) settings.serviceTypes.brief = { label: 'Brief fixture service', duration: 30 }
  const reads = [], writes = [], errors = []
  let holdAvailability = false, releaseAvailability
  let availabilityGate = Promise.resolve()
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({ user, patient, appointment }) => {
    localStorage.clear()
    localStorage.setItem('tcm_token', 'fixture-token')
    localStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
    localStorage.setItem('tcm_users', JSON.stringify([user]))
    localStorage.setItem('tcm_patients', JSON.stringify([patient]))
    localStorage.setItem('tcm_appointments', JSON.stringify([appointment]))
    localStorage.setItem('tcm_lang', 'en')
  }, { user, patient, appointment })
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    const method = request.method()
    if (method !== 'GET') writes.push({ path, method, body: request.postDataJSON() })
    if (method !== 'GET' && onWrite) return onWrite(route)
    if (path.startsWith('/api/public-booking')) throw new Error('Staff must never use public drip availability')
    let body = []
    if (path === '/api/users') body = users
    else if (path === '/api/patients') body = [patient]
    else if (path === '/api/settings') body = settings
    else if (path === '/api/settings/stripe' || path === '/api/ai/status') body = {}
    else if (path === '/api/appointments') body = method === 'GET' ? [appointment] : { id: 'created', ...request.postDataJSON() }
    else if (path === '/api/appointments/existing') body = { ...appointment, ...request.postDataJSON() }
    else if (path === '/api/appointments/availability') {
      reads.push(Object.fromEntries(url.searchParams))
      if (holdAvailability) await availabilityGate
      const day = url.searchParams.get('date')
      const duration = settings.serviceTypes[url.searchParams.get('serviceType')]?.duration || 60
      const practitionerId = url.searchParams.get('practitionerId') || user.id
      body = { duration, slotStepMinutes: 10, slots: ['10:00', '10:30', '14:00'].map(time => ({
        startTime: `${day} ${time}:00`, endTime: `${day} ${new Date(Date.parse(`2000-01-01T${time}:00Z`) + duration * 60000).toISOString().slice(11, 19)}`,
        assignedPractitionerId: practitionerId, availablePractitionerIds: [practitionerId], roomId: 'room',
      })) }
    }
    await route.fulfill({ json: body })
  })
  await page.goto('/appointments')
  await expect(page.locator('.appt-block').filter({ hasText: 'Fixture Patient' })).toBeVisible()
  return { reads, writes, errors, hold() { holdAvailability = true; availabilityGate = new Promise(resolve => { releaseAvailability = resolve }) },
    release() { holdAvailability = false; releaseAvailability?.() } }
}

async function openCreate(page) {
  await page.getByRole('button', { name: 'New Appointment', exact: true }).click()
  const drawer = page.locator('.el-drawer').filter({ hasText: 'New Appointment' })
  await expect(drawer.locator('.availability-card')).toHaveCount(3)
  await drawer.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: /^Patient$/ }) }).getByRole('combobox').click()
  await page.getByRole('option', { name: /Fixture Patient/ }).click()
  return drawer
}

async function changeDate(page, drawer, value) {
  const input = drawer.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: /^Date$/ }) }).locator('input')
  await input.fill(value)
  await input.press('Enter')
}

async function openEdit(page) {
  await page.locator('.appt-block').filter({ hasText: 'Fixture Patient' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const drawer = page.locator('.el-drawer').filter({ hasText: 'Edit Appointment' })
  await expect(drawer.locator('.availability-card')).toHaveCount(3)
  return drawer
}

for (const dripEnabled of [true, false]) {
  for (const time of ['10:00', '14:00']) {
    test(`staff can select and save ${time} with drip ${dripEnabled ? 'enabled at 240 minutes' : 'disabled'}`, async ({ page }) => {
      const state = await fixture(page, { dripEnabled })
      const drawer = await openEdit(page)
      await drawer.locator('.availability-card').filter({ hasText: `${time} -` }).click()
      await drawer.getByRole('button', { name: 'Save Changes', exact: true }).click()
      await expect.poll(() => state.writes.length).toBe(1)
      expect(state.writes[0]).toMatchObject({ method: 'PUT', path: '/api/appointments/existing', body: { startTime: start(time), practitionerId: 'doctor', serviceType: 'followup' } })
      expect(state.reads.at(-1)).toMatchObject({ excludeId: 'existing', serviceType: 'followup', practitionerId: 'doctor' })
      expect(state.errors).toEqual([])
    })
  }
}

test('staff cannot save a stale time while loading availability for a changed date', async ({ page }) => {
  const state = await fixture(page)
  const drawer = await openEdit(page)
  state.hold()
  const dateInput = drawer.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: /^Date$/ }) }).locator('input')
  await dateInput.fill('2026-11-18')
  await dateInput.press('Enter')
  await expect.poll(() => state.reads.at(-1)?.date).toBe('2026-11-18')
  await expect(drawer.getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
  expect(state.writes).toEqual([])
  state.release()
  await expect(drawer.locator('.availability-card')).toHaveCount(3)
  await drawer.locator('.availability-card').filter({ hasText: '14:00 -' }).click()
  await drawer.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0].body.startTime).toBe('2026-11-18 14:00:00')
  expect(state.errors).toEqual([])
})

test('a failed availability refresh clears old times and prevents saving', async ({ page }) => {
  const state = await fixture(page)
  const drawer = await openEdit(page)
  await page.route('**/api/appointments/availability**', route => route.fulfill({ status: 503, json: { message: 'Availability temporarily unavailable' } }))
  const dateInput = drawer.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: /^Date$/ }) }).locator('input')
  await dateInput.fill('2026-11-18')
  await dateInput.press('Enter')
  await expect(page.getByText('Availability temporarily unavailable', { exact: true })).toBeVisible()
  await expect(drawer.locator('.availability-card')).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
  expect(state.writes).toEqual([])
  expect(state.errors).toEqual([])
})

for (const mode of ['create', 'edit']) {
  test(`${mode} submits once while its response is pending and can retry a failed save`, async ({ page }) => {
    let release
    const responseGate = new Promise(resolve => { release = resolve })
    let attempt = 0
    const state = await fixture(page, { onWrite: async route => {
      attempt++
      if (attempt === 1) {
        await responseGate
        return route.fulfill({ status: 503, json: { message: 'Fixture save failure' } })
      }
      return route.fulfill({ json: { ...route.request().postDataJSON(), id: mode === 'edit' ? 'existing' : 'created' } })
    } })
    const drawer = mode === 'edit' ? await openEdit(page) : await openCreate(page)
    const save = drawer.getByRole('button', { name: mode === 'edit' ? 'Save Changes' : 'Confirm Appointment', exact: true })
    await drawer.locator('.availability-card').filter({ hasText: '14:00 -' }).click()
    // Dispatch two same-tick clicks so the application must guard itself, even
    // before the browser has painted a loading/disabled button.
    await save.evaluate(button => { button.click(); button.click() })
    await expect.poll(() => state.writes.length).toBe(1)
    await expect(save).toBeDisabled()
    await expect(drawer.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await expect(drawer.getByPlaceholder('Special notes', { exact: true })).toBeDisabled()
    await expect(drawer.locator('.availability-card').first()).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeVisible()
    release()
    await expect(page.getByText('Fixture save failure', { exact: true })).toBeVisible()
    await expect(save).toBeEnabled()
    await expect(drawer.locator('.availability-card.active')).toContainText('14:00')
    await save.click()
    await expect.poll(() => state.writes.length).toBe(2)
    expect(state.writes[0].body).toMatchObject({ patientId: 'patient', startTime: start('14:00') })
    expect(state.writes[1].body).toMatchObject({ patientId: 'patient', startTime: start('14:00') })
    await expect(drawer).not.toBeVisible()
    expect(state.errors).toEqual([])
  })
}

test('clearing a date during availability loading clears the loading state and ignores its response', async ({ page }) => {
  const state = await fixture(page)
  const drawer = await openEdit(page)
  state.hold()
  await changeDate(page, drawer, '2026-11-18')
  await expect.poll(() => state.reads.at(-1)?.date).toBe('2026-11-18')
  await changeDate(page, drawer, '')
  await expect(drawer.locator('.availability-empty')).not.toHaveText('Loading...')
  state.release()
  await expect(drawer.locator('.availability-card')).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
  await changeDate(page, drawer, '2026-11-19')
  await expect(drawer.locator('.availability-card')).toHaveCount(3)
  await expect(drawer.getByRole('button', { name: 'Save Changes', exact: true })).toBeEnabled()
  expect(state.writes).toEqual([])
  expect(state.errors).toEqual([])
})

test('a response from a closed edit drawer cannot replace a newly opened creation', async ({ page }) => {
  const state = await fixture(page)
  const edit = await openEdit(page)
  let oldRequest, release
  const oldGate = new Promise(resolve => { release = resolve })
  await page.route('**/api/appointments/availability**', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('date') !== '2026-11-18') return route.fallback()
    oldRequest = true
    await oldGate
    return route.fulfill({ json: { duration: 60, slots: [{ startTime: '2026-11-18 16:00:00', endTime: '2026-11-18 17:00:00', assignedPractitionerId: 'doctor' }] } })
  })
  await changeDate(page, edit, '2026-11-18')
  await expect.poll(() => oldRequest).toBe(true)
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(edit).not.toBeVisible()
  const create = await openCreate(page)
  release()
  await page.waitForLoadState('networkidle')
  await expect(create.locator('.availability-card')).toHaveCount(3)
  await expect(create).not.toContainText('16:00 - 17:00')
  expect(state.writes).toEqual([])
  expect(state.errors).toEqual([])
})

test('switching service and practitioner ignores the earlier service availability response', async ({ page }) => {
  const state = await fixture(page, { multipleServices: true })
  const drawer = await openEdit(page)
  let pending, release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/api/appointments/availability**', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('serviceType') !== 'brief' || url.searchParams.get('practitionerId') !== 'doctor') return route.fallback()
    pending = true
    await gate
    return route.fulfill({ json: { duration: 30, slots: [{ startTime: start('16:00'), endTime: start('16:30'), assignedPractitionerId: 'doctor' }] } })
  })
  await drawer.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: /^Service Type$/ }) }).locator('.el-select__wrapper').click()
  await page.getByRole('option', { name: 'Brief fixture service (30min)', exact: true }).click()
  await expect.poll(() => pending).toBe(true)
  await expect(drawer.getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled()
  await drawer.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: /^Practitioner$/ }) }).locator('.el-select__wrapper').click()
  await page.getByRole('option', { name: 'Other Fixture Doctor', exact: true }).click()
  await expect(drawer.locator('.availability-card')).toHaveCount(3)
  release()
  await page.waitForLoadState('networkidle')
  await expect(drawer).not.toContainText('16:00 - 16:30')
  await drawer.locator('.availability-card').filter({ hasText: '14:00 - 14:30' }).click()
  await drawer.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0].body).toMatchObject({ practitionerId: 'other-doctor', serviceType: 'brief', startTime: start('14:00'), endTime: start('14:30') })
  expect(state.errors).toEqual([])
})

async function beginQuickPatient(drawer) {
  await drawer.getByRole('button', { name: '新建', exact: true }).click()
  await drawer.getByPlaceholder('姓 Last name', { exact: true }).fill('Newfamily')
  await drawer.getByPlaceholder('名 First name', { exact: true }).fill('Newperson')
  await drawer.getByPlaceholder('邮箱', { exact: true }).fill('new-patient@example.invalid')
}

test('quick patient creation is single-submit and locks the appointment until the new patient is selected', async ({ page }) => {
  let release
  const patientResponse = new Promise(resolve => { release = resolve })
  const state = await fixture(page, { onWrite: async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/patients') {
      await patientResponse
      return route.fulfill({ json: { ...route.request().postDataJSON(), id: 'quick-patient', isActive: true } })
    }
    return route.fulfill({ json: { ...route.request().postDataJSON(), id: 'created' } })
  } })
  // Deliberately keep an old patient selected before starting quick creation.
  const drawer = await openCreate(page)
  await beginQuickPatient(drawer)
  const createPatient = drawer.getByRole('button', { name: '创建并选择', exact: true })
  await createPatient.evaluate(button => { button.click(); button.click() })
  await expect.poll(() => state.writes.filter(write => write.path === '/api/patients').length).toBe(1)
  await expect(createPatient).toBeDisabled()
  await expect(drawer.getByRole('button', { name: '取消', exact: true })).toBeDisabled()
  await expect(drawer.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await expect(drawer.locator('.el-drawer__close-btn')).toHaveCount(0)
  for (const placeholder of ['姓 Last name', '名 First name', '邮箱', 'Special notes']) {
    await expect(drawer.getByPlaceholder(placeholder, { exact: true })).toBeDisabled()
  }
  await expect(drawer.locator('.availability-card').first()).toBeDisabled()
  const save = drawer.getByRole('button', { name: 'Confirm Appointment', exact: true })
  await expect(save).toBeDisabled()
  await save.evaluate(button => button.click())
  await page.keyboard.press('Escape')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByPlaceholder('姓 Last name', { exact: true })).toBeVisible()
  expect(state.writes.filter(write => write.path.startsWith('/api/appointments'))).toEqual([])
  release()
  await expect(drawer.getByPlaceholder('姓 Last name', { exact: true })).not.toBeVisible()
  await expect(drawer).toContainText('Newfamily Newperson (new-patient@example.invalid)')
  await expect(save).toBeEnabled()
  await save.click()
  await expect.poll(() => state.writes.filter(write => write.path === '/api/appointments').length).toBe(1)
  expect(state.writes.find(write => write.path === '/api/appointments').body.patientId).toBe('quick-patient')
  expect(state.writes.filter(write => write.path === '/api/patients')).toHaveLength(1)
  await expect(drawer).not.toBeVisible()
  const edit = await openEdit(page)
  await expect(edit).toContainText('Fixture Patient (fixture@example.invalid)')
  await expect(edit).not.toContainText('Newfamily Newperson')
  expect(state.errors).toEqual([])
})

test('quick patient failure retains entered details and permits a safe retry before booking', async ({ page }) => {
  let attempts = 0
  const state = await fixture(page, { onWrite: async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/patients') {
      attempts++
      if (attempts === 1) return route.fulfill({ status: 503, json: { message: 'Fixture patient creation failure' } })
      return route.fulfill({ json: { ...route.request().postDataJSON(), id: 'quick-patient', isActive: true } })
    }
    return route.fulfill({ json: { ...route.request().postDataJSON(), id: 'created' } })
  } })
  const drawer = await openCreate(page)
  await beginQuickPatient(drawer)
  await drawer.getByRole('button', { name: '创建并选择', exact: true }).click()
  await expect(page.getByText('Fixture patient creation failure', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '创建并选择', exact: true })).toBeEnabled()
  await expect(drawer.getByRole('button', { name: '取消', exact: true })).toBeEnabled()
  await expect(drawer.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled()
  await expect(drawer.getByPlaceholder('姓 Last name', { exact: true })).toHaveValue('Newfamily')
  await expect(drawer.getByPlaceholder('名 First name', { exact: true })).toHaveValue('Newperson')
  await expect(drawer.getByPlaceholder('邮箱', { exact: true })).toHaveValue('new-patient@example.invalid')
  await expect(drawer.getByPlaceholder('邮箱', { exact: true })).toBeEnabled()
  await expect(drawer.getByRole('button', { name: 'Confirm Appointment', exact: true })).toBeDisabled()
  expect(state.writes.filter(write => write.path.startsWith('/api/appointments'))).toEqual([])
  await drawer.getByRole('button', { name: '创建并选择', exact: true }).click()
  await expect(drawer).toContainText('Newfamily Newperson (new-patient@example.invalid)')
  await drawer.getByRole('button', { name: 'Confirm Appointment', exact: true }).click()
  await expect.poll(() => state.writes.filter(write => write.path === '/api/appointments').length).toBe(1)
  const patients = state.writes.filter(write => write.path === '/api/patients')
  expect(patients).toHaveLength(2)
  expect(patients[1].body).toMatchObject({ firstName: 'Newperson', lastName: 'Newfamily', emails: ['new-patient@example.invalid'] })
  expect(state.writes.find(write => write.path === '/api/appointments').body.patientId).toBe('quick-patient')
  expect(state.errors).toEqual([])
})

test('quick patient editing prevents booking the previously selected patient until cancelled', async ({ page }) => {
  const state = await fixture(page)
  const drawer = await openCreate(page)
  const save = drawer.getByRole('button', { name: 'Confirm Appointment', exact: true })
  await expect(save).toBeEnabled()
  await beginQuickPatient(drawer)
  await expect(save).toBeDisabled()
  await save.evaluate(button => button.click())
  expect(state.writes).toEqual([])
  await drawer.getByRole('button', { name: '取消', exact: true }).click()
  await expect(drawer.getByPlaceholder('姓 Last name', { exact: true })).not.toBeVisible()
  await expect(drawer).toContainText('Fixture Patient (fixture@example.invalid)')
  await expect(save).toBeEnabled()
  await save.click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0]).toMatchObject({ path: '/api/appointments', body: { patientId: 'patient' } })
  expect(state.errors).toEqual([])
})
