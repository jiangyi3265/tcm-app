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
