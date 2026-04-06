export function hasEditablePrescriptionItems(source = {}) {
  const items = Array.isArray(source?.items) ? source.items : []
  return items.some((item) => String(item?.name || '').trim())
}

export function shouldSyncPrescriptionDraft({ source = {}, existingPrescriptionIds = [] } = {}) {
  if (hasEditablePrescriptionItems(source)) return true
  const id = String(source?.id || '').trim()
  return !!id && existingPrescriptionIds.includes(id)
}
