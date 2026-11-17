import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia } from 'pinia'

let server, usePatientsStore, patientsApi, storage
before(async () => {
  server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null } })
  ;({ usePatientsStore } = await server.ssrLoadModule('/src/stores/patients.js'))
  ;({ patientsApi } = await server.ssrLoadModule('/src/utils/api.js'))
})
after(async () => { await server?.close() })
beforeEach(() => {
  storage = new Map()
  globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) }
  for (const key of ['list', 'create', 'update', 'softDelete', 'restore', 'hardDelete', 'signConsent', 'merge']) {
    patientsApi[key] = async () => { throw new Error(`Unexpected API call: ${key}`) }
  }
})
const alice = { id: 'alice', name: 'Family Alice', firstName: 'Alice', lastName: 'Family',
  emails: ['family@example.invalid'], gender: '', isActive: true }
const bob = { ...alice, id: 'bob', name: 'Family Bob', firstName: 'Bob' }
function setup(records = [alice]) {
  sessionStorage.setItem('tcm_patients', JSON.stringify(records))
  return usePatientsStore(createPinia())
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function persisted() { return JSON.parse(storage.get('tcm_patients')) }

test('a late initial list preserves a created family member and loads other patients', async () => {
  const store = setup(), pending = deferred()
  patientsApi.list = () => pending.promise
  const read = store.refreshFromApi()
  patientsApi.create = async data => ({ ...data, id: 'new-patient' })
  const created = await store.addPatient({ firstName: 'Carol', lastName: 'Family', emails: alice.emails })
  pending.resolve([alice, bob])
  await read
  assert.deepEqual({ ...store.getPatient(created.id) }, { ...created })
  assert.deepEqual(store.patients.map(patient => patient.id).sort(), ['alice', 'bob', 'new-patient'])
  assert.equal(persisted().find(patient => patient.id === created.id).name, 'Family Carol')
})

test('a delayed update resolves its patient by ID after a refresh reorders the list', async () => {
  const store = setup([alice, bob]), pending = deferred()
  patientsApi.update = () => pending.promise
  const save = store.updatePatient('alice', { firstName: 'Updated Alice' })
  patientsApi.list = async () => [bob, alice]
  await store.refreshFromApi()
  pending.resolve({ ...alice, firstName: 'Updated Alice', name: 'Family Updated Alice' })
  await save
  assert.deepEqual({ ...store.getPatient('bob') }, bob)
  assert.equal(store.getPatient('alice').name, 'Family Updated Alice')
  assert.equal(store.patients.filter(patient => patient.id === 'alice').length, 1)
  assert.equal(persisted().filter(patient => patient.id === 'bob').length, 1)
})

test('a create response upserts the same ID already returned by an intervening list', async () => {
  const store = setup(), pending = deferred()
  patientsApi.create = () => pending.promise
  const save = store.addPatient({ firstName: 'Bob', lastName: 'Family', emails: alice.emails })
  patientsApi.list = async () => [alice, bob]
  await store.refreshFromApi()
  pending.resolve(bob)
  await save
  assert.deepEqual(store.patients.map(patient => patient.id).sort(), ['alice', 'bob'])
})

for (const operation of ['update', 'delete', 'restore', 'consent', 'physical-delete']) {
  test(`a late list cannot undo a successful patient ${operation}`, async () => {
    const initial = operation === 'restore' ? { ...alice, deletedAt: '2026-11-16', isActive: false } : alice
    const store = setup([initial]), pending = deferred()
    patientsApi.list = () => pending.promise
    const read = store.refreshFromApi()
    let changed
    if (operation === 'update') {
      changed = { ...alice, name: 'Family Updated Alice', firstName: 'Updated Alice' }
      patientsApi.update = async () => changed
      await store.updatePatient('alice', { firstName: 'Updated Alice' })
    } else if (operation === 'delete') {
      changed = { ...alice, deletedAt: '2026-11-17', isActive: false }
      patientsApi.softDelete = async () => changed
      await store.deletePatient('alice')
    } else if (operation === 'restore') {
      changed = { ...alice, deletedAt: null }
      patientsApi.restore = async () => changed
      await store.restorePatient('alice')
    } else if (operation === 'consent') {
      changed = { ...alice, consentSigned: true }
      patientsApi.signConsent = async () => changed
      await store.signConsent('alice')
    } else {
      patientsApi.hardDelete = async () => ({ deleted: true })
      await store.physicalDeletePatient('alice')
    }
    pending.resolve([initial, bob])
    await read
    assert.deepEqual(store.getPatient('alice') ? { ...store.getPatient('alice') } : null, changed || null)
    assert.deepEqual({ ...store.getPatient('bob') }, bob)
    assert.deepEqual(persisted().find(patient => patient.id === 'alice') || null, changed || null)
  })
}

test('a newer list stays authoritative and later reads can accept server edits and removals', async () => {
  const store = setup(), old = deferred()
  patientsApi.list = () => old.promise
  const oldRead = store.refreshFromApi()
  patientsApi.list = async () => [bob, { ...alice, notes: 'Newer server snapshot' }]
  await store.refreshFromApi()
  old.resolve([alice])
  await oldRead
  assert.equal(store.getPatient('alice').notes, 'Newer server snapshot')
  assert.deepEqual({ ...store.getPatient('bob') }, bob)
  patientsApi.update = async () => ({ ...alice, notes: 'Saved local edit' })
  await store.updatePatient('alice', { notes: 'Saved local edit' })
  patientsApi.list = async () => [bob]
  await store.refreshFromApi()
  assert.equal(store.getPatient('alice'), null)
})

test('failed reads and writes preserve cached patients and allow retry', async () => {
  const store = setup([alice, bob])
  patientsApi.list = async () => { throw new Error('List failure') }
  await assert.rejects(store.refreshFromApi(), /List failure/)
  patientsApi.hardDelete = async () => { throw new Error('Delete failure') }
  await assert.rejects(store.physicalDeletePatient('alice'), /Delete failure/)
  assert.deepEqual(persisted(), [alice, bob])
  patientsApi.list = async () => [bob, alice]
  await store.refreshFromApi()
  assert.deepEqual({ ...store.getPatient('alice') }, alice)
})

test('staff profile lookup waits for the newer authoritative list instead of using stale cache', async () => {
  const store = setup([]), first = deferred(), second = deferred()
  const linked = { ...alice, staffUserId: 'staff', linkedUserId: 'staff', isStaffProfile: true }
  patientsApi.list = () => first.promise
  const lookup = store.ensureStaffPatient({ id: 'staff', name: alice.name, email: alice.emails[0] })
  patientsApi.list = () => second.promise
  const newerRead = store.refreshFromApi()
  first.resolve([])
  let settled = false
  lookup.finally(() => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false)
  second.resolve([linked, bob])
  assert.equal((await lookup).id, linked.id)
  await newerRead
  assert.deepEqual(store.patients.map(patient => patient.id).sort(), ['alice', 'bob'])
})

test('both overlapping reads preserve writes performed after they started', async () => {
  const store = setup(), first = deferred(), second = deferred()
  patientsApi.list = () => first.promise
  const firstRead = store.refreshFromApi()
  patientsApi.list = () => second.promise
  const secondRead = store.refreshFromApi()
  patientsApi.hardDelete = async () => ({ deleted: true })
  await store.physicalDeletePatient('alice')
  first.resolve([alice, bob])
  assert.equal(store.getPatient('alice'), null)
  second.resolve([alice, bob])
  await Promise.all([firstRead, secondRead])
  assert.equal(store.getPatient('alice'), null)
  assert.deepEqual(persisted(), [bob])
})

test('a superseded staff lookup propagates the latest failure without automatically creating a patient', async () => {
  const store = setup([]), old = deferred(), newer = deferred()
  patientsApi.list = () => old.promise
  const lookup = store.ensureStaffPatient({ id: 'staff', name: alice.name, email: alice.emails[0] })
  const lookupFailure = assert.rejects(lookup, /Latest patient list failed/)
  patientsApi.list = () => newer.promise
  const newerRead = store.refreshFromApi()
  const newerFailure = assert.rejects(newerRead, /Latest patient list failed/)
  newer.reject(new Error('Latest patient list failed'))
  await newerFailure
  old.resolve([])
  await lookupFailure
  assert.deepEqual(store.patients, [])
})
