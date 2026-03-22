import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { unitConversionsApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

export const useUnitConversionsStore = defineStore('unitConversions', () => {
  const conversions = ref([])

  function init() {
    conversions.value = readStoredJson('tcm_unit_conversions', []) || []
  }

  function saveState() {
    writeStoredJson('tcm_unit_conversions', conversions.value)
  }

  /** Get all unique unit names */
  const allUnits = computed(() => {
    const units = new Set()
    conversions.value.forEach((c) => {
      units.add(c.fromUnit)
      units.add(c.toUnit)
    })
    return [...units].sort()
  })

  /** Convert a value between units; returns null if no conversion found */
  function convert(fromUnit, toUnit, value) {
    if (fromUnit === toUnit) return value
    const direct = conversions.value.find((r) => r.fromUnit === fromUnit && r.toUnit === toUnit)
    if (direct) return value * direct.factor
    // try reverse lookup
    const reverse = conversions.value.find((r) => r.fromUnit === toUnit && r.toUnit === fromUnit)
    if (reverse && reverse.factor !== 0) return value / reverse.factor
    return null
  }

  async function addConversion(data) {
    const created = await unitConversionsApi.create(data)
    conversions.value.push(created)
    saveState()
    return created
  }

  async function updateConversion(id, data) {
    const updated = await unitConversionsApi.update(id, data)
    const idx = conversions.value.findIndex((c) => c.id === id)
    if (idx !== -1) conversions.value[idx] = updated
    saveState()
    return updated
  }

  async function removeConversion(id) {
    await unitConversionsApi.remove(id)
    conversions.value = conversions.value.filter((c) => c.id !== id)
    saveState()
  }

  init()

  return {
    conversions,
    allUnits,
    convert,
    addConversion,
    updateConversion,
    removeConversion,
  }
})
