import { getBillablePrescriptionTotal } from './prescriptionWorkflow.js'

const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0

export function serviceExtended(service) {
  return Math.max(0, number(service.price) * (number(service.quantity) || 1) - number(service.manualDiscount))
}

export function calculateInvoiceTotals(source = {}, defaultTaxRate = 0.13) {
  const rate = number(source.overrideTaxRate ?? defaultTaxRate)
  const services = source.services || []
  const serviceTotal = services.reduce((sum, service) => sum + serviceExtended(service), 0)
  const rxTotal = source.includeRxAmount ? getBillablePrescriptionTotal(source) : 0
  const rawBase = number(source.consultationFee) + serviceTotal + rxTotal
  let factor = 1
  if (source.discountType === 'percentage') factor = Math.max(0, 1 - number(source.discountValue) / 100)
  else if (source.discountType === 'amount' && rawBase > 0) factor = Math.max(0, (rawBase - number(source.discountValue)) / rawBase)
  const taxableServices = services.reduce((sum, service) => sum + (service.taxable ? serviceExtended(service) : 0), 0)
  // Prescription charges follow the selected invoice tax rate and discount.
  // Consultation fees and services explicitly marked exempt remain untaxed.
  const taxAmount = money((taxableServices + rxTotal) * rate * factor)
  const totalWithoutTax = money(Math.max(0, rawBase * factor))
  return {
    totalWithoutTax,
    taxAmount,
    totalAmount: money(totalWithoutTax + taxAmount),
    discountFactor: factor,
    includeRxAmount: Boolean(source.includeRxAmount),
  }
}
