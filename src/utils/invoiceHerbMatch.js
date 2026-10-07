const token = (value) => String(value || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '')

export function invoiceHerbSuggestions(name, herbs = []) {
  const query = token(name)
  if (!query) return []
  return herbs.filter((herb) => herb.isActive && !herb.deletedAt).map((herb) => {
    const names = [herb.name, herb.pinyin, herb.latinName, ...String(herb.alias || '').split(/[;,，、；]/)].map(token).filter(Boolean)
    const score = names.some((value) => value === query) ? 2
      : names.some((value) => value.length >= 3 && (query.includes(value) || value.includes(query))) ? 1 : 0
    return { herb, score }
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score)
}

export function exactInvoiceHerb(name, herbs) {
  const matches = invoiceHerbSuggestions(name, herbs).filter((item) => item.score === 2)
  return matches.length === 1 ? matches[0].herb : null
}
