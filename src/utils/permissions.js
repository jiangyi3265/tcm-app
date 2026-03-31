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

export function canAccessPatientRecords(roleOrRoles, userId, patient, consultations) {
  const userRoles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles]
  if (userRoles.includes('admin')) return true
  if (!patient || !userId) return false
  if (patient.practitionerId === userId) return true

  if (userRoles.includes('pharmacist')) {
    const hasPending = consultations.some(
      (consultation) => consultation.patientId === patient.id && consultation.status === 'paid' && !consultation.deletedAt,
    )
    if (hasPending) return true
  }

  if (userRoles.includes('cashier')) {
    const hasCompleted = consultations.some(
      (consultation) => consultation.patientId === patient.id
        && (consultation.status === 'completed' || consultation.status === 'paid')
        && !consultation.deletedAt,
    )
    if (hasCompleted) return true
  }

  const now = Date.now()
  return consultations.some((consultation) => {
    if (consultation.patientId !== patient.id || consultation.deletedAt) return false
    if (consultation.practitionerId === userId && consultation.status !== 'completed' && consultation.status !== 'paid') {
      return true
    }
    if (!consultation.date) return true
    const consultDate = new Date(consultation.date).getTime()
    if (Number.isNaN(consultDate)) return true
    return now - consultDate <= 7 * 24 * 60 * 60 * 1000
  })
}

export function isAccessExpired(dateStr) {
  if (!dateStr) return false
  const date = new Date(dateStr)
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  return date < oneWeekAgo
}
