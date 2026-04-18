import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { inventoryApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

export const useInventoryStore = defineStore('inventory', () => {
  const items = ref([])

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

  const lowStockItems = computed(() =>
    items.value.filter((i) => i.isActive && !i.deletedAt && i.quantity <= i.minStockLevel),
  )

  const itemsByCategory = computed(() => {
    return {
      powder: items.value.filter((i) => i.isActive && !i.deletedAt && i.category === 'powder'),
      raw_herbs: items.value.filter((i) => i.isActive && !i.deletedAt && i.category === 'raw_herbs'),
      pills: items.value.filter((i) => i.isActive && !i.deletedAt && i.category === 'pills'),
    }
  })

  async function addItem(data) {
    const newItem = {
      ...data,
      quantity: data.quantity || 0,
      pricePerUnit: data.pricePerUnit || 0,
      supplier: data.supplier || '',
      supplierId: data.supplierId || null,
      gramsPerPacket: data.gramsPerPacket || null,
      minStockLevel: data.minStockLevel || 10,
      branchId: data.branchId || null,
      isActive: true,
    }
    const created = await inventoryApi.create(newItem)
    items.value.push(created)
    saveState()
    // 从后端重新刷新确保数据一致性
    await refreshFromApi()
    return created
  }

  async function updateItem(id, updates) {
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx !== -1) {
      const updated = await inventoryApi.update(id, updates)
      items.value[idx] = updated
      saveState()
      // 从后端重新刷新确保数据一致性
      await refreshFromApi()
      return updated
    }
    return null
  }

  async function deleteItem(id) {
    const updated = await inventoryApi.softDelete(id)
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx !== -1) items.value[idx] = updated
    saveState()
    await refreshFromApi()
  }

  async function restoreItem(id) {
    const updated = await inventoryApi.restore(id)
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
    const updated = await inventoryApi.adjust(id, delta, reason)
    items.value[idx] = updated
    saveState()
    await refreshFromApi()
    return true
  }

  async function refreshFromApi() {
    try {
      const list = await inventoryApi.list({ includeDeleted: true })
      items.value = list
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
