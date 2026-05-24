import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCsvText, rowsToObjects } from '../src/utils/csvImport.js'
import { DEFAULT_COUNTRY, normalizeCountryCode, normalizeProvinceCode } from '../src/utils/countryRegionOptions.js'

test('CSV import accepts spaced headers and full-width commas', () => {
  const rows = parseCsvText('Name，Quantity Per Main Unit,branch id\nBanlangen,5,branch-main')
  const objects = rowsToObjects(rows, {
    name: ['name'],
    quantityPerMainUnit: ['quantitypermainunit', 'quantity per main unit'],
    branchId: ['branchid', 'branch id'],
  }, ['name', 'quantityPerMainUnit', 'branchId'])

  assert.deepEqual(objects, [
    { name: 'Banlangen', quantityPerMainUnit: '5', branchId: 'branch-main' },
  ])
})

test('country and province CSV values normalize to dropdown codes', () => {
  const country = normalizeCountryCode('Canada', DEFAULT_COUNTRY)
  assert.equal(country, 'CA')
  assert.equal(normalizeProvinceCode(country, 'Ontario'), 'ON')
})
