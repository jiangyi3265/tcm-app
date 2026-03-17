// 角色权限定义
export const ROLES = {
  ADMIN: 'admin',
  PRACTITIONER: 'practitioner',
  APPRENTICE: 'apprentice',
  PHARMACIST: 'pharmacist',
  CASHIER: 'cashier',
}

export const ROLE_LABELS = {
  admin: '管理员',
  practitioner: '中医师',
  apprentice: '学徒',
  pharmacist: '药师',
  cashier: '收银',
}

export const ROLE_COLORS = {
  admin: 'danger',
  practitioner: 'success',
  apprentice: 'info',
  pharmacist: 'warning',
  cashier: '',
}

// 各角色可访问的导航菜单
export const MENU_ACCESS = {
  admin: ['dashboard', 'patients', 'appointments', 'inventory', 'formulas', 'pharmacy', 'cashier', 'statistics', 'audit-logs', 'admin'],
  practitioner: ['dashboard', 'patients', 'appointments', 'inventory', 'formulas', 'statistics'],
  apprentice: ['dashboard', 'patients', 'appointments'],
  pharmacist: ['dashboard', 'pharmacy', 'inventory'],
  cashier: ['dashboard', 'cashier'],
}

// 权限检查 — 支持单角色(string)或多角色(array)
export function hasPermission(roleOrRoles, permission) {
  const permissions = {
    // 病人档案
    'patient.view': ['admin', 'practitioner', 'apprentice'],
    'patient.create': ['admin', 'practitioner'],
    'patient.edit': ['admin', 'practitioner'],
    'patient.delete': ['admin'],
    'patient.merge': ['admin', 'practitioner'],

    // 诊疗记录
    'consultation.view': ['admin', 'practitioner', 'apprentice'],
    'consultation.create': ['admin', 'practitioner'],
    'consultation.edit': ['admin', 'practitioner'],
    'consultation.delete': ['admin'],
    'consultation.viewClinical': ['admin', 'practitioner', 'apprentice'],

    // 发票
    'invoice.view': ['admin', 'practitioner', 'cashier'],
    'invoice.manage': ['admin', 'cashier'],

    // 库存
    'inventory.view': ['admin', 'practitioner', 'pharmacist'],
    'inventory.edit': ['admin'],
    'inventory.dispensing': ['admin', 'pharmacist'],

    // 处方
    'prescription.view': ['admin', 'practitioner', 'pharmacist'],
    'prescription.updateStatus': ['admin', 'pharmacist'],

    // 预约
    'appointment.view': ['admin', 'practitioner', 'apprentice'],
    'appointment.create': ['admin', 'practitioner'],
    'appointment.cancel': ['admin', 'practitioner'],

    // 分店管理
    'branches.view': ['admin', 'practitioner'],
    'branches.manage': ['admin'],

    // 系统管理
    'admin.users': ['admin'],
    'admin.settings': ['admin'],
    'admin.rooms': ['admin'],
    'admin.pricelist': ['admin'],
    'admin.branches': ['admin'],
  }

  const allowed = permissions[permission]
  if (!allowed) return false
  const userRoles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles]
  return userRoles.some(r => allowed.includes(r))
}

export function canAccess(roleOrRoles, module) {
  const userRoles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles]
  // 合并所有角色的菜单权限
  const allAccess = new Set()
  userRoles.forEach(r => {
    ;(MENU_ACCESS[r] || []).forEach(m => allAccess.add(m))
  })
  return allAccess.has(module)
}

/**
 * Check if a non-primary practitioner/apprentice can still access a patient's records.
 * Rule: Non-primary practitioners lose access 1 week after their last consultation with the patient.
 * Admin always has access. Primary practitioner (patient.practitionerId) always has access.
 * @param {string} role - user role
 * @param {string} userId - current user ID
 * @param {object} patient - patient object
 * @param {array} consultations - all consultations for this patient
 * @returns {boolean}
 */
export function canAccessPatientRecords(roleOrRoles, userId, patient, consultations) {
  const userRoles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles]
  // Admin always has access
  if (userRoles.includes('admin')) return true
  // Primary practitioner always has access
  if (patient.practitionerId === userId) return true
  // Pharmacist: access patients with paid consultations (pending dispensing)
  if (userRoles.includes('pharmacist')) {
    const hasPending = consultations.some(c => c.patientId === patient.id && c.status === 'paid' && !c.deletedAt)
    if (hasPending) return true
  }
  // Cashier: access patients with completed or paid consultations
  if (userRoles.includes('cashier')) {
    const hasCompleted = consultations.some(c => c.patientId === patient.id && (c.status === 'completed' || c.status === 'paid') && !c.deletedAt)
    if (hasCompleted) return true
  }
  // For non-primary practitioners and apprentices: check 1-week expiry
  const userConsultations = consultations.filter(c => c.practitionerId === userId && !c.deletedAt)
  if (userConsultations.length === 0) {
    // No consultations - allow access for new patients (before first consultation)
    return true
  }
  const lastConsultDate = userConsultations.reduce((latest, c) => {
    const d = new Date(c.date)
    return d > latest ? d : latest
  }, new Date(0))
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  return lastConsultDate >= oneWeekAgo
}

/**
 * Check if data has expired the 1-week access window
 * @param {string} dateStr - ISO date string
 * @returns {boolean} true if expired
 */
export function isAccessExpired(dateStr) {
  if (!dateStr) return false
  const date = new Date(dateStr)
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  return date < oneWeekAgo
}
