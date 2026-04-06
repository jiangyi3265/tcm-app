function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizePaymentFlag(value) {
  return String(value || '').trim().toLowerCase()
}

function hasRealPaymentRecords(consultation) {
  return Array.isArray(consultation?.paymentRecords) && consultation.paymentRecords.length > 0
}

function isLegacyPaidConsultation(consultation) {
  const status = normalizePaymentFlag(consultation?.status)
  const paymentStatus = normalizePaymentFlag(consultation?.paymentStatus)
  return status === 'paid' || paymentStatus === 'paid'
}

function shouldUseLegacyPaidFallback(consultation) {
  return !hasRealPaymentRecords(consultation) && isLegacyPaidConsultation(consultation)
}

function buildLegacyPaymentRecord(consultation) {
  const date = consultation?.paidAt || consultation?.lockedAt || consultation?.date || ''
  const amount = toNumber(consultation?.totalAmount)
  return {
    amount,
    date,
    method: '',
  }
}

export function getPrescriptionStatus(prescription) {
  if (!prescription || prescription.deletedAt) return 'deleted'
  if (prescription.rxStatus) return prescription.rxStatus
  if (prescription.dispensingCompleted) return 'dispensed'
  return 'editing'
}

export function isPrescriptionDeleted(prescription) {
  return getPrescriptionStatus(prescription) === 'deleted'
}

export function getActivePrescriptions(consultation) {
  return Array.isArray(consultation?.prescriptions)
    ? consultation.prescriptions.filter((item) => !isPrescriptionDeleted(item))
    : []
}

export function getPaidAmount(consultation) {
  if (shouldUseLegacyPaidFallback(consultation)) return toNumber(consultation?.totalAmount)
  if (consultation?.paidAmount != null) return toNumber(consultation.paidAmount)
  return getPaymentRecords(consultation).reduce((sum, item) => sum + toNumber(item?.amount), 0)
}

export function getPaymentRecords(consultation) {
  if (hasRealPaymentRecords(consultation)) {
    return consultation.paymentRecords
      .map((item) => ({ ...item }))
      .sort((a, b) => new Date(b?.date || 0) - new Date(a?.date || 0))
  }
  if (shouldUseLegacyPaidFallback(consultation)) {
    return [buildLegacyPaymentRecord(consultation)]
  }
  return []
}

export function getLatestPaymentRecord(consultation) {
  return getPaymentRecords(consultation)[0] || null
}

export function getLatestPaymentTime(consultation) {
  return getLatestPaymentRecord(consultation)?.date || consultation?.paidAt || ''
}

export function hasAnyPayment(consultation) {
  return getPaymentRecords(consultation).length > 0 || getPaidAmount(consultation) > 0
}

export function getOutstandingAmount(consultation) {
  if (shouldUseLegacyPaidFallback(consultation)) return 0
  if (consultation?.outstandingAmount != null) return Math.max(toNumber(consultation.outstandingAmount), 0)
  return Math.max(toNumber(consultation?.totalAmount) - getPaidAmount(consultation), 0)
}

export function getPaymentStatus(consultation) {
  if (shouldUseLegacyPaidFallback(consultation)) return 'paid'
  if (consultation?.paymentStatus) return consultation.paymentStatus
  const paidAmount = getPaidAmount(consultation)
  const outstanding = getOutstandingAmount(consultation)
  if (paidAmount <= 0) return 'unpaid'
  return outstanding > 0 ? 'partial' : 'paid'
}

export function hasAnyPendingPrescription(consultation) {
  return getActivePrescriptions(consultation).some((item) => getPrescriptionStatus(item) === 'pending')
}

export function hasAnyEditingPrescription(consultation) {
  return getActivePrescriptions(consultation).some((item) => getPrescriptionStatus(item) === 'editing')
}

export function hasAnyDispensedPrescription(consultation) {
  return getActivePrescriptions(consultation).some((item) => getPrescriptionStatus(item) === 'dispensed')
}

export function getBillablePrescriptions(consultation) {
  return getActivePrescriptions(consultation).filter((item) => {
    const status = getPrescriptionStatus(item)
    return status === 'pending' || status === 'dispensed'
  })
}

export function getBillablePrescriptionTotal(consultation) {
  return getBillablePrescriptions(consultation)
    .reduce((sum, item) => sum + toNumber(item?.subtotal), 0)
}
