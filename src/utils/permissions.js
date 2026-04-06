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
  cashier: '',
}

const RECENT_RECORD_WINDOW_DAYS = 3

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
    'patient.merge': ['admin', 'practitioner'],
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
  if (!userRoles.includes('apprentice')) {
    return source.filter((consultation) => !consultation?.deletedAt)
  }

  const internshipWindow = resolveActiveInternshipWindow(options.currentUser, options.now)
  if (!internshipWindow) return []

  return source.filter((consultation) =>
    consultation
    && !consultation.deletedAt
    && isWithinInternshipWindow(consultation.date, internshipWindow),
  )
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

  if (userRoles.includes('apprentice')) {
    const internshipWindow = resolveActiveInternshipWindow(currentUser, options.now)
    if (!internshipWindow) return false
    return collectInternshipPatientIds(consultations, appointments, internshipWindow).has(patient.id)
  }

  if (patient.practitionerId === userId) return true

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

  const now = dayjs(options.now || undefined)
  return consultations.some((consultation) => {
    if (consultation.patientId !== patient.id || consultation.deletedAt) return false
    if (consultation.practitionerId === userId && consultation.status !== 'completed') {
      return true
    }
    if (!consultation.date) return true
    const consultDate = parseDateValue(consultation.date)
    if (!consultDate) return true
    return now.diff(consultDate, 'day', true) <= RECENT_RECORD_WINDOW_DAYS
  })
}

export function isAccessExpired(dateStr, days = RECENT_RECORD_WINDOW_DAYS) {
  if (!dateStr) return false
  const date = new Date(dateStr)
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - days)
  return date < oneWeekAgo
}
