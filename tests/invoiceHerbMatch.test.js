import test from 'node:test'
import assert from 'node:assert/strict'
import { exactInvoiceHerb, invoiceHerbSuggestions, normalizeInvoiceUnit, bestInvoiceHerb, bestInvoiceInventory, rankedInvoiceHerbs } from '../src/utils/invoiceHerbMatch.js'

const herbs = [
  { id: '1', name: '通草', pinyin: 'Tong Cao', alias: '通脱木', isActive: true },
  { id: '2', name: '黄芪', pinyin: 'Huang Qi', isActive: true },
  { id: '3', name: '旧药材', pinyin: 'Tong Cao', isActive: false },
]
test('invoice unit aliases preserve physical units without converting bag to grams', () => {
  for (const unit of ['Bags', 'bag (包)', '包', 'packets']) assert.equal(normalizeInvoiceUnit(unit), 'bag')
  for (const unit of ['grams', '克', 'G']) assert.equal(normalizeInvoiceUnit(unit), 'g')
  assert.notEqual(normalizeInvoiceUnit('bag'), normalizeInvoiceUnit('g'))
  assert.notEqual(normalizeInvoiceUnit('kg'), normalizeInvoiceUnit('g'))
})
test('invoice names match active dictionary names, pinyin and aliases', () => {
  assert.equal(exactInvoiceHerb('TONG-CAO', herbs)?.id, '1')
  assert.equal(exactInvoiceHerb('通脱木', herbs)?.id, '1')
  assert.equal(exactInvoiceHerb('黄芪', herbs)?.id, '2')
})
test('fuzzy and ambiguous matches require manual selection', () => {
  assert.equal(exactInvoiceHerb('Tong Cao 100g', herbs), null)
  assert.equal(invoiceHerbSuggestions('Tong Cao 100g', herbs)[0].herb.id, '1')
  assert.equal(exactInvoiceHerb('Tong Cao', [...herbs, { id: '4', name: '通草 B', pinyin: 'Tong Cao', isActive: true }]), null)
  assert.equal(exactInvoiceHerb('', herbs), null)
})

test('legacy bilingual names match the exact Chinese or pinyin part, preserving preparations', () => {
  const dictionary = [
    { id: 'tc', name: '通草(Tong Cao)', isActive: true },
    { id: 'gc', name: '炙甘草(Zhi Gan Cao)', isActive: true },
  ]
  assert.equal(exactInvoiceHerb('通草', dictionary)?.id, 'tc')
  assert.equal(exactInvoiceHerb('Tong Cao', dictionary)?.id, 'tc')
  assert.equal(exactInvoiceHerb('炙甘草', dictionary)?.id, 'gc')
  assert.equal(exactInvoiceHerb('甘草', dictionary), null)
  assert.equal(exactInvoiceHerb('通草', [...dictionary, { id: 'duplicate', name: '通草（Tong Cao）', isActive: true }]), null)
})

test('supplier bilingual names and packaging preselect the closest dictionary herb', () => {
  const dictionary = [
    { id: 'lu', name: '芦根(Lu Gen)', isActive: true },
    { id: 'di', name: '生地黄(Sheng Di Huang)', isActive: true },
    { id: 'bai', name: '黄柏(Huang Bai)', isActive: true },
    { id: 'lian', name: '黄连(Huang Lian)', isActive: true },
    { id: 'chuan', name: '川楝子(Chuan Lian Zi)', isActive: true },
    { id: 'lotus', name: '莲子(Lian Zi)', isActive: true },
  ]
  for (const [name, id] of [['Lu Gen芦根(15g)', 'lu'], ['Sheng Di Huang生地黄(10g)', 'di'], ['Huang Bai黄柏(6g)', 'bai'], ['Huang Lian黄连(3g)', 'lian'], ['Chao Chuan Lian Zi炒川楝子(10g)', 'chuan']]) {
    assert.equal(bestInvoiceHerb(name, dictionary)?.id, id)
    assert.equal(rankedInvoiceHerbs(name, dictionary)[0].herb.id, id)
  }
  assert.equal(bestInvoiceHerb('Tóng Cáo granules 100g', herbs)?.id, '1')
  assert.equal(bestInvoiceHerb('Tong Cso 100g', herbs)?.id, '1')
})
test('unknown, inactive, duplicate and equally close herb names remain unselected', () => {
  assert.equal(bestInvoiceHerb('Unknown product 100g', herbs), null)
  assert.equal(bestInvoiceHerb('黄芩', herbs), null)
  assert.equal(bestInvoiceHerb('', herbs), null)
  assert.equal(bestInvoiceHerb('旧药材', herbs), null)
  assert.equal(bestInvoiceHerb('Tong Cao 100g', [...herbs, { ...herbs[0], id: 'duplicate' }]), null)
  assert.equal(bestInvoiceHerb('Huang Xin', [{ id: '1', name: 'Huang Xin', isActive: true, deletedAt: '2026-10-15' }]), null)
  const prepared = [{ id: 'raw', name: '甘草(Gan Cao)', isActive: true }, { id: 'prepared', name: '炙甘草(Zhi Gan Cao)', isActive: true }]
  assert.equal(bestInvoiceHerb('Zhi Gan Cao炙甘草(10g)', prepared)?.id, 'prepared')
  assert.equal(bestInvoiceHerb('甘草', [prepared[1]]), null)
})

const invoiceRow = { herbDictId: '1', category: 'powder', unit: 'bags', gramsPerPacket: 10, supplier: 'Starjay Trading Ltd.' }
const stockItem = { id: 'matching', herbDictId: '1', category: 'powder', unit: 'bag(包)', gramsPerPacket: 10, supplier: 'Starjay Trading', isActive: true }

test('inventory defaults to the closest supplier despite multiple rows and spelling variations', () => {
  const stocks = [
    { ...stockItem, id: 'unrelated', supplier: 'Evergreen Herbs' },
    { ...stockItem, id: 'legacy', supplier: '' },
    { ...stockItem, id: 'typo', supplier: 'Starjai Trading Limited' },
    stockItem,
  ]
  assert.equal(bestInvoiceInventory(invoiceRow, stocks)?.id, 'matching')
  assert.equal(bestInvoiceInventory(invoiceRow, stocks.slice(0, 3))?.id, 'typo')
  assert.equal(bestInvoiceInventory({ ...invoiceRow, supplier: '星嘉有限公司' }, [{ ...stockItem, supplier: '星嘉' }])?.id, 'matching')
})

test('inventory with no compatible herb, supplier, unit or packaging defaults to a new item', () => {
  for (const change of [{ herbDictId: '2' }, { supplier: 'Evergreen Herbs' }, { unit: 'g' }, { gramsPerPacket: 15 },
    { category: 'raw_herbs' }, { isActive: false }, { deletedAt: '2026-10-16' }, { branchId: 'other' }]) {
    assert.equal(bestInvoiceInventory(invoiceRow, [{ ...stockItem, ...change }], 'clinic'), null)
  }
  assert.equal(bestInvoiceInventory({ ...invoiceRow, herbDictId: '' }, [stockItem]), null)
  assert.equal(bestInvoiceInventory(invoiceRow, []), null)
})

test('inventory selection prefers a known matching pack size and current branch with stable ties', () => {
  const stocks = [
    { ...stockItem, id: 'unknown-size', gramsPerPacket: null },
    { ...stockItem, id: 'shared' },
    { ...stockItem, id: 'clinic-b', branchId: 'clinic' },
    { ...stockItem, id: 'clinic-a', branchId: 'clinic' },
  ]
  assert.equal(bestInvoiceInventory(invoiceRow, stocks, 'clinic')?.id, 'clinic-a')
  assert.equal(bestInvoiceInventory(invoiceRow, [...stocks].reverse(), 'clinic')?.id, 'clinic-a')
})

test('legacy inventory and missing invoice metadata still select an eligible existing row', () => {
  assert.equal(bestInvoiceInventory(invoiceRow, [{ ...stockItem, supplier: '', gramsPerPacket: null }])?.id, 'matching')
  assert.equal(bestInvoiceInventory({ ...invoiceRow, supplier: '', unit: null, gramsPerPacket: null }, [stockItem])?.id, 'matching')
  assert.equal(bestInvoiceInventory(invoiceRow, [{ ...stockItem, gramsPerPacket: null, quantityPerMainUnit: 15 }]), null)
})
