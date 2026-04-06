import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPaymentRecords,
  getPaidAmount,
  getOutstandingAmount,
  getPaymentStatus,
} from '../src/utils/prescriptionWorkflow.js'

test('legacy 已付款但无 paymentRecords 时生成合成记录', () => {
  const consultation = {
    id: 'c-legacy',
    status: 'paid',
    totalAmount: 150,
    paidAt: '2024-01-02T10:00:00Z',
    lockedAt: '2024-01-01T10:00:00Z',
    date: '2024-01-01',
  }
  const records = getPaymentRecords(consultation)
  assert.equal(records.length, 1)
  assert.equal(records[0].amount, 150)
  assert.equal(records[0].date, '2024-01-02T10:00:00Z')
  assert.equal(records[0].method, '')
  assert.equal(getPaidAmount(consultation), 150)
  assert.equal(getOutstandingAmount(consultation), 0)
  assert.equal(getPaymentStatus(consultation), 'paid')
})

test('已有真实 paymentRecords 时不使用 legacy 回退', () => {
  const consultation = {
    id: 'c-real',
    status: 'paid',
    totalAmount: 200,
    paymentRecords: [
      { amount: 80, date: '2024-02-01T08:00:00Z', method: 'cash' },
    ],
  }
  const records = getPaymentRecords(consultation)
  assert.equal(records.length, 1)
  assert.equal(records[0].amount, 80)
  assert.equal(getPaidAmount(consultation), 80)
  assert.equal(getOutstandingAmount(consultation), 120)
  assert.equal(getPaymentStatus(consultation), 'partial')
})
