export function summarizePrescription(prescription = {}) {
  const items = (prescription.items || []).filter((item) => String(item.name || item.herbName || '').trim())
  const herbs = new Set(items.map((item) => item.herbDictId || String(item.name || item.herbName).trim().toLowerCase()))
  const quantities = {}
  for (const item of items) {
    const unit = item.convertedUnit || (prescription.prescriptionType === 'powder' ? '包' : 'g')
    const doses = Math.max(1, Number(prescription.quantity) || 1)
    const amount = prescription.prescriptionType === 'powder'
      ? Number(item.packetsPerDose ?? (Number(item.convertedQty || 0) / doses))
      : prescription.prescriptionType === 'pills'
        ? Number(item.convertedQty ?? item.dosage ?? 0)
        : Number(item.convertedQty != null ? item.convertedQty / doses : item.dosage || 0)
    if (!Number.isFinite(amount) || amount < 0) continue
    quantities[unit] = Math.round(((quantities[unit] || 0) + amount) * 1000) / 1000
  }
  return { herbCount: herbs.size, quantities }
}
