import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia } from 'pinia'

// Load the actual store with Vite's normal extension resolution, then replace
// only its API boundary. These tests never contact a server.
let server, useAppointmentsStore, appointmentsApi, storage
before(async () => {
  server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  })
  ;({ useAppointmentsStore } = await server.ssrLoadModule('/src/stores/appointments.js'))
  ;({ appointmentsApi } = await server.ssrLoadModule('/src/utils/api.js'))
})
after(async () => { await server?.close() })
beforeEach(() => {
  storage = new Map()
  globalThis.sessionStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  }
  for (const key of ['list', 'create', 'update', 'status']) {
    appointmentsApi[key] = async () => { throw new Error(`Unexpected API call: ${key}`) }
  }
})

const existing = { id: 'existing', patientId: 'synthetic-patient', serviceType: 'followup', status: 'booked', startTime: '2026-11-17 10:00:00', endTime: '2026-11-17 11:00:00' }
const serverOnly = { ...existing, id: 'server-only', startTime: '2026-11-17 14:00:00' }
function setup() {
  sessionStorage.setItem('tcm_appointments', JSON.stringify([existing]))
  return useAppointmentsStore(createPinia())
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function persisted() { return JSON.parse(storage.get('tcm_appointments')) }

for (const operation of ['create', 'update', 'cancel', 'confirm', 'complete', 'time-block']) {
  test(`a delayed initial list preserves a successful ${operation} and loads other server appointments`, async () => {
    const store = setup()
    const pending = deferred()
    appointmentsApi.list = () => pending.promise
    const refresh = store.refreshFromApi()
    let saved
    if (operation === 'create' || operation === 'time-block') {
      appointmentsApi.create = async data => ({ ...data, id: 'new-record' })
      saved = operation === 'create'
        ? await store.createAppointment({ ...existing, startTime: '2026-11-17 15:00:00' })
        : await store.createTimeBlock({ practitionerId: 'doctor', startTime: '2026-11-17 15:00:00', endTime: '2026-11-17 16:00:00' })
    } else if (operation === 'update') {
      appointmentsApi.update = async (id, changes) => ({ ...existing, ...changes, id })
      saved = await store.updateAppointment(existing.id, { startTime: '2026-11-17 11:00:00', notes: 'Saved edit' })
    } else {
      appointmentsApi.status = async (id, status) => ({ ...existing, id, status })
      saved = await store[`${operation}Appointment`](existing.id)
    }
    pending.resolve([existing, serverOnly])
    await refresh
    assert.deepEqual({ ...store.getAppointment(saved.id) }, { ...saved })
    assert.deepEqual({ ...store.getAppointment(serverOnly.id) }, serverOnly)
    assert.deepEqual(persisted().find(record => record.id === saved.id), { ...saved })
    assert.equal(store.appointments.filter(record => record.id === saved.id).length, 1)
  })
}

test('a subsequent list can replace or remove records saved before that list started', async () => {
  const store = setup()
  appointmentsApi.update = async (id, changes) => ({ ...existing, ...changes, id })
  await store.updateAppointment(existing.id, { notes: 'local edit' })
  appointmentsApi.list = async () => [{ ...existing, notes: 'newer server edit' }, serverOnly]
  await store.refreshFromApi()
  assert.equal(store.getAppointment(existing.id).notes, 'newer server edit')
  appointmentsApi.list = async () => [serverOnly]
  await store.refreshFromApi()
  assert.equal(store.getAppointment(existing.id), null)
  assert.deepEqual(persisted(), [serverOnly])
})

test('an older overlapping list cannot replace a newer completed list', async () => {
  const store = setup()
  const old = deferred(), newer = deferred()
  appointmentsApi.list = () => old.promise
  const firstRead = store.refreshFromApi()
  appointmentsApi.list = () => newer.promise
  const secondRead = store.refreshFromApi()
  newer.resolve([{ ...existing, status: 'confirmed' }, serverOnly])
  await secondRead
  old.resolve([existing])
  await firstRead
  assert.equal(store.getAppointment(existing.id).status, 'confirmed')
  assert.deepEqual({ ...store.getAppointment(serverOnly.id) }, serverOnly)
  assert.equal(persisted().find(record => record.id === existing.id).status, 'confirmed')
})

test('a failed list does not clear the cache and a later refresh can recover', async () => {
  const store = setup()
  appointmentsApi.list = async () => { throw new Error('Temporary list failure') }
  await assert.rejects(store.refreshFromApi(), /Temporary list failure/)
  assert.deepEqual({ ...store.getAppointment(existing.id) }, existing)
  assert.deepEqual(persisted(), [existing])
  appointmentsApi.list = async () => [existing, serverOnly]
  await store.refreshFromApi()
  assert.equal(store.appointments.length, 2)
})

test('overlapping reads and repeated edits keep the last saved record until the next fresh list', async () => {
  const store = setup()
  const old = deferred(), newer = deferred()
  appointmentsApi.update = async (id, changes) => ({ ...existing, ...changes, id })
  appointmentsApi.list = () => old.promise
  const firstRead = store.refreshFromApi()
  await store.updateAppointment(existing.id, { notes: 'first saved edit' })
  appointmentsApi.list = () => newer.promise
  const secondRead = store.refreshFromApi()
  await store.updateAppointment(existing.id, { notes: 'second saved edit' })
  await store.updateAppointment(existing.id, { notes: 'third saved edit' })
  newer.resolve([{ ...existing, notes: 'first saved edit' }, serverOnly])
  await secondRead
  old.resolve([existing])
  await firstRead
  assert.equal(store.getAppointment(existing.id).notes, 'third saved edit')
  assert.equal(store.appointments.length, 2)
  appointmentsApi.list = async () => [{ ...existing, notes: 'later server edit' }]
  await store.refreshFromApi()
  assert.equal(store.getAppointment(existing.id).notes, 'later server edit')
  assert.equal(store.getAppointment(serverOnly.id), null)
})

test('multiple successful mutations during one refresh are all preserved without hiding server-only records', async () => {
  const store = setup()
  const pending = deferred()
  appointmentsApi.list = () => pending.promise
  const read = store.refreshFromApi()
  appointmentsApi.create = async data => ({ ...data, id: 'new-record' })
  appointmentsApi.status = async (id, status) => ({ ...existing, id, status })
  await store.createAppointment(existing)
  await store.cancelAppointment(existing.id)
  pending.resolve([existing, serverOnly])
  await read
  assert.deepEqual(store.appointments.map(record => record.id).sort(), ['existing', 'new-record', 'server-only'])
  assert.equal(store.getAppointment(existing.id).status, 'cancelled')
  assert.equal(store.getAppointment('new-record').status, 'booked')
  assert.deepEqual(persisted().map(record => record.id).sort(), ['existing', 'new-record', 'server-only'])
})
