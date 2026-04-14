import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDayAppointmentLayout } from '../src/utils/appointmentLayout.js'

test('同一重叠组支持三列并发，并按重叠组宽度布局', () => {
  const layout = buildDayAppointmentLayout(
    [
      { id: 'a', startTime: '2026-04-13 09:00:00', endTime: '2026-04-13 10:00:00' },
      { id: 'b', startTime: '2026-04-13 09:10:00', endTime: '2026-04-13 09:50:00' },
      { id: 'c', startTime: '2026-04-13 09:20:00', endTime: '2026-04-13 09:40:00' },
      { id: 'd', startTime: '2026-04-13 11:00:00', endTime: '2026-04-13 11:30:00' },
    ],
    { baseMinutes: 8 * 60, pxPerMinute: 1 },
  )

  const firstGroup = layout.filter((item) => ['a', 'b', 'c'].includes(item.id))
  const later = layout.find((item) => item.id === 'd')

  assert.equal(firstGroup.length, 3)
  assert.ok(firstGroup.every((item) => item.totalColumns === 3))
  assert.equal(new Set(firstGroup.map((item) => item.column)).size, 3)
  assert.equal(later.totalColumns, 1)
  assert.equal(later.widthPct, 100)
})

test('重叠阴影段按真实重叠时间生成', () => {
  const layout = buildDayAppointmentLayout(
    [
      { id: 'a', startTime: '2026-04-13 09:00:00', endTime: '2026-04-13 10:00:00' },
      { id: 'b', startTime: '2026-04-13 09:20:00', endTime: '2026-04-13 09:50:00' },
    ],
    { baseMinutes: 9 * 60, pxPerMinute: 2 },
  )

  const blockA = layout.find((item) => item.id === 'a')
  const blockB = layout.find((item) => item.id === 'b')

  assert.equal(blockA.overlapMinutes, 30)
  assert.equal(blockA.overlapSegments.length, 1)
  assert.equal(blockA.overlapSegments[0].top, 40)
  assert.equal(blockA.overlapSegments[0].height, 60)
  assert.equal(blockB.overlapMinutes, 30)
})
