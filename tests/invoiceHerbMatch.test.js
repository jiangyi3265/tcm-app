import test from 'node:test'
import assert from 'node:assert/strict'
import { exactInvoiceHerb, invoiceHerbSuggestions } from '../src/utils/invoiceHerbMatch.js'

const herbs = [
  { id: '1', name: '通草', pinyin: 'Tong Cao', alias: '通脱木', isActive: true },
  { id: '2', name: '黄芪', pinyin: 'Huang Qi', isActive: true },
  { id: '3', name: '旧药材', pinyin: 'Tong Cao', isActive: false },
]
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
