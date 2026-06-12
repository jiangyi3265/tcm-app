import test from 'node:test'
import assert from 'node:assert/strict'
import { getActiveAcupoints, normalizeAcupointList } from '../src/utils/acupoints.js'

test('normalizeAcupointList returns an empty array for invalid cached data', () => {
  assert.deepEqual(normalizeAcupointList(undefined), [])
  assert.deepEqual(normalizeAcupointList({ bad: true }), [])
  assert.deepEqual(normalizeAcupointList('not-json'), [])
})

test('normalizeAcupointList accepts plain arrays and ref-like values', () => {
  const items = [{ id: 'li4', name: 'LI4 Hegu' }, null, 'bad']

  assert.deepEqual(normalizeAcupointList(items), [{ id: 'li4', name: 'LI4 Hegu' }])
  assert.deepEqual(normalizeAcupointList({ value: items }), [{ id: 'li4', name: 'LI4 Hegu' }])
})

test('getActiveAcupoints keeps legacy active rows and filters deleted or inactive rows', () => {
  const rows = [
    { id: 'legacy-li4', name: 'LI4 Hegu' },
    { id: 'active', name: 'ST36 Zusanli', isActive: true },
    { id: 'inactive', name: 'Inactive point', isActive: false },
    { id: 'deleted', name: 'Deleted point', deletedAt: '2026-06-13T00:00:00Z' },
  ]

  assert.deepEqual(getActiveAcupoints(rows).map((item) => item.id), ['legacy-li4', 'active'])
})
