import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WORKING_HOURS_STEP_MINUTES,
  buildWorkingHoursPayload,
  normalizeWorkingHoursForForm,
  validateWorkingHours,
} from '../src/utils/workingHours.js'

test('工作时间支持 10 分钟粒度的班表配置', () => {
  assert.equal(WORKING_HOURS_STEP_MINUTES, 10)
  assert.deepEqual(
    validateWorkingHours({
      wednesday: [{ start: '14:20', end: '16:20' }],
    }),
    { ok: true },
  )
})

test('工作时间校验仍拒绝非 10 分钟粒度', () => {
  assert.deepEqual(
    validateWorkingHours({
      wednesday: [{ start: '14:25', end: '16:20' }],
    }),
    { ok: false, code: 'granularity', day: 'wednesday' },
  )
})

test('工作时间表单归一化与提交负载保留 14:20 这种时间值', () => {
  const normalized = normalizeWorkingHoursForForm({
    wednesday: [{ start: '14:20', end: '16:20' }],
  })
  assert.deepEqual(normalized.wednesday, [{ start: '14:20', end: '16:20' }])
  assert.deepEqual(
    buildWorkingHoursPayload(normalized),
    { wednesday: [{ start: '14:20', end: '16:20' }] },
  )
})
