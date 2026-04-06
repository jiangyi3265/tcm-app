import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hasEditablePrescriptionItems,
  shouldSyncPrescriptionDraft,
} from '../src/utils/consultationInventorySync.js'

test('已存在处方即使删空也仍需同步一次用于立即回库', () => {
  assert.equal(hasEditablePrescriptionItems({ items: [] }), false)
  assert.equal(
    shouldSyncPrescriptionDraft({
      source: { id: 'rx-1', items: [] },
      existingPrescriptionIds: ['rx-1'],
    }),
    true,
  )
})

test('从未落库的新空处方不自动同步', () => {
  assert.equal(
    shouldSyncPrescriptionDraft({
      source: { id: 'rx-new', items: [] },
      existingPrescriptionIds: ['rx-old'],
    }),
    false,
  )
})
