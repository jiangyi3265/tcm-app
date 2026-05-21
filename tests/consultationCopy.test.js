import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCopiedTreatmentData,
  rehydrateCopiedPrescriptions,
  sanitizeCopiedConsultationData,
} from '../src/utils/consultationCopy.js'

test('复制处方后会重绑当前库存，并保留新供应商信息', () => {
  const copied = buildCopiedTreatmentData({
    acupuncture: [],
    prescriptions: [{
      id: 'rx-old',
      formulaName: '补气方',
      prescriptionType: 'raw_herbs',
      quantity: 7,
      items: [{
        name: '黄芪',
        herbDictId: 'herb-hq',
        dosage: 10,
        unit: 'g',
        supplierName: '旧供应商',
      }],
    }],
    herbals: [],
    formulaName: '补气方',
    prescriptionType: 'raw_herbs',
  })

  const rebound = rehydrateCopiedPrescriptions(copied.prescriptions, [{
    id: 'inv-new',
    name: '黄芪',
    herbDictId: 'herb-hq',
    category: 'raw_herbs',
    quantity: 500,
    pricePerUnit: 0.5,
    supplier: '现供应商',
    supplierId: 'supplier-new',
    isActive: true,
    deletedAt: null,
  }])

  assert.equal(rebound.length, 1)
  assert.equal(rebound[0].dispensingCompleted, false)
  assert.equal(rebound[0].items[0].inventoryId, 'inv-new')
  assert.equal(rebound[0].items[0].supplierId, 'supplier-new')
  assert.equal(rebound[0].items[0].supplierName, '现供应商')
  assert.equal(rebound[0].items[0].convertedQty, 70)
  assert.equal(rebound[0].subtotal, 35)
  assert.equal(rebound[0].perDoseSubtotal, 5)
})

test('copied consultation data does not carry old record identity or billing state', () => {
  const copied = sanitizeCopiedConsultationData({
    id: 'consult-old',
    consultationId: 'ORD-OLD',
    date: '2026-05-11',
    consultDate: '2026-05-11 10:00:00',
    status: 'completed',
    totalAmount: 135.6,
    paymentRecords: [{ amount: 135.6 }],
    invoicePdfUrl: '/old-invoice.pdf',
    chiefComplaint: 'Back Pain',
    services: [{ name: 'Acupuncture' }],
  })

  assert.equal(copied.id, undefined)
  assert.equal(copied.consultationId, undefined)
  assert.equal(copied.date, undefined)
  assert.equal(copied.consultDate, undefined)
  assert.equal(copied.status, undefined)
  assert.equal(copied.totalAmount, undefined)
  assert.equal(copied.paymentRecords, undefined)
  assert.equal(copied.invoicePdfUrl, undefined)
  assert.equal(copied.chiefComplaint, 'Back Pain')
  assert.deepEqual(copied.services, [{ name: 'Acupuncture' }])
})

test('当前库存没有匹配项时，复制处方仍保留原供应商名称用于显示', () => {
  const copied = buildCopiedTreatmentData({
    prescriptions: [{
      id: 'rx-old',
      formulaName: '补气方',
      prescriptionType: 'raw_herbs',
      quantity: 7,
      items: [{
        name: '黄芪',
        herbDictId: 'herb-hq',
        dosage: 10,
        unit: 'g',
        supplierName: '旧供应商',
      }],
    }],
  })

  const rebound = rehydrateCopiedPrescriptions(copied.prescriptions, [])

  assert.equal(rebound[0].items[0].inventoryId, null)
  assert.equal(rebound[0].items[0].supplierName, '旧供应商')
  assert.equal(rebound[0].items[0].outOfStock, true)
})
