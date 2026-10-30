const normalizeId = (value) => String(value ?? '').trim()
const normalizeName = (value) => String(value ?? '').trim().replace(/\s+/gu, ' ').toLowerCase()

export function staffPatientLinkedIds(patient) {
  return [patient?.linkedUserId, patient?.staffUserId, patient?.userId, patient?.staffMeta?.userId]
    .map(normalizeId).filter(Boolean)
}

export function isLinkedStaffPatient(patient, userId) {
  const target = normalizeId(userId)
  const ids = staffPatientLinkedIds(patient)
  return Boolean(target && patient && !patient.deletedAt && !patient.mergedInto
    && ids.length && ids.every((id) => id === target))
}

// Only reuse an unlinked, unambiguous profile with both the same name and email.
export function findStaffPatientByIdentity(patients, user) {
  const email = normalizeId(user?.email).toLowerCase()
  const name = normalizeName(user?.name)
  if (!email || !name) return null
  const matches = (patients || []).filter((patient) => {
    if (!patient || patient.deletedAt || patient.mergedInto || patient.isActive === false
      || patient.isActive === 0 || staffPatientLinkedIds(patient).length) return false
    const first = normalizeName(patient.firstName)
    const last = normalizeName(patient.lastName)
    const sameName = first && last
      ? name === `${first} ${last}` || name === `${last} ${first}`
      : name === normalizeName(patient.name)
    const emails = [patient.email, ...(Array.isArray(patient.emails) ? patient.emails : [])]
    return sameName && emails.some((value) => normalizeId(value).toLowerCase() === email)
  })
  return matches.length === 1 ? matches[0] : null
}
