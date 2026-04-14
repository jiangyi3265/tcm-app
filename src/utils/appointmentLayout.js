import { dayjs } from './dateUtils.js'

function toMinutes(value) {
  const dateTime = dayjs(value)
  if (!dateTime.isValid()) return null
  return dateTime.hour() * 60 + dateTime.minute()
}

function mergeIntervals(intervals = []) {
  if (!intervals.length) return []
  const sorted = [...intervals]
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)

  const merged = [sorted[0]]
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]
    const last = merged[merged.length - 1]
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
      continue
    }
    merged.push({ ...current })
  }
  return merged
}

function buildOverlapSegments(block, group, pxPerMinute) {
  const intervals = []
  for (const other of group) {
    if (other.id === block.id) continue
    const start = Math.max(block.startMin, other.startMin)
    const end = Math.min(block.endMin, other.endMin)
    if (end > start) {
      intervals.push({ start, end })
    }
  }

  const merged = mergeIntervals(intervals)
  const overlapMinutes = merged.reduce((sum, interval) => sum + (interval.end - interval.start), 0)
  return {
    overlapMinutes,
    overlapSegments: merged.map((interval) => ({
      startMin: interval.start,
      endMin: interval.end,
      top: Math.max(0, (interval.start - block.startMin) * pxPerMinute),
      height: Math.max((interval.end - interval.start) * pxPerMinute, 3),
    })),
  }
}

function assignColumns(group) {
  const columns = []
  for (const block of group) {
    let assigned = false
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      if (columns[columnIndex] <= block.startMin) {
        block.column = columnIndex
        columns[columnIndex] = block.endMin
        assigned = true
        break
      }
    }
    if (!assigned) {
      block.column = columns.length
      columns.push(block.endMin)
    }
  }
  return Math.max(columns.length, 1)
}

export function buildDayAppointmentLayout(
  appointments = [],
  { baseMinutes = 0, pxPerMinute = 1, minHeight = 20 } = {},
) {
  const normalized = appointments
    .map((appointment, index) => {
      const startMin = toMinutes(appointment?.startTime)
      const endMin = toMinutes(appointment?.endTime)
      if (startMin == null || endMin == null || endMin <= startMin) return null
      return {
        ...appointment,
        id: appointment?.id || `appointment-${index}`,
        startMin,
        endMin,
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.startMin - right.startMin || left.endMin - right.endMin)

  if (!normalized.length) return []

  const groups = []
  let currentGroup = []
  let currentGroupEnd = -1

  for (const block of normalized) {
    if (currentGroup.length === 0 || block.startMin >= currentGroupEnd) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup)
      }
      currentGroup = [block]
      currentGroupEnd = block.endMin
      continue
    }
    currentGroup.push(block)
    currentGroupEnd = Math.max(currentGroupEnd, block.endMin)
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  const laidOut = []
  groups.forEach((group, groupIndex) => {
    const totalColumns = assignColumns(group)
    for (const block of group) {
      const { overlapMinutes, overlapSegments } = buildOverlapSegments(block, group, pxPerMinute)
      laidOut.push({
        ...block,
        groupIndex,
        totalColumns,
        leftPct: (block.column / totalColumns) * 100,
        widthPct: 100 / totalColumns,
        top: (block.startMin - baseMinutes) * pxPerMinute,
        height: Math.max((block.endMin - block.startMin) * pxPerMinute, minHeight),
        overlapMinutes,
        overlapSegments,
        hasOverlap: overlapSegments.length > 0,
      })
    }
  })

  return laidOut.sort((left, right) => left.startMin - right.startMin || left.column - right.column)
}
