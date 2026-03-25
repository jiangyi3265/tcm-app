export function splitMixedText(text = '') {
  const value = String(text).trim()
  if (!value) return { zh: '', en: '' }

  const firstChineseIndex = value.search(/[\u3400-\u9fff]/)
  const firstLatinIndex = value.search(/[A-Za-z]/)

  if (firstChineseIndex === -1) {
    return { zh: value, en: value }
  }

  if (firstChineseIndex > 0 && (firstLatinIndex === -1 || firstLatinIndex < firstChineseIndex)) {
    return {
      zh: value.slice(firstChineseIndex).trim(),
      en: value.slice(0, firstChineseIndex).trim(),
    }
  }

  if (firstChineseIndex === 0 && firstLatinIndex > 0) {
    return {
      zh: value.slice(0, firstLatinIndex).trim(),
      en: value.slice(firstLatinIndex).trim(),
    }
  }

  return { zh: value, en: value }
}

export function localizeMixedText(text = '', locale = 'zh-CN') {
  const parts = splitMixedText(text)
  return locale === 'zh-CN' ? (parts.zh || text) : (parts.en || text)
}

export function localizeMixedJoinedValue(value, locale = 'zh-CN', separator = ', ') {
  if (Array.isArray(value)) {
    return value.map((item) => localizeMixedText(item, locale)).join(separator)
  }
  if (value == null || value === '') return ''
  return localizeMixedText(value, locale)
}
