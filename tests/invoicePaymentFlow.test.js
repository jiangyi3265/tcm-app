import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveInvoicePaymentAfterSave } from '../src/utils/invoicePaymentFlow.js'

test('resolveInvoicePaymentAfterSave 以 silent+不跳转保存并返回 outstanding', async () => {
  const calls = []
  const persist = async (options) => {
    calls.push(options)
    return { id: 'c1', totalAmount: 120 }
  }
  const result = await resolveInvoicePaymentAfterSave(persist)
  assert.deepEqual(calls, [{ silent: true, syncRoute: false }])
  assert.equal(result.savedConsultation.id, 'c1')
  assert.equal(result.outstandingAmount, 120)
})

test('resolveInvoicePaymentAfterSave 使用 saved outstandingAmount', async () => {
  const persist = async () => ({ id: 'c2', outstandingAmount: 0, totalAmount: 80 })
  const result = await resolveInvoicePaymentAfterSave(persist)
  assert.equal(result.outstandingAmount, 0)
})
