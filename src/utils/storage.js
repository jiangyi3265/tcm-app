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
]

const SESSION_KEYS = new Set(CLINIC_CACHE_KEYS)

function storageFor(key) {
  return SESSION_KEYS.has(key) ? sessionStorage : localStorage
}

export function getStoredItem(key) {
  const primary = storageFor(key)
  const existing = primary.getItem(key)
  if (existing !== null) return existing

  if (SESSION_KEYS.has(key)) {
    const legacy = localStorage.getItem(key)
    if (legacy !== null) {
      primary.setItem(key, legacy)
      localStorage.removeItem(key)
      return legacy
    }
  }

  return null
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
  const target = storageFor(key)
  target.setItem(key, JSON.stringify(value))
  if (SESSION_KEYS.has(key)) {
    localStorage.removeItem(key)
  } else {
    sessionStorage.removeItem(key)
  }
}

export function removeStoredKey(key) {
  localStorage.removeItem(key)
  sessionStorage.removeItem(key)
}

export function clearClinicCache() {
  CLINIC_CACHE_KEYS.forEach(removeStoredKey)
}
