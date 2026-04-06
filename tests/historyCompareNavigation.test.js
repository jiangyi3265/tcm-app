import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canSelectNewerHistory,
  canSelectOlderHistory,
  getHistoryDisplayOrder,
  getNewerHistoryIndex,
  getOlderHistoryIndex,
} from '../src/utils/historyCompareNavigation.js'

test('最近记录应显示为按时间顺序的最后一条编号', () => {
  assert.equal(getHistoryDisplayOrder(0, 3), 3)
  assert.equal(getHistoryDisplayOrder(1, 3), 2)
  assert.equal(getHistoryDisplayOrder(2, 3), 1)
})

test('左翻表示查看更早记录，右翻表示回到更新记录', () => {
  assert.equal(getOlderHistoryIndex(0, 3), 1)
  assert.equal(getOlderHistoryIndex(1, 3), 2)
  assert.equal(getNewerHistoryIndex(2), 1)
  assert.equal(getNewerHistoryIndex(1), 0)
})

test('边界状态应正确禁用翻页', () => {
  assert.equal(canSelectOlderHistory(0, 3), true)
  assert.equal(canSelectOlderHistory(2, 3), false)
  assert.equal(canSelectNewerHistory(0), false)
  assert.equal(canSelectNewerHistory(2), true)
})
