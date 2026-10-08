import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizePrescription } from '../src/utils/prescriptionSummary.js'

test('prescription summary counts unique herbs and does not multiply converted packets twice', () => {
  assert.deepEqual(summarizePrescription({ prescriptionType: 'powder', quantity: 7, items: [
    { name: '通草', herbDictId: 'one', convertedQty: 14, convertedUnit: '包' },
    { name: '通草', herbDictId: 'one', convertedQty: 7, convertedUnit: '包' },
    { name: '白术', herbDictId: 'two', convertedQty: 7, convertedUnit: '包' },
    { name: '', dosage: 10 },
  ] }), { herbCount: 2, quantities: { 包: 28 } })
})

test('legacy raw herb summary uses dose times quantity and preserves decimal grams', () => {
  assert.deepEqual(summarizePrescription({ prescriptionType: 'raw_herbs', quantity: 3, items: [
    { name: '通草', dosage: 1.1 }, { name: '白术', dosage: 2.2 },
  ] }), { herbCount: 2, quantities: { g: 9.9 } })
})
