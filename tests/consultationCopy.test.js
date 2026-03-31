import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCopiedTreatmentData, rehydrateCopiedPrescriptions } from '../src/utils/consultationCopy.js'

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
