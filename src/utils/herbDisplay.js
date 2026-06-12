function normalizePart(value) {
  const text = String(value || '').trim()
  if (!text || text === '-' || text === '[]' || text === '{}') return ''
  return text
}

export function formatHerbDisplayName(item = {}) {
  const parts = [
    normalizePart(item.herbName || item.name),
    normalizePart(item.pinyin),
    normalizePart(item.latinName || item.latin),
  ]
  const seen = new Set()
  const unique = parts.filter((part) => {
    const key = part.toLowerCase()
    if (!part || seen.has(key)) return false
    seen.add(key)
    return true
  })
  return unique.join(' / ') || '-'
}
