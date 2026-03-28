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
 * Bug 7/10: 优先使用 herbDictId 精确匹配，降级到名称匹配（兼容旧数据）
 * @param {string} herbName - 药材名
 * @param {string} category - 库存分类 'powder'|'raw_herbs'|'pills'
 * @param {Array} inventoryItems - 全部库存数据
 * @param {string|null} herbDictId - 中药字典ID（可选）
 * @returns {Array} 匹配的库存条目
 */
export function findInventoryMatches(herbName, category, inventoryItems, herbDictId = null) {
  if (!inventoryItems) return []

  // Bug 7/10: 优先使用 herbDictId 精确匹配
  if (herbDictId) {
    const byId = inventoryItems.filter(
      (i) => i.isActive && !i.deletedAt && i.herbDictId === herbDictId && i.category === category,
    )
    if (byId.length > 0) return byId
  }

  // 降级到名称匹配（兼容旧数据）
  if (!herbName) return []
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
 * 单味药换算 — 含粉剂智能选型算法 (Bug #6 + #9)
 *
 * 粉剂换算规则（来自客户规格文档 §2.3）：
 *   D = 原方单味药材单剂剂量 (Target Dose per 剂)
 *   S = 供应商包装规格 (Sachet Size, gramsPerPacket)
 *   T = 总剂数 (quantity)
 *
 *   1. 优先级一（精确匹配）：D mod S == 0 → 优先选中
 *   2. 优先级二（最小盈余）：W = (⌈D/S⌉ × S) − D → W 最小的产品
 *   3. 最终包数 N = ⌈D/S⌉ × T
 *   4. 缺货处理：首选不足 → 切换下一个 → 全无 → 数量 0
 *
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
  const dosagePerDose = item.dosage || 0  // D: 单剂用量 (g)
  const totalGrams = dosagePerDose * quantity

  // 查找匹配库存 — Bug 7/10: 传入 herbDictId 优先精确匹配
  const candidates = findInventoryMatches(
    item.herbName || item.name,
    category,
    inventoryItems,
    item.herbDictId || null,
  )

  let convertedQty, convertedUnit, pricePerUnit, subtotal
  let matched = null
  let sorted = []

  switch (prescriptionType) {
    case 'powder': {
      // ═══ 粉剂智能选型算法 ═══
      if (candidates.length === 0) {
        // 无候选项
        matched = null
        convertedQty = 0
        convertedUnit = '包'
        pricePerUnit = 0
        subtotal = 0
        break
      }

      // Step 1: 按智能算法排序候选项
      const ranked = candidates
        .filter(c => c.gramsPerPacket && c.gramsPerPacket > 0)
        .map(c => {
          const S = c.gramsPerPacket
          const packetsPerDose = Math.ceil(dosagePerDose / S)  // ⌈D/S⌉
          const actualGrams = packetsPerDose * S                // 实际给药克数
          const waste = actualGrams - dosagePerDose              // 溢出量 W
          const totalPackets = packetsPerDose * quantity          // 总包数 N = ⌈D/S⌉ × T
          const isExact = dosagePerDose % S === 0               // 精确匹配
          return {
            item: c,
            S, packetsPerDose, waste, totalPackets, isExact,
            stockSufficient: (c.quantity || 0) >= totalPackets,
          }
        })
        .sort((a, b) => {
          // 优先级一：精确匹配
          if (a.isExact && !b.isExact) return -1
          if (!a.isExact && b.isExact) return 1
          // 优先级二：最小盈余
          if (a.waste !== b.waste) return a.waste - b.waste
          // 优先级2.5：盈余相同时，包数更少的优先（规格更大的更方便）
          if (a.packetsPerDose !== b.packetsPerDose) return a.packetsPerDose - b.packetsPerDose
          // 优先级三：优先供应商
          if (preferredSupplierId) {
            if (a.item.supplierId === preferredSupplierId && b.item.supplierId !== preferredSupplierId) return -1
            if (b.item.supplierId === preferredSupplierId && a.item.supplierId !== preferredSupplierId) return 1
          }
          // 优先级四：库存充足的优先
          if (a.stockSufficient && !b.stockSufficient) return -1
          if (!a.stockSufficient && b.stockSufficient) return 1
          // 最后按库存量降序
          return (b.item.quantity || 0) - (a.item.quantity || 0)
        })

      // Step 2: 缺货处理 — 首选不足则切换
      let chosen = ranked[0]
      if (chosen && !chosen.stockSufficient) {
        const available = ranked.find(r => r.stockSufficient)
        if (available) chosen = available
        // 如果全部都不够，仍然使用第一个（最优匹配）
      }

      if (!chosen) {
        // Bug 6: 没有任何有 gramsPerPacket 的候选 — 给出警告
        if (candidates.length > 0) {
          console.warn(`粉剂换算: ${item.herbName || item.name} 的所有库存记录缺少 gramsPerPacket 字段，使用默认值 1g/包`)
        }
        // 退回到按供应商偏好选择
        sorted = sortBySupplierPreference(candidates, preferredSupplierId)
        matched = sorted[0]
        const gpp = matched?.gramsPerPacket || 1  // Bug 6: 兜底 1g/包
        const pPerDose = Math.ceil(dosagePerDose / gpp)
        convertedQty = pPerDose * quantity
      } else {
        matched = chosen.item
        convertedQty = chosen.totalPackets
        sorted = ranked.map(r => r.item)
      }

      convertedUnit = '包'
      pricePerUnit = matched?.pricePerUnit || 0
      subtotal = convertedQty * pricePerUnit
      break
    }
    case 'raw_herbs': {
      sorted = sortBySupplierPreference(candidates, preferredSupplierId)
      matched = sorted[0] || null
      convertedQty = totalGrams
      convertedUnit = 'g'
      pricePerUnit = matched?.pricePerUnit || 0
      subtotal = convertedQty * pricePerUnit
      break
    }
    case 'pills': {
      sorted = sortBySupplierPreference(candidates, preferredSupplierId)
      matched = sorted[0] || null
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
    herbDictId: item.herbDictId || null,
    originalDosage: item.dosage || 0,
    originalUnit: item.unit || 'g',
    convertedQty,
    convertedUnit,
    packetsPerDose: prescriptionType === 'powder' ? (convertedQty && quantity ? Math.round(convertedQty / quantity) : 0) : null,
    totalGrams,
    gramsPerPacket: matched?.gramsPerPacket || null,
    supplierId: matched?.supplierId || null,
    supplierName: matched?.supplier || '',
    pricePerUnit,
    subtotal: Math.round(subtotal * 100) / 100,
    inventoryId: matched?.id || null,
    inventoryStock: matched?.quantity || 0,
    stockSufficient: matched ? matched.quantity >= convertedQty : false,
    outOfStock: !matched || (matched.quantity || 0) === 0,  // Bug 8: 完全缺货标记
    allCandidates: sorted.length > 0 ? sorted : candidates, // 所有可选供应商，用于UI下拉切换
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
  const dosagePerDose = currentItem.originalDosage || currentItem.dosage || 0
  const totalGrams = dosagePerDose * quantity
  let convertedQty, convertedUnit, pricePerUnit, subtotal

  switch (prescriptionType) {
    case 'powder': {
      const gpp = newInventoryItem.gramsPerPacket || 1
      // 按单剂计算包数，再乘以总剂数
      const packetsPerDose = Math.ceil(dosagePerDose / gpp)
      convertedQty = packetsPerDose * quantity
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
    packetsPerDose: prescriptionType === 'powder' ? (convertedQty && quantity ? Math.round(convertedQty / quantity) : 0) : null,
    totalGrams,
    gramsPerPacket: newInventoryItem.gramsPerPacket || null,
    supplierId: newInventoryItem.supplierId || null,
    supplierName: newInventoryItem.supplier || '',
    pricePerUnit,
    subtotal: Math.round(subtotal * 100) / 100,
    inventoryId: newInventoryItem.id || null,
    inventoryStock: newInventoryItem.quantity || 0,
    stockSufficient: newInventoryItem.quantity >= convertedQty,
    outOfStock: (newInventoryItem.quantity || 0) === 0,  // Bug 8: 缺货标记
  }
}
