import Big from 'big.js'
import { getBillablePrescriptions } from './prescriptionWorkflow.js'

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const decimal = (value) => new Big(number(value))
const nonNegative = (value) => value.lt(0) ? new Big(0) : value
const money = (value) => value.round(2, Big.roundHalfUp).toNumber()

function extended(service) {
  return nonNegative(decimal(service.price).times(number(service.quantity) || 1).minus(decimal(service.manualDiscount)))
}

export function serviceExtended(service) {
  return extended(service).toNumber()
}

export function serviceTax(service, taxRate) {
  return service.taxable ? money(extended(service).times(decimal(taxRate))) : 0
}

export function calculateInvoiceTotals(source = {}, defaultTaxRate = 0.13) {
  const rate = decimal(source.overrideTaxRate ?? defaultTaxRate)
  const services = source.services || []
  const serviceTotal = services.reduce((sum, service) => sum.plus(extended(service)), new Big(0))
  const rxTotal = source.includeRxAmount
    ? getBillablePrescriptions(source).reduce((sum, rx) => sum.plus(decimal(rx.subtotal)), new Big(0)) : new Big(0)
  const rawBase = decimal(source.consultationFee).plus(serviceTotal).plus(rxTotal)
  const taxableServices = services.reduce((sum, service) => service.taxable ? sum.plus(extended(service)) : sum, new Big(0))
  // Prescription charges follow the selected invoice tax rate and discount.
  // Consultation fees and services explicitly marked exempt remain untaxed.
  let tax = taxableServices.plus(rxTotal).times(rate)
  let discountedBase = rawBase
  let factor = new Big(1)
  if (source.discountType === 'percentage') {
    factor = nonNegative(new Big(1).minus(decimal(source.discountValue).div(100)))
    discountedBase = rawBase.times(factor)
    tax = tax.times(factor)
  } else if (source.discountType === 'amount' && rawBase.gt(0)) {
    discountedBase = nonNegative(rawBase.minus(decimal(source.discountValue)))
    factor = discountedBase.div(rawBase)
    // Multiply before division so an intermediate recurring ratio cannot
    // shift a mathematically exact half-cent below the rounding boundary.
    tax = tax.times(discountedBase).div(rawBase)
  }
  const taxAmount = money(tax)
  const totalWithoutTax = money(nonNegative(discountedBase))
  return {
    totalWithoutTax,
    taxAmount,
    totalAmount: money(decimal(totalWithoutTax).plus(taxAmount)),
    discountFactor: factor.toNumber(),
    includeRxAmount: Boolean(source.includeRxAmount),
  }
}
