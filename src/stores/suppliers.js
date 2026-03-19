import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { suppliersApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'
import { DEMO_SUPPLIERS } from '../utils/sampleData'

export const useSuppliersStore = defineStore('suppliers', () => {
  const suppliers = ref([])

  function init() {
    const saved = readStoredJson('tcm_suppliers', []) || []
    if (saved.length > 0) {
      suppliers.value = saved
    } else {
      // 首次启动时加载演示供应商数据
      suppliers.value = DEMO_SUPPLIERS.map(s => ({ ...s }))
      saveState()
    }
  }

  function saveState() {
    writeStoredJson('tcm_suppliers', suppliers.value)
  }

  const activeSuppliers = computed(() =>
    suppliers.value.filter((s) => s.isActive && !s.deletedAt),
  )

  function getSupplier(id) {
    return suppliers.value.find((s) => s.id === id) || null
  }

  function findByName(name) {
    if (!name) return []
    const q = name.toLowerCase()
    return activeSuppliers.value.filter((s) => s.name.toLowerCase().includes(q))
  }

  async function addSupplier(data) {
    const created = await suppliersApi.create(data)
    suppliers.value.push(created)
    saveState()
    return created
  }

  async function updateSupplier(id, data) {
    const updated = await suppliersApi.update(id, data)
    const idx = suppliers.value.findIndex((s) => s.id === id)
    if (idx !== -1) suppliers.value[idx] = updated
    saveState()
    return updated
  }

  async function deleteSupplier(id) {
    const updated = await suppliersApi.softDelete(id)
    const idx = suppliers.value.findIndex((s) => s.id === id)
    if (idx !== -1) suppliers.value[idx] = updated
    saveState()
  }

  async function restoreSupplier(id) {
    const updated = await suppliersApi.restore(id)
    const idx = suppliers.value.findIndex((s) => s.id === id)
    if (idx !== -1) suppliers.value[idx] = updated
    saveState()
  }

  async function hardDeleteSupplier(id) {
    await suppliersApi.hardDelete(id)
    suppliers.value = suppliers.value.filter((s) => s.id !== id)
    saveState()
  }

  const deletedSuppliers = computed(() => suppliers.value.filter((s) => s.deletedAt))

  init()

  return {
    suppliers,
    activeSuppliers,
    deletedSuppliers,
    getSupplier,
    findByName,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    restoreSupplier,
    hardDeleteSupplier,
  }
})
