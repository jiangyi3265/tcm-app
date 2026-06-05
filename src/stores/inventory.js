import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { inventoryApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

export const useInventoryStore = defineStore('inventory', () => {
  const items = ref([])

  function normalizeInventoryCategory(category) {
    const text = String(category || '').trim().toLowerCase().replace(/[-\s]+/g, '_')
    const compact = text.replace(/_/g, '')
    if (
      text === 'raw_herbs'
      || compact === 'rawherbs'
      || compact === 'rawherb'
      || compact === 'herbs'
      || compact === 'herb'
      || text.includes('草药')
      || text.includes('中药')
      || text.includes('饮片')
    ) return 'raw_herbs'
    if (
      text === 'powder'
      || compact === 'powders'
      || compact === 'granule'
      || compact === 'granules'
      || text.includes('颗粒')
      || text.includes('粉')
    ) return 'powder'
    if (
      text === 'pills'
      || compact === 'pill'
      || compact === 'patentmedicine'
      || compact === 'patentmedicines'
      || text.includes('成药')
      || text.includes('丸')
      || text.includes('片')
    ) return 'pills'
    return text || 'raw_herbs'
  }

  function normalizeInventoryItem(item = {}) {
    return {
      ...item,
      category: normalizeInventoryCategory(item.category),
    }
  }

  function init() {
    items.value = readStoredJson('tcm_inventory', []) || []
  }

  function saveState() {
    writeStoredJson('tcm_inventory', items.value)
  }

  function getItem(id) {
    return items.value.find((i) => i.id === id) || null
  }

  function findByName(name) {
    if (!name) return []
    const q = name.toLowerCase()
    return items.value.filter(
      (i) => i.isActive && !i.deletedAt && i.name.toLowerCase().includes(q),
    )
  }

  const activeItems = computed(() => items.value.filter((i) => i.isActive && !i.deletedAt))

  function numericStockValue(value) {
    const amount = Number(value ?? 0)
    return Number.isFinite(amount) ? amount : 0
  }

  function isLowStockItem(item = {}) {
    const usage = numericStockValue(item.last30DaysUsage)
    const quantity = numericStockValue(item.quantity)
    return Boolean(item?.isActive && !item?.deletedAt && usage > 0 && quantity < usage)
  }

  const lowStockItems = computed(() => items.value.filter(isLowStockItem))

  const itemsByCategory = computed(() => {
    return {
      powder: items.value.filter((i) => i.isActive && !i.deletedAt && normalizeInventoryCategory(i.category) === 'powder'),
      raw_herbs: items.value.filter((i) => i.isActive && !i.deletedAt && normalizeInventoryCategory(i.category) === 'raw_herbs'),
      pills: items.value.filter((i) => i.isActive && !i.deletedAt && normalizeInventoryCategory(i.category) === 'pills'),
    }
  })

  async function addItem(data) {
    const quantityPerMainUnit = data.quantityPerMainUnit || data.gramsPerPacket || null
    const newItem = {
      ...data,
      quantity: data.quantity || 0,
      pricePerUnit: data.pricePerUnit || 0,
      supplier: data.supplier || '',
      supplierId: data.supplierId || null,
      gramsPerPacket: quantityPerMainUnit,
      quantityPerMainUnit,
      minStockLevel: data.minStockLevel || 10,
      branchId: data.branchId || null,
      isActive: true,
    }
    const created = normalizeInventoryItem(await inventoryApi.create(newItem))
    items.value.push(created)
    saveState()
    // 从后端重新刷新确保数据一致性
    await refreshFromApi()
    return created
  }

  async function updateItem(id, updates) {
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx !== -1) {
      const updated = normalizeInventoryItem(await inventoryApi.update(id, updates))
      items.value[idx] = updated
      saveState()
      // 从后端重新刷新确保数据一致性
      await refreshFromApi()
      return updated
    }
    return null
  }

  async function deleteItem(id) {
    const updated = normalizeInventoryItem(await inventoryApi.softDelete(id))
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx !== -1) items.value[idx] = updated
    saveState()
    await refreshFromApi()
  }

  async function restoreItem(id) {
    const updated = normalizeInventoryItem(await inventoryApi.restore(id))
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx !== -1) items.value[idx] = updated
    saveState()
    await refreshFromApi()
  }

  async function physicalDeleteItem(id) {
    await inventoryApi.hardDelete(id)
    items.value = items.value.filter((i) => i.id !== id)
    saveState()
    return true
  }

  const deletedItems = computed(() => items.value.filter((i) => i.deletedAt))

  function getBranchItems(branchId) {
    if (!branchId) return activeItems.value
    return activeItems.value.filter(i => i.branchId === branchId || !i.branchId)
  }

  async function adjustStock(id, delta, reason = '') {
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx === -1) return false
    const updated = normalizeInventoryItem(await inventoryApi.adjust(id, delta, reason))
    items.value[idx] = updated
    saveState()
    await refreshFromApi()
    return true
  }

  async function refreshFromApi() {
    try {
      const list = await inventoryApi.list({ includeDeleted: true })
      items.value = list.map(normalizeInventoryItem)
      saveState()
    } catch (e) {
      console.warn('库存刷新失败:', e.message)
    }
  }

  // 根据处方扣减库存
  async function deductFromPrescription(herbals, prescriptionType) {
    const result = await inventoryApi.deductPrescription(herbals, prescriptionType)
    if (result.success) {
      await refreshFromApi()
    }
    return result
  }

  // 退还库存（处方被修改或删除时）
  async function restoreFromPrescription(herbals, prescriptionType) {
    await inventoryApi.restorePrescription(herbals, prescriptionType)
    if (prescriptionType === 'none' || !herbals.length) return
    await refreshFromApi()
  }

  async function batchImport(itemsList) {
    const result = await inventoryApi.batchImport(itemsList)
    await refreshFromApi()
    return result
  }

  async function getAdjustmentHistory(itemId) {
    return await inventoryApi.adjustmentHistory(itemId)
  }

  init()

  return {
    items,
    activeItems,
    lowStockItems,
    itemsByCategory,
    deletedItems,
    isLowStockItem,
    getItem,
    findByName,
    getBranchItems,
    addItem,
    updateItem,
    deleteItem,
    restoreItem,
    physicalDeleteItem,
    adjustStock,
    refreshFromApi,
    deductFromPrescription,
    restoreFromPrescription,
    batchImport,
    getAdjustmentHistory,
  }
})
