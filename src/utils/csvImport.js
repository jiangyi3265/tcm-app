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
    } else if ((ch === ',' || ch === '\t' || ch === '\uFF0C') && !inQuotes) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += ch
    }
  }
  cells.push(cell.trim())
  return cells
}

function headerKey(value) {
  return String(value || '').trim().toLowerCase()
}

function compactHeaderKey(value) {
  return headerKey(value).replace(/[\s_\-()/]+/g, '')
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
  const setAlias = (name, field) => {
    const key = headerKey(name)
    if (key) aliasIndex.set(key, field)
    const compactKey = compactHeaderKey(name)
    if (compactKey) aliasIndex.set(compactKey, field)
  }
  Object.entries(aliases).forEach(([field, names]) => {
    names.forEach((name) => setAlias(name, field))
  })
  const first = rows[0].map((cell) => headerKey(cell))
  const hasHeader = first.some((cell) => aliasIndex.has(cell) || aliasIndex.has(compactHeaderKey(cell)))
  const headers = (hasHeader ? rows[0] : fallbackHeaders).map((cell, index) =>
    aliasIndex.get(headerKey(cell)) || aliasIndex.get(compactHeaderKey(cell)) || fallbackHeaders[index] || `col${index}`,
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
