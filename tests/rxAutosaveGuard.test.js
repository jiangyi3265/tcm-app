import test from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldQueueRxAutosave,
  shouldSkipRxAutosaveAfterSync,
} from '../src/utils/rxAutosaveGuard.js'

test('同步中的处方修改不立即并发发起第二个请求', () => {
  assert.equal(
    shouldQueueRxAutosave({ rxSyncing: true, hasPendingChanges: true }),
    true,
  )
})

test('没有未保存变更时，不进入排队同步', () => {
  assert.equal(
    shouldQueueRxAutosave({ rxSyncing: true, hasPendingChanges: false }),
    false,
  )
})

test('服务端回写且草稿快照未变化时，不再触发二次自动同步', () => {
  assert.equal(
    shouldSkipRxAutosaveAfterSync({
      currentSnapshot: '{"id":"rx-1","items":[{"name":"人参","convertedQty":14}]}',
      baselineSnapshot: '{"id":"rx-1","items":[{"name":"人参","convertedQty":14}]}',
    }),
    true,
  )
})

test('草稿快照发生变化时，仍允许继续自动同步', () => {
  assert.equal(
    shouldSkipRxAutosaveAfterSync({
      currentSnapshot: '{"id":"rx-1","items":[{"name":"人参","convertedQty":28}]}',
      baselineSnapshot: '{"id":"rx-1","items":[{"name":"人参","convertedQty":14}]}',
    }),
    false,
  )
})
