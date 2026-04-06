export async function persistCopiedConsultationData({
  currentConsultationId = null,
  prescriptions = [],
  persistConsultationDraft,
  persistCopiedPrescriptions,
} = {}) {
  if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
    return 'skipped'
  }

  if (currentConsultationId) {
    await persistConsultationDraft?.({ silent: true, syncRoute: false })
    return 'draft'
  }

  await persistCopiedPrescriptions?.(prescriptions)
  return 'prescriptions'
}
