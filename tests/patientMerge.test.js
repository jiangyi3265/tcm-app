import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia } from 'pinia'

let server, usePatientsStore, useConsultationsStore, useAppointmentsStore, api, records, calls, store, pinia
const keep = { id: 'keep', name: 'Keep Patient', isActive: true, gender: '' }
const source = { id: 'source', name: 'Source Patient', isActive: true, gender: '' }
before(async () => {
  server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null } })
  ;({ usePatientsStore } = await server.ssrLoadModule('/src/stores/patients.js'))
  ;({ useConsultationsStore } = await server.ssrLoadModule('/src/stores/consultations.js'))
  ;({ useAppointmentsStore } = await server.ssrLoadModule('/src/stores/appointments.js'))
  api = await server.ssrLoadModule('/src/utils/api.js')
})
after(async () => { await server?.close() })
beforeEach(() => {
  const storage = new Map()
  globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) }
  records = [keep, source]
  sessionStorage.setItem('tcm_patients', JSON.stringify(records))
  calls = { post: 0, patients: 0, consultations: 0, appointments: 0 }
  api.patientsApi.merge = async () => { calls.post++; records = [keep, { ...source, isActive: false, mergedInto: 'keep' }]; return { ok: true } }
  api.patientsApi.list = async () => { calls.patients++; return records }
  api.consultationsApi.list = async () => { calls.consultations++; return [] }
  api.appointmentsApi.list = async () => { calls.appointments++; return [] }
  pinia = createPinia()
  store = usePatientsStore(pinia)
})
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }

test('merge is synchronous single-submit and a confirmed success refreshes all record types', async () => {
  const pending = deferred()
  api.patientsApi.merge = async (keepId, mergeId) => {
    calls.post++
    assert.deepEqual([keepId, mergeId], ['keep', 'source'])
    await pending.promise
    records = [keep, { ...source, isActive: false, mergedInto: keepId }]
    return { ok: true }
  }
  const first = store.mergePatients('keep', 'source')
  assert.equal(store.mergeState.phase, 'submitting')
  assert.equal(await store.mergePatients('other', 'source'), false)
  pending.resolve()
  assert.equal(await first, true)
  assert.deepEqual(calls, { post: 1, patients: 1, consultations: 1, appointments: 1 })
  assert.equal(store.mergeState, null)
  assert.equal(store.getPatient('source').isActive, false)
})

for (const resource of ['patients', 'consultations', 'appointments']) {
  test(`confirmed merge survives a failed ${resource} refresh and recovery only reads`, async () => {
    const boundary = api[`${resource}Api`]
    const healthy = boundary.list
    boundary.list = async () => { calls[resource]++; throw new Error('Fixture refresh failure') }
    assert.equal(await store.mergePatients('keep', 'source'), true)
    assert.deepEqual(calls, { post: 1, patients: 1, consultations: 1, appointments: 1 })
    assert.equal(store.mergeState.outcome, 'confirmed')
    assert.equal(store.mergeState.phase, 'refresh-required')
    assert.equal(store.getPatient('source').isActive, false)
    assert.equal(usePatientsStore(pinia).mergeState.phase, 'refresh-required')
    assert.equal(await store.mergePatients('keep', 'source'), false)
    boundary.list = healthy
    assert.deepEqual(await store.retryMergeRefresh(), { refreshed: true, confirmed: true })
    assert.deepEqual(calls, { post: 1, patients: 2, consultations: 2, appointments: 2 })
    assert.equal(store.mergeState, null)
  })
}

test('a failed POST stays unconfirmed and blocks another merge until all reads recover', async () => {
  api.patientsApi.merge = async () => { calls.post++; throw new Error('Fixture connection lost') }
  await assert.rejects(store.mergePatients('keep', 'source'), /connection lost/)
  assert.deepEqual(calls, { post: 1, patients: 0, consultations: 0, appointments: 0 })
  assert.equal(store.getPatient('source').isActive, true)
  assert.equal(store.mergeState.outcome, 'unknown')
  assert.equal(await store.mergePatients('keep', 'source'), false)
  const healthy = api.appointmentsApi.list
  api.appointmentsApi.list = async () => { calls.appointments++; throw new Error('Read still unavailable') }
  assert.deepEqual(await store.retryMergeRefresh(), { refreshed: false, confirmed: false })
  assert.equal(store.mergeState.phase, 'refresh-required')
  api.appointmentsApi.list = healthy
  assert.deepEqual(await store.retryMergeRefresh(), { refreshed: true, confirmed: false })
  assert.equal(store.mergeState, null)
  assert.deepEqual(calls, { post: 1, patients: 2, consultations: 2, appointments: 2 })
})

test('unconfirmed POST can be verified as committed by subsequent reads without another POST', async () => {
  api.patientsApi.merge = async () => {
    calls.post++
    records = [keep, { ...source, isActive: false, mergedInto: 'keep' }]
    throw new Error('Fixture response lost after commit')
  }
  await assert.rejects(store.mergePatients('keep', 'source'), /response lost/)
  assert.equal(store.getPatient('source').isActive, true)
  assert.deepEqual(await store.retryMergeRefresh(), { refreshed: true, confirmed: true })
  assert.equal(calls.post, 1)
  assert.equal(store.getPatient('source').isActive, false)
})

test('a delayed pre-merge list cannot reactivate a confirmed source after a fresh read fails', async () => {
  const old = deferred()
  api.patientsApi.list = () => old.promise
  const oldRead = store.refreshFromApi()
  const rejectedOld = assert.rejects(oldRead, /Fresh read unavailable/)
  api.patientsApi.list = async () => { throw new Error('Fresh read unavailable') }
  assert.equal(await store.mergePatients('keep', 'source'), true)
  old.resolve([keep, source])
  await rejectedOld
  assert.equal(store.getPatient('source').isActive, false)
  assert.equal(store.getPatient('source').mergedInto, 'keep')
  assert.equal(store.mergeState.outcome, 'confirmed')
})

test('an absent success confirmation never marks the source as merged', async () => {
  api.patientsApi.merge = async () => { calls.post++; return {} }
  await assert.rejects(store.mergePatients('keep', 'source'), /confirmation was not received/)
  assert.equal(store.getPatient('source').isActive, true)
  assert.equal(store.mergeState.outcome, 'unknown')
  assert.equal(calls.patients, 0)
})

for (const kind of ['list', 'detail']) {
  test(`a delayed pre-merge consultation ${kind} cannot restore the source patient`, async () => {
    const previous = { id: 'consultation', patientId: 'source' }
    sessionStorage.setItem('tcm_consultations', JSON.stringify([previous]))
    const consultations = useConsultationsStore(pinia), pending = deferred()
    api.consultationsApi.list = () => pending.promise
    api.consultationsApi.get = () => pending.promise
    const oldRead = kind === 'list' ? consultations.refreshFromApi() : consultations.refreshConsultationFromApi(previous.id)
    api.consultationsApi.list = async () => [{ ...previous, patientId: 'keep' }]
    assert.equal(await store.mergePatients('keep', 'source'), true)
    assert.equal(consultations.getConsultation(previous.id).patientId, 'keep')
    pending.resolve(kind === 'list' ? [previous] : previous)
    await oldRead
    assert.equal(consultations.getConsultation(previous.id).patientId, 'keep')
    assert.equal(store.mergeState, null)
  })
}

for (const resource of ['consultations', 'appointments']) {
  test(`a merge ${resource} read superseded by a failed newer read keeps recovery required`, async () => {
    const current = resource === 'consultations' ? useConsultationsStore(pinia) : useAppointmentsStore(pinia)
    const pending = deferred()
    api[`${resource}Api`].list = () => pending.promise
    const merge = store.mergePatients('keep', 'source')
    await new Promise(resolve => setImmediate(resolve))
    api[`${resource}Api`].list = async () => { throw new Error('Newer read failed') }
    await assert.rejects(current.refreshFromApi(), /Newer read failed/)
    pending.resolve([])
    assert.equal(await merge, true)
    assert.equal(store.mergeState.phase, 'refresh-required')
    assert.equal(store.mergeState.outcome, 'confirmed')
    assert.equal(calls.post, 1)
  })
}

test('a pre-merge consultation detail propagates the newer failed list instead of returning stale data', async () => {
  const previous = { id: 'consultation', patientId: 'source' }, pending = deferred()
  sessionStorage.setItem('tcm_consultations', JSON.stringify([previous]))
  const consultations = useConsultationsStore(pinia)
  api.consultationsApi.get = () => pending.promise
  const oldRead = consultations.refreshConsultationFromApi(previous.id)
  const oldFailure = assert.rejects(oldRead, /Latest consultation list failed/)
  api.consultationsApi.list = async () => { throw new Error('Latest consultation list failed') }
  assert.equal(await store.mergePatients('keep', 'source'), true)
  pending.resolve(previous)
  await oldFailure
  assert.equal(store.mergeState.phase, 'refresh-required')
})

test('a consultation refresh interrupted by a local save reads again before clearing merge recovery', async () => {
  const previous = { id: 'consultation', patientId: 'source' }, other = { id: 'other', patientId: 'keep' }
  sessionStorage.setItem('tcm_consultations', JSON.stringify([previous, other]))
  const consultations = useConsultationsStore(pinia), pending = deferred()
  let readCount = 0
  api.consultationsApi.list = async () => {
    readCount++
    if (readCount === 1) return pending.promise
    return [{ ...previous, patientId: 'keep' }, { ...other, chiefComplaint: 'Saved edit' }]
  }
  api.consultationsApi.update = async () => ({ ...other, chiefComplaint: 'Saved edit' })
  const merge = store.mergePatients('keep', 'source')
  await new Promise(resolve => setImmediate(resolve))
  await consultations.updateConsultation('other', { chiefComplaint: 'Saved edit' })
  pending.resolve([{ ...previous, patientId: 'keep' }, other])
  assert.equal(await merge, true)
  assert.equal(readCount, 2)
  assert.equal(consultations.getConsultation('consultation').patientId, 'keep')
  assert.equal(consultations.getConsultation('other').chiefComplaint, 'Saved edit')
  assert.equal(store.mergeState, null)
})

test('continued consultation writes stop automatic rereads after one extra read', async () => {
  const consultations = useConsultationsStore(pinia), first = deferred(), second = deferred()
  let readCount = 0
  api.consultationsApi.list = () => { readCount++; return readCount === 1 ? first.promise : second.promise }
  api.consultationsApi.update = async (id, changes) => ({ id, patientId: 'keep', ...changes })
  const merge = store.mergePatients('keep', 'source')
  await new Promise(resolve => setImmediate(resolve))
  await consultations.updateConsultation('other', { chiefComplaint: 'First edit' })
  first.resolve([])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(readCount, 2)
  await consultations.updateConsultation('other', { chiefComplaint: 'Second edit' })
  second.resolve([])
  assert.equal(await merge, true)
  assert.equal(readCount, 2)
  assert.equal(consultations.getConsultation('other').chiefComplaint, 'Second edit')
  assert.equal(store.mergeState.phase, 'refresh-required')
})
