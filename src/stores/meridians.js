import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { meridiansApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

export const useMeridiansStore = defineStore('meridians', () => {
  const meridians = ref([])

  function init() {
    meridians.value = readStoredJson('tcm_meridians', []) || []
  }
  function saveState() { writeStoredJson('tcm_meridians', meridians.value) }

  const activeMeridians = computed(() => meridians.value.filter((m) => m.isActive && !m.deletedAt))

  function getMeridian(id) { return meridians.value.find((m) => m.id === id) || null }

  async function addMeridian(data) {
    const created = await meridiansApi.create(data)
    meridians.value.push(created); saveState(); return created
  }
  async function updateMeridian(id, data) {
    const updated = await meridiansApi.update(id, data)
    const idx = meridians.value.findIndex((m) => m.id === id)
    if (idx !== -1) meridians.value[idx] = updated
    saveState(); return updated
  }
  async function deleteMeridian(id) {
    const updated = await meridiansApi.softDelete(id)
    const idx = meridians.value.findIndex((m) => m.id === id)
    if (idx !== -1) meridians.value[idx] = updated
    saveState()
  }
  async function restoreMeridian(id) {
    const updated = await meridiansApi.restore(id)
    const idx = meridians.value.findIndex((m) => m.id === id)
    if (idx !== -1) meridians.value[idx] = updated
    saveState()
  }
  async function hardDeleteMeridian(id) {
    await meridiansApi.hardDelete(id)
    meridians.value = meridians.value.filter((m) => m.id !== id)
    saveState()
  }

  const deletedMeridians = computed(() => meridians.value.filter((m) => m.deletedAt))

  init()

  return { meridians, activeMeridians, deletedMeridians, getMeridian, addMeridian, updateMeridian, deleteMeridian, restoreMeridian, hardDeleteMeridian }
})
