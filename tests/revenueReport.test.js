import test from 'node:test'
import assert from 'node:assert/strict'
import { revenuePaymentsInRange, revenueCsvCell } from '../src/utils/revenueReport.js'

test('revenue exports include receipts in the selected period regardless of consultation date', () => {
  const consultation = { id: 'c1', date: '2026-09-20', paymentRecords: [
    { date: '2026-09-20', amount: 30, method: 'cash' },
    { date: '2026-10-01T12:30:00', amount: 40, method: 'card' },
    { date: '2026-10-01T14:00:00', amount: 10, method: 'card' },
    { date: '2026-11-01', amount: 20, method: 'cash' },
  ] }
  assert.deepEqual(revenuePaymentsInRange([consultation], ['2026-10-01', '2026-10-31']), [
    { consultation, date: '2026-10-01', amount: 50, methods: ['card'] },
  ])
})

test('revenue exports exclude future receipts and recycled consultations, and retain legacy paid dates', () => {
  const legacy = { date: '2026-09-30', paidAt: '2026-10-02', status: 'paid', totalAmount: 15 }
  const future = { date: '2026-10-03', paymentRecords: [{ date: '2026-11-01', amount: 20 }] }
  assert.equal(revenuePaymentsInRange([legacy, future, { ...legacy, deletedAt: '2026-10-03' }], ['2026-10-01', '2026-10-31']).length, 1)
  assert.equal(revenuePaymentsInRange([legacy], []).length, 0)
})

test('CSV names with quotes or commas retain their original text', () => {
  assert.equal(revenueCsvCell('Dr. "QA", Test'), '"Dr. ""QA"", Test"')
})
