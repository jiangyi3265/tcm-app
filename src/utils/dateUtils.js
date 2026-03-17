import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

export function formatDate(date) {
  if (!date) return ''
  return dayjs(date).format('YYYY-MM-DD')
}

export function formatDateTime(date) {
  if (!date) return ''
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

export function formatTime(date) {
  if (!date) return ''
  return dayjs(date).format('HH:mm')
}

export function fromNow(date) {
  if (!date) return ''
  return dayjs(date).fromNow()
}

export function isExpired(date, days = 7) {
  if (!date) return true
  return dayjs().diff(dayjs(date), 'day') > days
}

export function addMinutes(date, minutes) {
  return dayjs(date).add(minutes, 'minute').toISOString()
}

export function getWeekDays(date = new Date()) {
  const start = dayjs(date).startOf('week')
  return Array.from({ length: 7 }, (_, i) => start.add(i, 'day').toDate())
}

export function isSameDay(a, b) {
  return dayjs(a).isSame(dayjs(b), 'day')
}

export function getDaySlots(date, startHour = 8, endHour = 18, intervalMinutes = 30) {
  const slots = []
  const d = dayjs(date).startOf('day')
  let current = d.add(startHour, 'hour')
  const end = d.add(endHour, 'hour')
  while (current.isBefore(end)) {
    slots.push(current.toISOString())
    current = current.add(intervalMinutes, 'minute')
  }
  return slots
}

export { dayjs }
