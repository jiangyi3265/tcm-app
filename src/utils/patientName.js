const patientNameCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

function patientNameKey(patient) {
  const structuredName = [patient?.lastName, patient?.firstName]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
  return structuredName || String(patient?.name || '').trim()
}

export function comparePatientNames(a, b) {
  const nameCompare = patientNameCollator.compare(patientNameKey(a), patientNameKey(b))
  if (nameCompare !== 0) return nameCompare
  return String(a?.id || '').localeCompare(String(b?.id || ''))
}

export function sortPatientsByName(list, order = 'ascending') {
  const direction = order === 'descending' ? -1 : 1
  return [...list].sort((a, b) => direction * comparePatientNames(a, b))
}

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
