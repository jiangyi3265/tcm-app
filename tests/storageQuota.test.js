import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getStoredItem,
  writeStoredJson,
} from '../src/utils/storage.js'

class MemoryStorage {
  constructor(shouldFailSet = () => false) {
    this.map = new Map()
    this.shouldFailSet = shouldFailSet
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null
  }

  setItem(key, value) {
    if (this.shouldFailSet(key, value)) {
      const error = new Error('The quota has been exceeded.')
      error.name = 'QuotaExceededError'
      throw error
    }
    this.map.set(key, String(value))
  }

  removeItem(key) {
    this.map.delete(key)
  }
}

function installStorage({ sessionStorage, localStorage = new MemoryStorage() }) {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: sessionStorage,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorage,
  })
  return { sessionStorage, localStorage }
}

test('clinic cache write clears stale data and retries after quota errors', () => {
  let attempts = 0
  const sessionStorage = new MemoryStorage((key) => key === 'tcm_inventory' && attempts++ === 0)
  installStorage({ sessionStorage })
  sessionStorage.setItem('tcm_patients', '[{"id":"old"}]')

  assert.equal(writeStoredJson('tcm_inventory', [{ id: 'herb-1' }]), true)
  assert.deepEqual(JSON.parse(sessionStorage.getItem('tcm_inventory')), [{ id: 'herb-1' }])
  assert.equal(sessionStorage.getItem('tcm_patients'), null)
})

test('clinic cache write does not throw when Safari storage is exhausted', () => {
  const sessionStorage = new MemoryStorage((key) => key === 'tcm_inventory')
  installStorage({ sessionStorage })

  assert.equal(writeStoredJson('tcm_inventory', [{ id: 'herb-1' }]), false)
  assert.equal(sessionStorage.getItem('tcm_inventory'), null)
})

test('legacy local cache is kept when migration into session storage fails', () => {
  const sessionStorage = new MemoryStorage((key) => key === 'tcm_inventory')
  const localStorage = new MemoryStorage()
  installStorage({ sessionStorage, localStorage })
  localStorage.setItem('tcm_inventory', '[{"id":"legacy"}]')

  assert.equal(getStoredItem('tcm_inventory'), '[{"id":"legacy"}]')
  assert.equal(localStorage.getItem('tcm_inventory'), '[{"id":"legacy"}]')
})
