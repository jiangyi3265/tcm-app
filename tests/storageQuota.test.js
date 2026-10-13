import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getStoredItem,
  writeStoredItem,
  writeStoredJson,
} from '../src/utils/storage.js'

class MemoryStorage {
  constructor(options = {}) {
    this.map = new Map()
    if (typeof options === 'function') {
      this.shouldFailSet = options
      this.shouldFailGet = () => false
      this.shouldFailRemove = () => false
      return
    }
    this.shouldFailSet = options.shouldFailSet || (() => false)
    this.shouldFailGet = options.shouldFailGet || (() => false)
    this.shouldFailRemove = options.shouldFailRemove || (() => false)
  }

  getItem(key) {
    if (this.shouldFailGet(key)) {
      throw new Error('Storage read blocked')
    }
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
    if (this.shouldFailRemove(key)) {
      throw new Error('Storage remove blocked')
    }
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

test('clinic cache read falls back when session storage read is blocked', () => {
  const sessionStorage = new MemoryStorage({ shouldFailGet: (key) => key === 'tcm_patients' })
  const localStorage = new MemoryStorage()
  installStorage({ sessionStorage, localStorage })
  localStorage.setItem('tcm_patients', '[{"id":"legacy-patient"}]')

  assert.equal(getStoredItem('tcm_patients'), '[{"id":"legacy-patient"}]')
})

test('plain preference storage read and write do not throw when local storage is blocked', () => {
  const localStorage = new MemoryStorage({
    shouldFailGet: (key) => key === 'tcm_lang',
    shouldFailSet: (key) => key === 'tcm_lang',
  })
  installStorage({ sessionStorage: new MemoryStorage(), localStorage })

  assert.equal(getStoredItem('tcm_lang'), null)
  assert.equal(writeStoredItem('tcm_lang', 'en'), false)
})


test('login survives cache eviction and reload but is cleared with the tab session', () => {
  const localStorage = new MemoryStorage()
  const sessionStorage = new MemoryStorage()
  installStorage({ sessionStorage, localStorage })
  localStorage.setItem('tcm_token', 'legacy-token')
  assert.equal(getStoredItem('tcm_token'), 'legacy-token')
  assert.equal(localStorage.getItem('tcm_token'), null)
  assert.equal(writeStoredJson('tcm_auth', { currentUser: { id: 'qa' } }), true)
  assert.equal(localStorage.getItem('tcm_auth'), null)
  assert.equal(getStoredItem('tcm_token'), 'legacy-token')
  installStorage({ sessionStorage: new MemoryStorage(), localStorage })
  assert.equal(getStoredItem('tcm_token'), null)
  assert.equal(getStoredItem('tcm_auth'), null)
})
