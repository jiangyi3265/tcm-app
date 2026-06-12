import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { acupointsApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'
import defaultAcupoints from '../utils/acupointsData.json'
import { getActiveAcupoints, normalizeAcupointList } from '../utils/acupoints'

export const useAcupointsStore = defineStore('acupoints', () => {
  const acupoints = ref([])

  function init() {
    const stored = normalizeAcupointList(readStoredJson('tcm_acupoints', []))
    if (stored.length > 0) {
      acupoints.value = stored
    } else {
      // 首次加载：使用Excel导入的穴位数据作为种子数据
      acupoints.value = defaultAcupoints
      saveState()
    }
  }

  function saveState() {
    writeStoredJson('tcm_acupoints', acupoints.value)
  }

  const activeAcupoints = computed(() => getActiveAcupoints(acupoints.value))

  /** Get flat list of active acupoint names (for backward compat with ACUPUNCTURE_POINTS) */
  const acupointNames = computed(() => activeAcupoints.value.map((a) => a.name))

  function getAcupoint(id) {
    return normalizeAcupointList(acupoints.value).find((a) => a.id === id) || null
  }

  function findByName(name) {
    if (!name) return []
    const q = name.toLowerCase()
    return activeAcupoints.value.filter(
      (a) => a.name.toLowerCase().includes(q) || (a.pinyin && a.pinyin.toLowerCase().includes(q)),
    )
  }

  async function addAcupoint(data) {
    const created = await acupointsApi.create(data)
    acupoints.value = [created, ...normalizeAcupointList(acupoints.value)]
    saveState()
    return created
  }

  async function updateAcupoint(id, data) {
    const updated = await acupointsApi.update(id, data)
    const list = normalizeAcupointList(acupoints.value)
    const idx = list.findIndex((a) => a.id === id)
    if (idx !== -1) {
      list[idx] = updated
      acupoints.value = list
    }
    saveState()
    return updated
  }

  async function deleteAcupoint(id) {
    const updated = await acupointsApi.softDelete(id)
    const list = normalizeAcupointList(acupoints.value)
    const idx = list.findIndex((a) => a.id === id)
    if (idx !== -1) {
      list[idx] = updated
      acupoints.value = list
    }
    saveState()
  }

  async function restoreAcupoint(id) {
    const updated = await acupointsApi.restore(id)
    const list = normalizeAcupointList(acupoints.value)
    const idx = list.findIndex((a) => a.id === id)
    if (idx !== -1) {
      list[idx] = updated
      acupoints.value = list
    }
    saveState()
  }

  async function hardDeleteAcupoint(id) {
    await acupointsApi.hardDelete(id)
    acupoints.value = normalizeAcupointList(acupoints.value).filter((a) => a.id !== id)
    saveState()
  }

  const deletedAcupoints = computed(() => normalizeAcupointList(acupoints.value).filter((a) => a.deletedAt))

  init()

  return {
    acupoints,
    activeAcupoints,
    acupointNames,
    deletedAcupoints,
    getAcupoint,
    findByName,
    addAcupoint,
    updateAcupoint,
    deleteAcupoint,
    restoreAcupoint,
    hardDeleteAcupoint,
  }
})
