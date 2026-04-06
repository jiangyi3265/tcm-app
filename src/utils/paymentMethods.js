const PAYMENT_METHOD_VALUES = ['bankcard', 'etransfer', 'cash']

const METHOD_LABEL_KEYS = {
  bankcard: 'cashier.paymentMethods.bankcard',
  etransfer: 'cashier.paymentMethods.etransfer',
  cash: 'cashier.paymentMethods.cash',
}

const LEGACY_METHOD_ALIASES = {
  card: 'bankcard',
  transfer: 'etransfer',
  manual: 'cash',
}

function normalizeInput(value = '') {
  return String(value ?? '').trim().toLowerCase()
}

export function normalizePaymentMethodValue(value = '') {
  const normalized = normalizeInput(value)
  if (!normalized) {
    return ''
  }

  if (PAYMENT_METHOD_VALUES.includes(normalized)) {
    return normalized
  }

  return LEGACY_METHOD_ALIASES[normalized] || ''
}

export function requiresPosSimulation(value = '') {
  return normalizePaymentMethodValue(value) === 'bankcard'
}

export function canStartInvoicePayment({ consultationId, outstandingAmount, consultationStatus } = {}) {
  const status = String(consultationStatus ?? '').trim().toLowerCase()
  return !!String(consultationId ?? '').trim()
    && Number(outstandingAmount ?? 0) > 0
    && status === 'completed'
}

export function getPaymentMethodOptions(t) {
  return PAYMENT_METHOD_VALUES.map((value) => ({
    value,
    label: t(METHOD_LABEL_KEYS[value]),
  }))
}

export function getPaymentMethodLabel(value, t) {
  const normalized = normalizePaymentMethodValue(value)
  if (normalized) {
    return t(METHOD_LABEL_KEYS[normalized])
  }

  const raw = String(value ?? '').trim()
  if (!raw) {
    return '-'
  }

  return raw
}
