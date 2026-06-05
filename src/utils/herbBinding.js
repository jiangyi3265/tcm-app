function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeList(item))
  }

  if (typeof value === 'string') {
    return value
      .split(/[;,，、；\n\r]+/)
      .map((part) => part.trim())
      .filter(Boolean)
  }

  if (value === null || value === undefined) return []

  const text = String(value).trim()
  return text ? [text] : []
}

function normalizeText(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeList(item))
      .join('、')
  }

  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function unwrapHerbSource(herbById) {
  if (
    herbById &&
    typeof herbById === 'object' &&
    'value' in herbById &&
    herbById.value !== herbById
  ) {
    return herbById.value
  }

  return herbById
}

function resolveHerbSource(herbById, herbDictId) {
  const source = unwrapHerbSource(herbById)

  if (!source || !herbDictId) return null

  if (typeof source === 'function') {
    return source(herbDictId) || null
  }

  if (source instanceof Map) {
    return source.get(herbDictId) || source.get(String(herbDictId)) || null
  }

  if (Array.isArray(source)) {
    return source.find((herb) => herb?.id === herbDictId) || null
  }

  if (typeof source === 'object') {
    return source[herbDictId] || source[String(herbDictId)] || null
  }

  return null
}

function pickValue(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value
    if (typeof value === 'string' && value.trim()) return value
    if (value !== null && value !== undefined && value !== '') return value
  }
  return null
}

export function bindHerbSelection(target, herb, { nameKey = 'name' } = {}) {
  if (!target || typeof target !== 'object') return target

  return {
    ...target,
    herbDictId: herb?.id || null,
    ...(nameKey ? { [nameKey]: herb?.name || '' } : {}),
  }
}

export function getInventoryHerbMeta(item = {}, herbById) {
  const herbDict = resolveHerbSource(herbById, item?.herbDictId)

  return {
    alias: normalizeText(
      pickValue(
        herbDict?.alias,
        herbDict?.aliases,
        item?.alias,
        item?.aliases,
      ),
    ),
    nature: normalizeText(
      pickValue(
        herbDict?.nature,
        item?.nature,
      ),
    ),
    taste: normalizeList(
      pickValue(
        herbDict?.taste,
        item?.taste,
      ),
    ),
    toxicity: normalizeText(
      pickValue(
        herbDict?.toxicity,
        item?.toxicity,
      ),
    ),
    guijing: normalizeList(
      pickValue(
        herbDict?.meridianTropism,
        herbDict?.guijing,
        item?.meridianTropism,
        item?.guijing,
      ),
    ),
  }
}

export function validateBoundHerb(entry = {}) {
  if (entry?.category !== 'raw_herbs') return true
  return Boolean(entry?.herbDictId)
}
