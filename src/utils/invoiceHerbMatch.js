const token = (value) => String(value || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '')

function dictionaryNames(herb) {
  const name = String(herb.name || '').trim()
  // Legacy dictionaries often put pinyin in the name rather than its own field.
  // Only split a Chinese name followed by Latin pinyin; retain preparation names.
  const bilingual = name.match(/^([\p{Script=Han}\s]+)[(（]([\p{Script=Latin}\s'’-]+)[)）]$/u)
  const aliases = [herb.alias, herb.aliases].flatMap((value) => Array.isArray(value) ? value : String(value || '').split(/[;,，、；]/))
  return [name, ...(bilingual ? bilingual.slice(1) : []), herb.pinyin, herb.latinName, ...aliases].map(token).filter(Boolean)
}

export function invoiceHerbSuggestions(name, herbs = []) {
  const query = token(name)
  if (!query) return []
  return herbs.filter((herb) => herb.isActive && !herb.deletedAt).map((herb) => {
    const names = dictionaryNames(herb)
    const score = names.some((value) => value === query) ? 2
      : names.some((value) => value.length >= 3 && (query.includes(value) || value.includes(query))) ? 1 : 0
    return { herb, score }
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score)
}

export function exactInvoiceHerb(name, herbs) {
  const matches = invoiceHerbSuggestions(name, herbs).filter((item) => item.score === 2)
  return matches.length === 1 ? matches[0].herb : null
}

function invoiceNames(name) {
  const text = String(name || '').normalize('NFKC').normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/\d+(?:\.\d+)?\s*(?:kg|mg|g|grams?|ml|bags?|packets?|克|包)\b/gi, ' ')
    .replace(/\b(?:granules?|powder|packets?|bags?)\b/gi, ' ')
  // Supplier invoices combine pinyin, Chinese and pack size, e.g. Lu Gen芦根(15g).
  return [...new Set([text, ...(text.match(/[\p{Script=Han}]+|[\p{Script=Latin}][\p{Script=Latin}\s'’-]*/gu) || [])].map(token).filter(Boolean))]
}

function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    previous = next
  }
  return previous[b.length]
}

function approximateScore(query, name) {
  if (query === name) return 1.9
  const chinese = /^\p{Script=Han}+$/u.test(name)
  if (name.length >= (chinese ? 2 : 5) && query.includes(name)) return 1.3 + 0.5 * name.length / query.length
  // A small OCR typo in a long Latin name is recognizable; a one-character
  // change in a short Chinese herb name can identify a different herb.
  if (/^[a-z]+$/.test(query) && /^[a-z]+$/.test(name) && Math.min(query.length, name.length) >= 5) {
    const length = Math.max(query.length, name.length)
    const distance = editDistance(query, name)
    if (distance <= (length >= 10 ? 2 : 1)) return 1 + 0.4 * (1 - distance / length)
  }
  return 0
}

export function rankedInvoiceHerbs(name, herbs = []) {
  const query = token(name)
  if (!query) return []
  const names = invoiceNames(name)
  return herbs.filter((herb) => herb.isActive && !herb.deletedAt).map((herb) => {
    const dictionary = dictionaryNames(herb)
    const score = dictionary.includes(query) ? 2 : Math.max(0, ...names.flatMap(part => dictionary.map(value => approximateScore(part, value))))
    return { herb, score }
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score)
}

export function bestInvoiceHerb(name, herbs) {
  const matches = rankedInvoiceHerbs(name, herbs)
  if (!matches.length) return null
  // Never select a tied or nearly tied dictionary entry just because it came first.
  if (matches[1] && matches[0].score - matches[1].score < 0.08) return null
  return matches[0].herb
}
export function normalizeInvoiceUnit(unit) {
  const value = String(unit || '').trim().toLowerCase().replace(/\s+/g, '')
  if (['bag', 'bags', 'bag(包)', '包', 'packet', 'packets'].includes(value)) return 'bag'
  if (['g', 'gram', 'grams', '克'].includes(value)) return 'g'
  return value
}

function supplierName(value) {
  return token(String(value || '').normalize('NFKC').normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/\b(?:ltd|limited|inc|incorporated|corp|corporation|co|company|llc)\b\.?/gi, '')
    .replace(/(?:有限责任公司|股份有限公司|有限公司)$/u, ''))
}

function supplierScore(invoice, stock) {
  const query = supplierName(invoice)
  const name = supplierName(stock)
  // Legacy inventory without a supplier can still be reused, but a named
  // supplier match always wins. Unrelated named suppliers stay separate.
  if (!query || !name) return 0
  if (query === name) return 3
  const shortest = Math.min(query.length, name.length)
  const longest = Math.max(query.length, name.length)
  if (shortest >= 4 && shortest / longest >= 0.6 && (query.includes(name) || name.includes(query))) return 2 + shortest / longest
  const distance = editDistance(query, name)
  return shortest >= 5 && distance <= Math.max(1, Math.floor(longest * 0.15)) ? 1 + (1 - distance / longest) : -1
}

export function bestInvoiceInventory(row, items = [], branchId = null) {
  if (!row.herbDictId) return null
  const unit = normalizeInvoiceUnit(row.unit || (row.category === 'powder' ? 'bag' : 'g'))
  const packetSize = Number(row.gramsPerPacket) || 0
  const candidates = items.filter(item => item.isActive && !item.deletedAt
    && item.herbDictId === row.herbDictId && item.category === row.category
    && (!branchId || !item.branchId || item.branchId === branchId)
    && normalizeInvoiceUnit(item.unit) === unit)
    .map(item => {
      const size = Number(item.gramsPerPacket ?? item.quantityPerMainUnit) || 0
      return { item, supplier: supplierScore(row.supplier, item.supplier),
        compatible: !packetSize || !size || packetSize === size,
        sizeMatch: Number(packetSize > 0 && packetSize === size),
        branchMatch: Number(Boolean(branchId) && item.branchId === branchId) }
    })
    .filter(match => match.compatible && match.supplier >= 0)
    .sort((a, b) => b.supplier - a.supplier || b.sizeMatch - a.sizeMatch || b.branchMatch - a.branchMatch
      || String(a.item.id).localeCompare(String(b.item.id)))
  return candidates[0]?.item || null
}
