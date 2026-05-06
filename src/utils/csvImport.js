function splitCsvLine(line) {
  const cells = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    const next = line[i + 1]
    if (ch === '"' && inQuotes && next === '"') {
      cell += '"'
      i += 1
    } else if (ch === '"') {
      inQuotes = !inQuotes
    } else if ((ch === ',' || ch === '\t' || ch === '，') && !inQuotes) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += ch
    }
  }
  cells.push(cell.trim())
  return cells
}

export function parseCsvText(text) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitCsvLine)
}

export function rowsToObjects(rows, aliases, fallbackHeaders = []) {
  if (!rows.length) return []
  const aliasIndex = new Map()
  Object.entries(aliases).forEach(([field, names]) => {
    names.forEach((name) => aliasIndex.set(String(name).trim().toLowerCase(), field))
  })
  const first = rows[0].map((cell) => String(cell || '').trim().toLowerCase())
  const hasHeader = first.some((cell) => aliasIndex.has(cell))
  const headers = (hasHeader ? rows[0] : fallbackHeaders).map((cell, index) =>
    aliasIndex.get(String(cell || '').trim().toLowerCase()) || fallbackHeaders[index] || `col${index}`,
  )
  const dataRows = hasHeader ? rows.slice(1) : rows
  return dataRows.map((row) => {
    const item = {}
    headers.forEach((field, index) => {
      if (!field) return
      item[field] = row[index] ?? ''
    })
    return item
  })
}

export function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
