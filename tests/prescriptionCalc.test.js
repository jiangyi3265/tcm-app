import test from 'node:test'
import assert from 'node:assert/strict'
import { calculatePrescription, findInventoryMatches } from '../src/utils/prescriptionCalc.js'

test('findInventoryMatches 优先使用 herbDictId 精确匹配库存', () => {
  const inventoryItems = [
    {
      id: 'inv-a',
      name: '当归',
      herbDictId: 'herb-a',
      category: 'raw_herbs',
      quantity: 100,
      isActive: true,
      deletedAt: null,
    },
    {
      id: 'inv-b',
      name: '当归',
      herbDictId: 'herb-b',
      category: 'raw_herbs',
      quantity: 200,
      isActive: true,
      deletedAt: null,
    },
  ]

  const matches = findInventoryMatches('当归', 'raw_herbs', inventoryItems, 'herb-b')

  assert.equal(matches.length, 1)
  assert.equal(matches[0].id, 'inv-b')
})

test('粉剂换算返回的 subtotal 已经是总金额，不需要在外层再次乘剂数', () => {
  const result = calculatePrescription(
    [
      {
        herbName: '黄芪',
        herbDictId: 'herb-hq',
        dosage: 6,
        unit: 'g',
      },
    ],
    7,
    'powder',
    [
      {
        id: 'powder-1',
        name: '黄芪',
        herbDictId: 'herb-hq',
        category: 'powder',
        gramsPerPacket: 3,
        quantity: 100,
        pricePerUnit: 2.5,
        supplier: '供应商A',
        isActive: true,
        deletedAt: null,
      },
    ],
  )

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].packetsPerDose, 2)
  assert.equal(result.items[0].convertedQty, 14)
  assert.equal(result.items[0].subtotal, 35)
  assert.equal(result.totalCost, 35)
})
