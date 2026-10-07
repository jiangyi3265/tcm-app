import { getPaymentRecords } from './prescriptionWorkflow.js'

// Match the receipt dates used by the revenue charts, including partial payments.
export function revenuePaymentsInRange(consultations, [start, end] = []) {
  if (!start || !end) return []
  return consultations.filter((consultation) => !consultation.deletedAt).flatMap((consultation) => {
    const byDate = new Map()
    for (const payment of getPaymentRecords(consultation)) {
      const date = String(payment.date || '').slice(0, 10)
      if (date < start || date > end) continue
      const group = byDate.get(date) || { consultation, date, amount: 0, methods: [] }
      const amount = Number(payment.amount || 0)
      if (!Number.isFinite(amount)) continue
      group.amount += amount
      if (payment.method && !group.methods.includes(payment.method)) group.methods.push(payment.method)
      byDate.set(date, group)
    }
    return [...byDate.values()].filter((group) => group.amount !== 0)
  }).sort((a, b) => a.date.localeCompare(b.date))
}

export function revenueCsvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}
