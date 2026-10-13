import test from 'node:test'
import assert from 'node:assert/strict'
import { exactInvoiceHerb, invoiceHerbSuggestions, normalizeInvoiceUnit } from '../src/utils/invoiceHerbMatch.js'

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
