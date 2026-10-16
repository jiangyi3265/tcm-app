import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateInvoiceTotals } from '../src/utils/invoiceTotals.js'

const prescription = (subtotal, rxStatus = 'pending') => ({ subtotal, rxStatus })
const herbsOnly = { prescriptions: [prescription(103.04)], includeRxAmount: true }

test('Mubu herb-only invoice includes 13% tax in both tax and payable amount', () => {
  assert.deepEqual(calculateInvoiceTotals(herbsOnly), { totalWithoutTax: 103.04, taxAmount: 13.4, totalAmount: 116.44, discountFactor: 1, includeRxAmount: true })
})
test('excluded, editing and deleted prescriptions are never taxed or billed', () => {
  assert.equal(calculateInvoiceTotals({ ...herbsOnly, includeRxAmount: false }).totalAmount, 0)
  const totals = calculateInvoiceTotals({ includeRxAmount: true, prescriptions: [prescription(10), prescription(20, 'dispensed'), prescription(100, 'editing'), prescription(100, 'deleted'), { ...prescription(100), deletedAt: '2026-10-15' }] })
  assert.equal(totals.totalWithoutTax, 30)
  assert.equal(totals.taxAmount, 3.9)
})
test('explicit exemption and tax override apply to herbs and taxable services together', () => {
  const source = { ...herbsOnly, services: [{ price: 10, taxable: true }] }
  assert.equal(calculateInvoiceTotals({ ...source, overrideTaxRate: 0 }).taxAmount, 0)
  assert.equal(calculateInvoiceTotals({ ...source, overrideTaxRate: 0.13 }, 0.05).taxAmount, 14.7)
  assert.equal(calculateInvoiceTotals(source, 0.05).taxAmount, 5.65)
})
test('mixed invoice discounts reduce taxable items proportionally without taxing consultation or exempt services', () => {
  const source = { consultationFee: 50, services: [{ price: 40, quantity: 2, manualDiscount: 20, taxable: true }, { price: 40, taxable: false }], prescriptions: [prescription(50)], includeRxAmount: true }
  for (const discount of [{ discountType: 'percentage', discountValue: 25 }, { discountType: 'amount', discountValue: 50 }]) {
    const totals = calculateInvoiceTotals({ ...source, ...discount })
    assert.equal(totals.totalWithoutTax, 150)
    assert.equal(totals.taxAmount, 10.73)
    assert.equal(totals.totalAmount, 160.73)
  }
})
test('discount cannot produce negative charges or tax, and rounded components add to the total', () => {
  assert.equal(calculateInvoiceTotals({ ...herbsOnly, discountType: 'amount', discountValue: 200 }).totalAmount, 0)
  assert.equal(calculateInvoiceTotals({ ...herbsOnly, discountType: 'percentage', discountValue: 150 }).taxAmount, 0)
  assert.equal(calculateInvoiceTotals({ services: [{ price: 5, manualDiscount: 10, taxable: true }] }).totalAmount, 0)
  const totals = calculateInvoiceTotals({ includeRxAmount: true, prescriptions: [prescription(1.005)] })
  assert.equal(totals.totalWithoutTax, 1.01)
  assert.equal(totals.totalAmount, 1.14)
})
