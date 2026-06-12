export const DEFAULT_CLINIC_NAME = 'OTCM Acupuncture Clinic'

export function resolveClinicName(value) {
  const text = String(value || '').trim()
  if (!text || text === 'TCM Clinic' || text === 'TCM Clinic Management System') {
    return DEFAULT_CLINIC_NAME
  }
  return text
}
