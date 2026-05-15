const collator = new Intl.Collator(['zh-Hans-CN', 'en'], {
  numeric: true,
  sensitivity: 'base',
})

export function naturalCompareText(left, right) {
  return collator.compare(String(left || '').trim(), String(right || '').trim())
}

export function naturalSortedUnique(list = []) {
  return [...new Set(list.map((item) => String(item || '').trim()).filter(Boolean))]
    .sort(naturalCompareText)
}
