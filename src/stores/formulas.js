import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { FORMULA_DATABASE } from '../utils/sampleData'
import { formulasApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

export const useFormulasStore = defineStore('formulas', () => {
  const formulas = ref([])

  function init() {
    const saved = readStoredJson('tcm_formulas', null)
    if (saved) {
      formulas.value = saved
    } else {
      formulas.value = convertLegacy()
      saveState()
    }
  }

  /** Convert the old hardcoded FORMULA_DATABASE to the new format */
  function convertLegacy() {
    return FORMULA_DATABASE.map((f, i) => ({
      id: `legacy-formula-${i + 1}`,
      name: f.name,
      category: '',
      description: '',
      source: '',
      isActive: true,
      items: f.herbs.map((h, j) => ({
        herbName: h.name,
        dosage: h.dosage,
        unit: 'g',
        sortOrder: j + 1,
        notes: '',
      })),
    }))
  }

  function saveState() {
    writeStoredJson('tcm_formulas', formulas.value)
  }

  const activeFormulas = computed(() =>
    formulas.value.filter((f) => f.isActive && !f.deletedAt),
  )

  function getFormula(id) {
    return formulas.value.find((f) => f.id === id) || null
  }

  function findByName(name) {
    if (!name) return []
    const q = name.toLowerCase()
    return activeFormulas.value.filter((f) => f.name.toLowerCase().includes(q))
  }

  async function addFormula(data) {
    const created = await formulasApi.create(data)
    formulas.value.push(created)
    saveState()
    // 从后端重新刷新确保数据一致性
    refreshFromApi().catch(() => {})
    return created
  }

  async function updateFormula(id, data) {
    const updated = await formulasApi.update(id, data)
    const idx = formulas.value.findIndex((f) => f.id === id)
    if (idx !== -1) formulas.value[idx] = updated
    saveState()
    // 从后端重新刷新确保数据一致性
    refreshFromApi().catch(() => {})
    return updated
  }

  async function deleteFormula(id) {
    const updated = await formulasApi.softDelete(id)
    const idx = formulas.value.findIndex((f) => f.id === id)
    if (idx !== -1) formulas.value[idx] = updated
    saveState()
  }

  async function restoreFormula(id) {
    const updated = await formulasApi.restore(id)
    const idx = formulas.value.findIndex((f) => f.id === id)
    if (idx !== -1) formulas.value[idx] = updated
    saveState()
  }

  async function hardDeleteFormula(id) {
    await formulasApi.hardDelete(id)
    formulas.value = formulas.value.filter((f) => f.id !== id)
    saveState()
  }

  async function refreshFromApi() {
    try {
      const list = await formulasApi.list()
      formulas.value = list
      saveState()
    } catch (e) {
      console.warn('方剂刷新失败:', e.message)
    }
  }

  const deletedFormulas = computed(() => formulas.value.filter((f) => f.deletedAt))

  init()

  return {
    formulas,
    activeFormulas,
    deletedFormulas,
    getFormula,
    findByName,
    addFormula,
    updateFormula,
    deleteFormula,
    restoreFormula,
    hardDeleteFormula,
    refreshFromApi,
  }
})
