export function summarizePrescription(prescription = {}) {
  const items = (prescription.items || []).filter((item) => String(item.name || item.herbName || '').trim())
  const herbs = new Set(items.map((item) => item.herbDictId || String(item.name || item.herbName).trim().toLowerCase()))
  const quantities = {}
  for (const item of items) {
    const unit = item.convertedUnit || (prescription.prescriptionType === 'powder' ? '包' : 'g')
    // Converted quantities already include the number of doses.
    const amount = Number(item.convertedQty ?? (prescription.prescriptionType === 'powder'
      ? 0 : Number(item.dosage || 0) * Number(prescription.quantity || 1)))
    if (!Number.isFinite(amount) || amount < 0) continue
    quantities[unit] = Math.round(((quantities[unit] || 0) + amount) * 1000) / 1000
  }
  return { herbCount: herbs.size, quantities }
}
