import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyPaidRevenue, getRevenueCategory } from '../src/utils/revenueCategories.js'

test('legacy service labels and custom categories resolve without a service key', () => {
  const types = { custom: { label: 'Cupping' }, acupuncture_new: { label: 'Acupuncture New' } }
  assert.equal(getRevenueCategory({ name: 'Acupuncture New' }, types), 'acupuncture')
  assert.equal(getRevenueCategory({ name: 'Consultation' }), 'consultation')
  assert.equal(getRevenueCategory({ name: 'Cupping' }, types, { custom: 'acupuncture' }), 'acupuncture')
  assert.equal(getRevenueCategory({ name: 'Herbs' }), 'herbs')
})

test('mixed income excludes recycled prescriptions and prorates partial payments and tax', () => {
  const result = classifyPaidRevenue({ consultationFee: 20, totalAmount: 233, taxAmount: 13,
    services: [{ name: 'Acupuncture', price: 100 }, { name: 'Cupping', price: 50, quantity: 2, manualDiscount: 20 }],
    prescriptions: [{ subtotal: 20, rxStatus: 'pending' }, { subtotal: 999, deletedAt: '2026-01-01' }],
  }, 116.5)
  assert.deepEqual(result, { total: 116.5, tax: 6.5, acupuncture: 50, consultation: 10, herbs: 10, others: 40 })
})

test('rounding preserves the paid total after a discount', () => {
  const result = classifyPaidRevenue({ consultationFee: 1, totalAmount: 2,
    services: [{ name: 'Acupuncture', price: 1 }, { name: 'Herbs', price: 1 }] }, 2)
  assert.equal(Number((result.acupuncture + result.consultation + result.herbs + result.others + result.tax).toFixed(2)), 2)
})

test('excluded prescription charges do not become herb income', () => {
  assert.equal(classifyPaidRevenue({ consultationFee: 30, includeRxAmount: false,
    prescriptions: [{ subtotal: 50, rxStatus: 'pending' }] }, 30).herbs, 0)
})
