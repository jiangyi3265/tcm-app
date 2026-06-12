export function normalizeAcupointList(value) {
  const source = Array.isArray(value?.value) ? value.value : value
  return Array.isArray(source)
    ? source.filter((item) => item && typeof item === 'object')
    : []
}

export function getActiveAcupoints(value) {
  return normalizeAcupointList(value).filter((item) => item.isActive !== false && !item.deletedAt)
}
