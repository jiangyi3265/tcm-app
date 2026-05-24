import { getActivePrescriptions, getPaymentStatus, getPrescriptionStatus } from './prescriptionWorkflow.js'
import { dayjs } from './dateUtils.js'

export const ROLES = {
  ADMIN: 'admin',
  PRACTITIONER: 'practitioner',
  APPRENTICE: 'apprentice',
  PHARMACIST: 'pharmacist',
  CASHIER: 'cashier',
}

export const ROLE_LABELS = {
  admin: 'Admin',
  practitioner: 'Practitioner',
  apprentice: 'Apprentice',
  pharmacist: 'Pharmacist',
  cashier: 'Cashier',
}

export const ROLE_COLORS = {
  admin: 'danger',
  practitioner: 'success',
  apprentice: 'info',
  pharmacist: 'warning',
  cashier: 'primary',
}

const RECENT_RECORD_WINDOW_MONTHS = 3
const APPOINTMENT_RECORD_SHARE_DAYS = 7

export const MENU_ACCESS = {
  admin: ['dashboard', 'patients', 'consultations', 'appointments', 'inventory', 'formulas', 'pharmacy', 'cashier', 'statistics', 'audit-logs', 'admin'],
  practitioner: ['dashboard', 'patients', 'consultations', 'appointments', 'inventory', 'formulas', 'statistics'],
  apprentice: ['dashboard', 'patients', 'consultations', 'appointments'],
  pharmacist: ['dashboard', 'pharmacy', 'inventory'],
  cashier: ['dashboard', 'cashier'],
}

export function hasPermission(roleOrRoles, permission) {
  const permissions = {
    'patient.view': ['admin', 'practitioner', 'apprentice'],
    'patient.create': ['admin', 'practitioner'],
    'patient.edit': ['admin', 'practitioner'],
    'patient.delete': ['admin'],
    'patient.merge': ['admin'],
    'consultation.view': ['admin', 'practitioner', 'apprentice'],
    'consultation.create': ['admin', 'practitioner'],
    'consultation.edit': ['admin', 'practitioner'],
    'consultation.delete': ['admin'],
    'consultation.viewClinical': ['admin', 'practitioner', 'apprentice'],
    'invoice.view': ['admin', 'practitioner', 'cashier'],
    'invoice.manage': ['admin', 'cashier'],
    'inventory.view': ['admin', 'practitioner', 'pharmacist'],
    'inventory.edit': ['admin'],
    'inventory.dispensing': ['admin', 'pharmacist'],
    'prescription.view': ['admin', 'practitioner', 'pharmacist'],
    'prescription.updateStatus': ['admin', 'pharmacist'],
    'appointment.view': ['admin', 'practitioner', 'apprentice'],
    'appointment.create': ['admin', 'practitioner'],
    'appointment.cancel': ['admin', 'practitioner'],
    'branches.view': ['admin', 'practitioner'],
    'branches.manage': ['admin'],
    'admin.users': ['admin'],
    'admin.settings': ['admin'],
    'admin.rooms': ['admin'],
    'admin.pricelist': ['admin'],
    'admin.branches': ['admin'],
  }

  const allowed = permissions[permission]
  if (!allowed) return false
  const userRoles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles]
  return userRoles.some((role) => allowed.includes(role))
}

export function canAccess(roleOrRoles, module) {
  const userRoles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles]
  const allAccess = new Set()
  userRoles.forEach((role) => {
    ;(MENU_ACCESS[role] || []).forEach((name) => allAccess.add(name))
  })
  return allAccess.has(module)
}

function normalizeRoles(roleOrRoles) {
  return (Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles]).filter(Boolean)
}

function parseDateValue(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const normalized = text.includes(' ') && !text.includes('T')
    ? text.replace(' ', 'T')
    : text
  let parsed = dayjs(normalized)
  if (parsed.isValid()) return parsed
  if (text.length >= 10) {
    parsed = dayjs(text.slice(0, 10))
    if (parsed.isValid()) return parsed
  }
  return null
}

function resolveActiveInternshipWindow(currentUser, now = dayjs()) {
  const internshipDates = Array.isArray(currentUser?.internshipDates)
    ? currentUser.internshipDates
    : []
  if (internshipDates.length === 0) return null

  const today = dayjs(now).startOf('day')
  let matchedWindow = null
  internshipDates.forEach((rawDate) => {
    const startDate = parseDateValue(rawDate)?.startOf('day')
    if (!startDate) return
    const endDate = startDate.add(2, 'day').endOf('day')
    if (today.isBefore(startDate) || today.isAfter(endDate)) return
    if (!matchedWindow || startDate.isAfter(matchedWindow.startDate)) {
      matchedWindow = { startDate, endDate }
    }
  })
  return matchedWindow
}

function isWithinInternshipWindow(value, window) {
  const date = parseDateValue(value)
  if (!date || !window) return false
  return !date.isBefore(window.startDate) && !date.isAfter(window.endDate)
}

function collectInternshipPatientIds(consultations = [], appointments = [], window) {
  const patientIds = new Set()
  consultations.forEach((consultation) => {
    if (!consultation || consultation.deletedAt || !consultation.patientId) return
    if (isWithinInternshipWindow(consultation.date, window)) {
      patientIds.add(consultation.patientId)
    }
  })
  appointments.forEach((appointment) => {
    if (!appointment || appointment.status === 'cancelled' || !appointment.patientId) return
    if (isWithinInternshipWindow(appointment.startTime, window)) {
      patientIds.add(appointment.patientId)
    }
  })
  return patientIds
}

export function filterAccessibleConsultations(roleOrRoles, consultations = [], options = {}) {
  const userRoles = normalizeRoles(roleOrRoles)
  const source = Array.isArray(consultations) ? consultations : []
  if (userRoles.includes('admin')) {
    return source.filter((consultation) => !consultation?.deletedAt)
  }

  const internshipWindow = resolveActiveInternshipWindow(options.currentUser, options.now)
  if (userRoles.includes('apprentice')) {
    if (!internshipWindow) return []

    return source.filter((consultation) =>
      consultation
      && !consultation.deletedAt
      && isWithinInternshipWindow(consultation.date, internshipWindow),
    )
  }

  if (!userRoles.includes('practitioner')) {
    return source.filter((consultation) => !consultation?.deletedAt)
  }

  const userId = normalizeId(options.currentUser?.id || options.userId)
  const patient = options.patient || null
  const appointments = Array.isArray(options.appointments) ? options.appointments : []
  return source.filter((consultation) => {
    if (!consultation || consultation.deletedAt) return false
    if (normalizeId(consultation.practitionerId) === userId) return true
    if (patient && normalizeId(patient.practitionerId) === userId) return true
    return isRecentConsultation(consultation.date, options.now)
      && hasActivePractitionerAppointment(consultation.patientId, appointments, userId, options.now)
  })
}

export function getAuthorizedServiceKeys(user) {
  const serviceKeys = Array.isArray(user?.serviceKeys) ? user.serviceKeys : []
  return [...new Set(serviceKeys.map((item) => String(item || '').trim()).filter(Boolean))]
}

export function canPractitionerProvideService(user, serviceKey) {
  if (!serviceKey) return true
  const serviceKeys = getAuthorizedServiceKeys(user)
  return serviceKeys.length === 0 || serviceKeys.includes(serviceKey)
}

export function canAccessPatientRecords(roleOrRoles, userId, patient, consultations = [], options = {}) {
  const userRoles = normalizeRoles(roleOrRoles)
  const appointments = Array.isArray(options.appointments) ? options.appointments : []
  const currentUser = options.currentUser || null
  if (userRoles.includes('admin')) return true
  if (!patient || !userId) return false
  const normalizedUserId = normalizeId(userId)

  if (userRoles.includes('apprentice')) {
    const internshipWindow = resolveActiveInternshipWindow(currentUser, options.now)
    if (!internshipWindow) return false
    return collectInternshipPatientIds(consultations, appointments, internshipWindow).has(patient.id)
  }

  if (userRoles.includes('practitioner')) {
    if (normalizeId(patient.practitionerId) === normalizedUserId) return true
    if (consultations.some((consultation) =>
      consultation.patientId === patient.id
      && !consultation.deletedAt
      && normalizeId(consultation.practitionerId) === normalizedUserId
    )) return true
    if (hasActivePractitionerAppointment(patient.id, appointments, normalizedUserId, options.now)) return true
  }

  if (userRoles.includes('pharmacist')) {
    const hasPending = consultations.some(
      (consultation) => consultation.patientId === patient.id
        && !consultation.deletedAt
        && (
          consultation.status === 'paid'
          || getPaymentStatus(consultation) === 'paid'
          || getActivePrescriptions(consultation).some((prescription) => {
            const status = getPrescriptionStatus(prescription)
            return status === 'editing' || status === 'pending' || status === 'dispensed'
          })
        ),
    )
    if (hasPending) return true
  }

  if (userRoles.includes('cashier')) {
    const hasCompleted = consultations.some(
      (consultation) => consultation.patientId === patient.id
        && (
          consultation.status === 'completed'
          || getPaymentStatus(consultation) !== 'unpaid'
          || getActivePrescriptions(consultation).some((prescription) => {
            const status = getPrescriptionStatus(prescription)
            return status === 'pending' || status === 'dispensed'
          })
        )
        && !consultation.deletedAt,
    )
    if (hasCompleted) return true
  }

  return false
}

function normalizeId(value) {
  return value === undefined || value === null ? '' : String(value)
}

function appointmentEndDate(appointment) {
  return parseDateValue(appointment?.endTime || appointment?.startTime)
}

function hasActivePractitionerAppointment(patientId, appointments = [], userId, nowValue) {
  const now = dayjs(nowValue || undefined).startOf('day')
  return appointments.some((appointment) => {
    if (!appointment || appointment.status === 'cancelled') return false
    if (appointment.patientId !== patientId) return false
    if (normalizeId(appointment.practitionerId) !== userId) return false
    const endDate = appointmentEndDate(appointment)
    if (!endDate) return false
    return !now.isAfter(endDate.add(APPOINTMENT_RECORD_SHARE_DAYS, 'day').endOf('day'))
  })
}

function isRecentConsultation(dateStr, nowValue) {
  const consultDate = parseDateValue(dateStr)
  if (!consultDate) return false
  const now = dayjs(nowValue || undefined)
  return !consultDate.isBefore(now.subtract(RECENT_RECORD_WINDOW_MONTHS, 'month').startOf('day'))
    && !consultDate.isAfter(now.add(1, 'day').endOf('day'))
}

export function isAccessExpired(dateStr, days = APPOINTMENT_RECORD_SHARE_DAYS) {
  if (!dateStr) return false
  const date = new Date(dateStr)
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - days)
  return date < oneWeekAgo
}
