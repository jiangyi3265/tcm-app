import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { herbDictApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'
import defaultHerbs from '../utils/herbsData.json'

export const useHerbDictStore = defineStore('herbDict', () => {
  const herbs = ref([])

  function init() {
    const stored = readStoredJson('tcm_herb_dict', []) || []
    if (stored.length > 0) {
      herbs.value = stored
    } else {
      // 首次加载：使用Excel导入的草药数据作为种子数据
      herbs.value = defaultHerbs
      saveState()
    }
  }
  function saveState() { writeStoredJson('tcm_herb_dict', herbs.value) }

  const activeHerbs = computed(() => herbs.value.filter((h) => h.isActive && !h.deletedAt))
  const deletedHerbs = computed(() => herbs.value.filter((h) => h.deletedAt))
  const categories = computed(() => [...new Set(activeHerbs.value.map((h) => h.category).filter(Boolean))])

  function getHerb(id) { return herbs.value.find((h) => h.id === id) || null }
  function findByName(name) {
    if (!name) return []
    const q = name.toLowerCase()
    return activeHerbs.value.filter((h) => h.name.toLowerCase().includes(q) || (h.pinyin && h.pinyin.toLowerCase().includes(q)))
  }

  async function addHerb(data) {
    const created = await herbDictApi.create(data)
    herbs.value.unshift(created); saveState(); return created
  }
  async function updateHerb(id, data) {
    const updated = await herbDictApi.update(id, data)
    const idx = herbs.value.findIndex((h) => h.id === id)
    if (idx !== -1) herbs.value[idx] = updated
    saveState(); return updated
  }
  async function deleteHerb(id) {
    const updated = await herbDictApi.softDelete(id)
    const idx = herbs.value.findIndex((h) => h.id === id)
    if (idx !== -1) herbs.value[idx] = updated
    saveState()
  }
  async function restoreHerb(id) {
    const updated = await herbDictApi.restore(id)
    const idx = herbs.value.findIndex((h) => h.id === id)
    if (idx !== -1) herbs.value[idx] = updated
    saveState()
  }
  async function hardDeleteHerb(id) {
    await herbDictApi.hardDelete(id)
    herbs.value = herbs.value.filter((h) => h.id !== id)
    saveState()
  }

  init()

  return { herbs, activeHerbs, deletedHerbs, categories, getHerb, findByName, addHerb, updateHerb, deleteHerb, restoreHerb, hardDeleteHerb }
})
