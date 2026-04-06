export function getHistoryDisplayOrder(selectedIndex = 0, total = 0) {
  const normalizedTotal = Number(total) || 0
  if (normalizedTotal <= 0) return 0

  const normalizedIndex = Math.min(
    Math.max(Number(selectedIndex) || 0, 0),
    normalizedTotal - 1,
  )
  return normalizedTotal - normalizedIndex
}

export function canSelectOlderHistory(selectedIndex = 0, total = 0) {
  const normalizedTotal = Number(total) || 0
  return normalizedTotal > 0 && (Number(selectedIndex) || 0) < normalizedTotal - 1
}

export function canSelectNewerHistory(selectedIndex = 0) {
  return (Number(selectedIndex) || 0) > 0
}

export function getOlderHistoryIndex(selectedIndex = 0, total = 0) {
  const normalizedIndex = Number(selectedIndex) || 0
  return canSelectOlderHistory(normalizedIndex, total)
    ? normalizedIndex + 1
    : normalizedIndex
}

export function getNewerHistoryIndex(selectedIndex = 0) {
  const normalizedIndex = Number(selectedIndex) || 0
  return canSelectNewerHistory(normalizedIndex)
    ? normalizedIndex - 1
    : normalizedIndex
}
