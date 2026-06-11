export function formatPatientName(patient, fallback = '-') {
  if (!patient) return fallback
  const first = String(patient.firstName || '').trim()
  const last = String(patient.lastName || '').trim()
  if (first || last) {
    return [first, last].filter(Boolean).join(' ')
  }

  const name = String(patient.name || '').trim()
  if (!name) return fallback
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return [...parts.slice(1), parts[0]].join(' ')
  }
  return name
}

export function formatPatientFirstName(patient, fallback = 'Patient') {
  if (!patient) return fallback
  const first = String(patient.firstName || '').trim()
  if (first) return first

  const name = String(patient.name || '').trim()
  if (!name) return fallback
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 1]
  return name
}

export function getPatientInitial(patient, fallback = 'P') {
  const name = formatPatientName(patient, '')
  return name ? name.charAt(0).toUpperCase() : fallback
}
