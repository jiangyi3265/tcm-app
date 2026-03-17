/**
 * 处方换算引擎
 * 将方剂模板(g)换算为实际处方(包/g/盒)，并匹配库存+计价
 *
 * 规则来源: 中医诊所综合管理系统specification.docx  §2.2
 *   - 粉剂(powder):  以"包"为最小单位，不同供应商每包克数不同
 *   - 草药(raw_herbs): 以"克(g)"为单位
 *   - 成药(pills):    以"盒/瓶"为单位
 */

/**
 * 在库存中查找匹配指定药名和分类的库存项
 * @param {string} herbName - 药材名
 * @param {string} category - 库存分类 'powder'|'raw_herbs'|'pills'
 * @param {Array} inventoryItems - 全部库存数据
 * @returns {Array} 匹配的库存条目
 */
export function findInventoryMatches(herbName, category, inventoryItems) {
  if (!herbName || !inventoryItems) return []
  const q = herbName.toLowerCase()

  // 优先按分类精确匹配
  const byCategory = inventoryItems.filter(
    (i) =>
      i.isActive &&
      !i.deletedAt &&
      i.name.toLowerCase().includes(q) &&
      i.category === category,
  )
  if (byCategory.length > 0) return byCategory

  // 兜底：不限分类
  return inventoryItems.filter(
    (i) => i.isActive && !i.deletedAt && i.name.toLowerCase().includes(q),
  )
}

/**
 * 按供应商偏好排序候选库存项
 * @param {Array} candidates - 候选库存项
 * @param {string|null} preferredSupplierId - 优先供应商ID
 * @returns {Array} 排序后的候选项
 */
export function sortBySupplierPreference(candidates, preferredSupplierId) {
  return [...candidates].sort((a, b) => {
    // 优先选指定供应商
    if (preferredSupplierId) {
      if (
        a.supplierId === preferredSupplierId &&
        b.supplierId !== preferredSupplierId
      )
        return -1
      if (
        b.supplierId === preferredSupplierId &&
        a.supplierId !== preferredSupplierId
      )
        return 1
    }
    // 然后按库存量降序
    return (b.quantity || 0) - (a.quantity || 0)
  })
}

/**
 * 单味药换算
 * @param {object} item - 方剂中的一味药 { herbName, dosage(g), unit }
 * @param {number} quantity - 剂数（如 7）
 * @param {string} prescriptionType - 'powder'|'raw_herbs'|'pills'
 * @param {Array} inventoryItems - 全部库存
 * @param {string|null} preferredSupplierId - 优先供应商ID
 * @returns {object} 换算结果
 */
export function convertSingleHerb(
  item,
  quantity,
  prescriptionType,
  inventoryItems,
  preferredSupplierId = null,
) {
  const categoryMap = {
    powder: 'powder',
    raw_herbs: 'raw_herbs',
    pills: 'pills',
  }
  const category = categoryMap[prescriptionType] || 'raw_herbs'
  const totalGrams = (item.dosage || 0) * quantity

  // 查找匹配库存
  const candidates = findInventoryMatches(
    item.herbName || item.name,
    category,
    inventoryItems,
  )
  const sorted = sortBySupplierPreference(candidates, preferredSupplierId)
  const matched = sorted[0] || null

  let convertedQty, convertedUnit, pricePerUnit, subtotal

  switch (prescriptionType) {
    case 'powder': {
      const gpp = matched?.gramsPerPacket || 1
      convertedQty = Math.ceil(totalGrams / gpp)
      convertedUnit = '包'
      pricePerUnit = matched?.pricePerUnit || 0
      subtotal = convertedQty * pricePerUnit
      break
    }
    case 'raw_herbs': {
      convertedQty = totalGrams
      convertedUnit = 'g'
      pricePerUnit = matched?.pricePerUnit || 0
      subtotal = convertedQty * pricePerUnit
      break
    }
    case 'pills': {
      convertedQty = item.dosage || 0
      convertedUnit = '盒'
      pricePerUnit = matched?.pricePerUnit || 0
      subtotal = convertedQty * pricePerUnit * quantity
      break
    }
    default: {
      convertedQty = totalGrams
      convertedUnit = 'g'
      pricePerUnit = 0
      subtotal = 0
    }
  }

  return {
    name: item.herbName || item.name,
    originalDosage: item.dosage || 0,
    originalUnit: item.unit || 'g',
    convertedQty,
    convertedUnit,
    totalGrams,
    gramsPerPacket: matched?.gramsPerPacket || null,
    supplierId: matched?.supplierId || null,
    supplierName: matched?.supplier || '',
    pricePerUnit,
    subtotal: Math.round(subtotal * 100) / 100,
    inventoryId: matched?.id || null,
    inventoryStock: matched?.quantity || 0,
    stockSufficient: matched ? matched.quantity >= convertedQty : false,
    allCandidates: sorted, // 所有可选供应商，用于UI下拉切换
  }
}

/**
 * 整方换算：将方剂模板批量换算为处方明细
 * @param {Array} formulaItems - 方剂药味列表 [{herbName, dosage, unit}, ...]
 * @param {number} quantity - 剂数
 * @param {string} prescriptionType - 'powder'|'raw_herbs'|'pills'
 * @param {Array} inventoryItems - 全部库存
 * @param {string|null} preferredSupplierId - 优先供应商ID
 * @returns {object} { items: [...], totalCost, allStockSufficient }
 */
export function calculatePrescription(
  formulaItems,
  quantity,
  prescriptionType,
  inventoryItems,
  preferredSupplierId = null,
) {
  if (!formulaItems || formulaItems.length === 0) {
    return { items: [], totalCost: 0, allStockSufficient: true }
  }

  const items = formulaItems.map((item) =>
    convertSingleHerb(
      item,
      quantity,
      prescriptionType,
      inventoryItems,
      preferredSupplierId,
    ),
  )

  const totalCost = items.reduce((sum, i) => sum + i.subtotal, 0)
  const allStockSufficient = items.every((i) => i.stockSufficient)

  return {
    items,
    totalCost: Math.round(totalCost * 100) / 100,
    allStockSufficient,
  }
}

/**
 * 重新计算单味药（切换供应商后）
 * @param {object} currentItem - 当前处方药味
 * @param {number} quantity - 剂数
 * @param {string} prescriptionType - 处方类型
 * @param {object} newInventoryItem - 新选择的库存条目
 * @returns {object} 更新后的药味数据
 */
export function recalcWithSupplier(
  currentItem,
  quantity,
  prescriptionType,
  newInventoryItem,
) {
  const totalGrams = (currentItem.originalDosage || currentItem.dosage || 0) * quantity
  let convertedQty, convertedUnit, pricePerUnit, subtotal

  switch (prescriptionType) {
    case 'powder': {
      const gpp = newInventoryItem.gramsPerPacket || 1
      convertedQty = Math.ceil(totalGrams / gpp)
      convertedUnit = '包'
      pricePerUnit = newInventoryItem.pricePerUnit || 0
      subtotal = convertedQty * pricePerUnit
      break
    }
    case 'raw_herbs': {
      convertedQty = totalGrams
      convertedUnit = 'g'
      pricePerUnit = newInventoryItem.pricePerUnit || 0
      subtotal = convertedQty * pricePerUnit
      break
    }
    case 'pills': {
      convertedQty = currentItem.originalDosage || currentItem.dosage || 0
      convertedUnit = '盒'
      pricePerUnit = newInventoryItem.pricePerUnit || 0
      subtotal = convertedQty * pricePerUnit * quantity
      break
    }
    default: {
      convertedQty = totalGrams
      convertedUnit = 'g'
      pricePerUnit = 0
      subtotal = 0
    }
  }

  return {
    ...currentItem,
    convertedQty,
    convertedUnit,
    totalGrams,
    gramsPerPacket: newInventoryItem.gramsPerPacket || null,
    supplierId: newInventoryItem.supplierId || null,
    supplierName: newInventoryItem.supplier || '',
    pricePerUnit,
    subtotal: Math.round(subtotal * 100) / 100,
    inventoryId: newInventoryItem.id || null,
    inventoryStock: newInventoryItem.quantity || 0,
    stockSufficient: newInventoryItem.quantity >= convertedQty,
  }
}
