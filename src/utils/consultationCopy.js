import { calculatePrescription } from './prescriptionCalc.js'

function cloneJson(value, fallback = null) {
  if (value === undefined) return fallback
  return JSON.parse(JSON.stringify(value))
}

function buildCopiedPrescriptionId(index = 0) {
  return `rx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`
}

export function buildCopiedTreatmentData(source = {}) {
  const sourcePrescriptions = source.prescriptions || []
  const sourceHerbals = source.herbals || []
  const sourcePrescriptionType = source.prescriptionType || 'none'

  let prescriptions = sourcePrescriptions.map((rx, index) => ({
    ...cloneJson(rx, {}),
    id: buildCopiedPrescriptionId(index),
    dispensingCompleted: false,
    items: (rx.items || []).map((item) => ({
      ...cloneJson(item, {}),
      inventoryId: null,
      supplierId: null,
      supplierName: '',
      stockSufficient: null,
      outOfStock: false,
      allCandidates: [],
    })),
  }))

  // If no prescriptions array but herbals exist (legacy data), wrap herbals
  // into a prescription so that syncFormFromPrimaryPrescription doesn't
  // incorrectly reset prescriptionType to 'none'.
  if (prescriptions.length === 0 && sourceHerbals.length > 0 && sourcePrescriptionType !== 'none') {
    prescriptions = [{
      id: buildCopiedPrescriptionId(0),
      prescriptionType: sourcePrescriptionType,
      formulaName: source.formulaName || '',
      quantity: source.quantity || 1,
      direction: source.direction || '',
      whereToGet: source.whereToGet || '',
      preferredUnit: source.preferredUnit || 'g',
      dispensingCompleted: false,
      items: sourceHerbals.map((item) => ({
        ...cloneJson(item, {}),
        inventoryId: null,
        supplierId: null,
        supplierName: '',
        stockSufficient: null,
        outOfStock: false,
        allCandidates: [],
      })),
    }]
  }

  return {
    acupuncture: cloneJson(source.acupuncture || [], []),
    prescriptions,
    herbals: cloneJson(sourceHerbals, []),
    formulaName: source.formulaName || '',
    prescriptionType: sourcePrescriptionType,
    prognosis: source.prognosis || '',
  }
}

function rehydratePrescriptionItem(item, quantity, prescriptionType, inventoryItems) {
  if (prescriptionType === 'none') {
    return {
      ...item,
      supplierId: null,
      inventoryId: null,
      inventoryStock: 0,
      stockSufficient: null,
      outOfStock: false,
      allCandidates: [],
    }
  }

  const result = calculatePrescription(
    [{
      herbName: item.name,
      herbDictId: item.herbDictId || null,
      dosage: Number(item.dosage || 0),
      unit: item.unit || 'g',
    }],
    Number(quantity || 1),
    prescriptionType || 'raw_herbs',
    inventoryItems,
    null,
  )

  const matched = result.items?.[0]
  if (!matched) {
    return {
      ...item,
      supplierId: null,
      inventoryId: null,
      inventoryStock: 0,
      stockSufficient: false,
      outOfStock: true,
      allCandidates: [],
    }
  }

  return {
    ...item,
    dosage: matched.originalDosage,
    unit: matched.originalUnit,
    convertedQty: matched.convertedQty,
    convertedUnit: matched.convertedUnit,
    packetsPerDose: matched.packetsPerDose,
    gramsPerPacket: matched.gramsPerPacket,
    supplierId: matched.supplierId || null,
    supplierName: matched.supplierName || '',
    inventoryId: matched.inventoryId || null,
    inventoryStock: matched.inventoryStock || 0,
    stockSufficient: matched.inventoryId ? matched.stockSufficient : false,
    outOfStock: matched.outOfStock,
    allCandidates: matched.allCandidates || [],
    pricePerUnit: matched.pricePerUnit,
    subtotal: matched.subtotal,
  }
}

export function rehydrateCopiedPrescriptions(prescriptions = [], inventoryItems = []) {
  return (prescriptions || []).map((prescription, index) => {
    const quantity = Number(prescription?.quantity || 1) > 0 ? Number(prescription.quantity) : 1
    const prescriptionType = prescription?.prescriptionType || 'raw_herbs'
    const items = (prescription?.items || []).map((item) =>
      rehydratePrescriptionItem(item, quantity, prescriptionType, inventoryItems),
    )
    const subtotal = items.reduce((sum, item) => sum + Number(item?.subtotal || 0), 0)

    return {
      ...cloneJson(prescription, {}),
      id: prescription?.id || buildCopiedPrescriptionId(index),
      dispensingCompleted: false,
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      perDoseSubtotal: quantity > 0 ? Math.round((subtotal / quantity) * 100) / 100 : Math.round(subtotal * 100) / 100,
    }
  })
}
