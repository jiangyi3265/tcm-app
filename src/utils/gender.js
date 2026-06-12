export const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Prefer not to say', label: 'Prefer not to say' },
]

export function normalizeGender(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const normalized = text.toLowerCase()

  if (['male', 'm', 'man', 'boy', '男', '男性'].includes(normalized)) return 'Male'
  if (['female', 'f', 'woman', 'girl', '女', '女性'].includes(normalized)) return 'Female'
  if (
    normalized === 'prefer not to say'
    || normalized === 'prefer-not-to-say'
    || normalized === 'prefer not say'
    || normalized === 'unknown'
    || normalized === 'undisclosed'
    || normalized === '不想说'
    || normalized === '不愿透露'
  ) {
    return 'Prefer not to say'
  }

  return text
}

export function formatGender(value, fallback = '-') {
  return normalizeGender(value) || fallback
}

export function getGenderTagType(value) {
  const gender = normalizeGender(value)
  if (gender === 'Male') return 'primary'
  if (gender === 'Female') return 'danger'
  if (gender === 'Prefer not to say') return 'info'
  return 'info'
}
