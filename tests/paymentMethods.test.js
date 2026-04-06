import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canStartInvoicePayment,
  getPaymentMethodLabel,
  getPaymentMethodOptions,
  normalizePaymentMethodValue,
  requiresPosSimulation,
} from '../src/utils/paymentMethods.js'

test('旧支付方式值会被标准化到新三种值', () => {
  assert.equal(normalizePaymentMethodValue('card'), 'bankcard')
  assert.equal(normalizePaymentMethodValue('transfer'), 'etransfer')
  assert.equal(normalizePaymentMethodValue('manual'), 'cash')
})

test('支付方式标准化兼容大小写、空格和空值', () => {
  assert.equal(normalizePaymentMethodValue(' Card '), 'bankcard')
  assert.equal(normalizePaymentMethodValue(' TRANSFER '), 'etransfer')
  assert.equal(normalizePaymentMethodValue(' manual '), 'cash')
  assert.equal(normalizePaymentMethodValue(null), '')
  assert.equal(normalizePaymentMethodValue(undefined), '')
  assert.equal(normalizePaymentMethodValue('unknown'), '')
})

test('bankcard 需要 POS 模拟，其它方式不需要', () => {
  assert.equal(requiresPosSimulation('bankcard'), true)
  assert.equal(requiresPosSimulation('card'), true)
  assert.equal(requiresPosSimulation('cash'), false)
  assert.equal(requiresPosSimulation('etransfer'), false)
  assert.equal(requiresPosSimulation('unknown'), false)
  assert.equal(requiresPosSimulation(null), false)
})

test('付款入口仅在已保存且仍有未付金额时显示', () => {
  assert.equal(canStartInvoicePayment({ consultationId: 'consult-1', outstandingAmount: 88, consultationStatus: 'completed' }), true)
  assert.equal(canStartInvoicePayment({ consultationId: '', outstandingAmount: 88, consultationStatus: 'completed' }), false)
  assert.equal(canStartInvoicePayment({ consultationId: 'consult-1', outstandingAmount: 0, consultationStatus: 'completed' }), false)
  assert.equal(canStartInvoicePayment({ consultationId: '   ', outstandingAmount: 88, consultationStatus: 'completed' }), false)
  assert.equal(canStartInvoicePayment({ consultationId: 'consult-1', outstandingAmount: '100', consultationStatus: 'completed' }), true)
  assert.equal(canStartInvoicePayment({ consultationId: 'consult-1', outstandingAmount: '-5', consultationStatus: 'completed' }), false)
  assert.equal(canStartInvoicePayment({ consultationId: 'consult-1', outstandingAmount: 'abc', consultationStatus: 'completed' }), false)
  assert.equal(canStartInvoicePayment({ consultationId: 'consult-1', outstandingAmount: 88, consultationStatus: 'draft' }), false)
})

test('支付方式选项与标签统一为三种', () => {
  const t = (key) => key
  assert.deepEqual(getPaymentMethodOptions(t), [
    { value: 'bankcard', label: 'cashier.paymentMethods.bankcard' },
    { value: 'etransfer', label: 'cashier.paymentMethods.etransfer' },
    { value: 'cash', label: 'cashier.paymentMethods.cash' },
  ])
  assert.equal(getPaymentMethodLabel('transfer', t), 'cashier.paymentMethods.etransfer')
})

test('未知或空支付方式标签回退', () => {
  const t = (key) => key
  assert.equal(getPaymentMethodLabel('unknown', t), 'unknown')
  assert.equal(getPaymentMethodLabel(' unknown ', t), 'unknown')
  assert.equal(getPaymentMethodLabel('', t), '-')
  assert.equal(getPaymentMethodLabel('   ', t), '-')
  assert.equal(getPaymentMethodLabel(null, t), '-')
})
