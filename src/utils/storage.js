export const CLINIC_CACHE_KEYS = [
  'tcm_users',
  'tcm_patients',
  'tcm_appointments',
  'tcm_consultations',
  'tcm_inventory',
  'tcm_branches',
  'tcm_settings',
  'tcm_email_log',
  'tcm_formulas',
  'tcm_suppliers',
  'tcm_acupoints',
  'tcm_unit_conversions',
  'tcm_herb_dict',
  'tcm_meridians',
  'tcm_templates',
  'tcm_copy_consult',
]

const SESSION_KEYS = new Set(CLINIC_CACHE_KEYS)

function getBrowserStorage(name) {
  try {
    return typeof globalThis !== 'undefined' ? globalThis[name] || null : null
  } catch {
    return null
  }
}

function storageFor(key) {
  return SESSION_KEYS.has(key) ? getBrowserStorage('sessionStorage') : getBrowserStorage('localStorage')
}

function isQuotaExceeded(error) {
  const name = String(error?.name || '')
  const message = String(error?.message || '')
  return name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || message.toLowerCase().includes('quota')
}

function safeRemove(storage, key) {
  try {
    storage?.removeItem(key)
  } catch {
    // Storage cleanup should never block app rendering.
  }
}

function clearClinicCacheExcept(exceptKey = '') {
  CLINIC_CACHE_KEYS.forEach((key) => {
    if (key !== exceptKey) removeStoredKey(key)
  })
}

function safeSetItem(storage, key, value) {
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch (error) {
    if (isQuotaExceeded(error)) {
      clearClinicCacheExcept(key)
      try {
        storage.setItem(key, value)
        return true
      } catch {
        safeRemove(storage, key)
        return false
      }
    }
    console.warn(`Failed to write cache key ${key}:`, error)
    return false
  }
}

function safeGetItem(storage, key) {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function getStoredItem(key) {
  const primary = storageFor(key)
  const existing = safeGetItem(primary, key)
  if (existing !== null) return existing

  if (SESSION_KEYS.has(key)) {
    const local = getBrowserStorage('localStorage')
    const legacy = safeGetItem(local, key)
    if (legacy !== null) {
      if (safeSetItem(primary, key, legacy)) {
        safeRemove(local, key)
      }
      return legacy
    }
  }

  return null
}

export function writeStoredItem(key, value) {
  const target = storageFor(key)
  const written = safeSetItem(target, key, String(value ?? ''))
  const session = getBrowserStorage('sessionStorage')
  const local = getBrowserStorage('localStorage')
  if (SESSION_KEYS.has(key) && written) {
    safeRemove(local, key)
  } else if (!SESSION_KEYS.has(key) && written) {
    safeRemove(session, key)
  }
  return written
}

export function readStoredJson(key, fallback = null) {
  const raw = getStoredItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeStoredJson(key, value) {
  try {
    return writeStoredItem(key, JSON.stringify(value))
  } catch {
    return false
  }
}

export function removeStoredKey(key) {
  safeRemove(getBrowserStorage('localStorage'), key)
  safeRemove(getBrowserStorage('sessionStorage'), key)
}

export function clearClinicCache() {
  CLINIC_CACHE_KEYS.forEach(removeStoredKey)
}
