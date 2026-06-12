import test from 'node:test'
import assert from 'node:assert/strict'

import { formatHerbDisplayName } from '../src/utils/herbDisplay.js'

test('formatHerbDisplayName includes Chinese name, pinyin, and Latin name for reports', () => {
  assert.equal(
    formatHerbDisplayName({
      name: '陈皮',
      pinyin: 'Chen Pi',
      latinName: 'Citri Reticulatae Pericarpium',
    }),
    '陈皮 / Chen Pi / Citri Reticulatae Pericarpium',
  )
})

test('formatHerbDisplayName removes duplicate parts', () => {
  assert.equal(
    formatHerbDisplayName({
      herbName: 'Chen Pi',
      pinyin: 'Chen Pi',
      latinName: 'Citri Reticulatae Pericarpium',
    }),
    'Chen Pi / Citri Reticulatae Pericarpium',
  )
})
