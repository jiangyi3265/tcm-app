import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { FORMULA_DATABASE } from '../utils/sampleData'
import { formulasApi } from '../utils/api'
import { getStoredItem, readStoredJson, writeStoredJson } from '../utils/storage'

const TOKEN_KEY = 'tcm_token'

export const useFormulasStore = defineStore('formulas', () => {
  const formulas = ref([])
  let refreshPromise = null
  let revision = 0

  function upsertFormula(formula) {
    revision += 1
    const index = formulas.value.findIndex((item) => item.id === formula.id)
    if (index === -1) formulas.value.unshift(formula)
    else formulas.value[index] = formula
    saveState()
  }

  async function loadFormula(id) {
    const formula = await formulasApi.get(id)
    upsertFormula(formula)
    return formula
  }

  function init() {
    const saved = readStoredJson('tcm_formulas', null)
    if (Array.isArray(saved)) {
      formulas.value = saved
    } else {
      formulas.value = convertLegacy()
      saveState()
    }
    if (getStoredItem(TOKEN_KEY)) {
      refreshFromApi().catch(() => {})
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
    upsertFormula(created)
    return created
  }

  async function updateFormula(id, data) {
    const updated = await formulasApi.update(id, data)
    upsertFormula(updated)
    return updated
  }

  async function deleteFormula(id) {
    const updated = await formulasApi.softDelete(id)
    upsertFormula(updated)
  }

  async function restoreFormula(id) {
    const updated = await formulasApi.restore(id)
    upsertFormula(updated)
  }

  async function hardDeleteFormula(id) {
    await formulasApi.hardDelete(id)
    revision += 1
    formulas.value = formulas.value.filter((f) => f.id !== id)
    saveState()
  }

  async function refreshFromApi({ force = false } = {}) {
    if (force) revision += 1
    if (refreshPromise && !force) return refreshPromise
    const requestRevision = revision
    const pending = formulasApi.list().then((list) => {
      if (requestRevision !== revision) return
      formulas.value = list
      saveState()
    }).catch((error) => {
      console.warn('方剂刷新失败:', error.message)
    }).finally(() => { if (refreshPromise === pending) refreshPromise = null })
    refreshPromise = pending
    return pending
  }

  const deletedFormulas = computed(() => formulas.value.filter((f) => f.deletedAt))

  init()

  return {
    formulas,
    activeFormulas,
    deletedFormulas,
    getFormula,
    loadFormula,
    findByName,
    addFormula,
    updateFormula,
    deleteFormula,
    restoreFormula,
    hardDeleteFormula,
    refreshFromApi,
  }
})
