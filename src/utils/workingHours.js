const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const WORKING_HOURS_STEP_MINUTES = 10

function createEmptyWorkingRange() {
  return { start: '', end: '' }
}

function toMinutes(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const [hoursText, minutesText] = text.split(':')
  const hours = Number(hoursText)
  const minutes = Number(minutesText)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function isWorkingHoursStepAligned(value) {
  const minutes = toMinutes(value)
  return minutes != null && minutes % WORKING_HOURS_STEP_MINUTES === 0
}

function normalizeWorkingHoursForForm(workingHours = {}) {
  const normalized = {}
  WEEKDAYS.forEach((day) => {
    const dayRanges = Array.isArray(workingHours?.[day])
      ? workingHours[day]
      : workingHours?.[day]?.start || workingHours?.[day]?.end
        ? [workingHours[day]]
        : []
    normalized[day] = dayRanges.length > 0
      ? dayRanges.map((range) => ({
        start: range?.start || '',
        end: range?.end || '',
      }))
      : [createEmptyWorkingRange()]
  })
  return normalized
}

function buildWorkingHoursPayload(workingHours = {}) {
  const cleanHours = {}
  WEEKDAYS.forEach((day) => {
    const ranges = (workingHours?.[day] || [])
      .map((range) => ({
        start: range?.start || '',
        end: range?.end || '',
      }))
      .filter((range) => range.start && range.end)
      .sort((left, right) => toMinutes(left.start) - toMinutes(right.start))
    if (ranges.length > 0) {
      cleanHours[day] = ranges
    }
  })
  return cleanHours
}

function validateWorkingHours(workingHours = {}) {
  for (const day of WEEKDAYS) {
    const ranges = Array.isArray(workingHours?.[day]) ? workingHours[day] : []
    const normalizedRanges = ranges
      .map((range) => ({
        start: range?.start || '',
        end: range?.end || '',
      }))
      .filter((range) => range.start || range.end)
      .map((range) => ({
        ...range,
        startMinutes: toMinutes(range.start),
        endMinutes: toMinutes(range.end),
      }))

    for (const range of normalizedRanges) {
      if (!range.start || !range.end) {
        return { ok: false, code: 'incomplete', day }
      }
      if (range.startMinutes == null || range.endMinutes == null || !isWorkingHoursStepAligned(range.start) || !isWorkingHoursStepAligned(range.end)) {
        return { ok: false, code: 'granularity', day }
      }
      if (range.startMinutes >= range.endMinutes) {
        return { ok: false, code: 'order', day }
      }
    }

    const ordered = normalizedRanges.slice().sort((left, right) => left.startMinutes - right.startMinutes)
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index].startMinutes < ordered[index - 1].endMinutes) {
        return { ok: false, code: 'overlap', day }
      }
    }
  }

  return { ok: true }
}

export {
  WEEKDAYS,
  WORKING_HOURS_STEP_MINUTES,
  createEmptyWorkingRange,
  normalizeWorkingHoursForForm,
  buildWorkingHoursPayload,
  validateWorkingHours,
}
