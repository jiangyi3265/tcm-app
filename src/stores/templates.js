import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { templatesApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

export const useTemplatesStore = defineStore('templates', () => {
  const templates = ref([])

  function init() {
    templates.value = readStoredJson('tcm_templates', []) || []
  }
  function saveState() { writeStoredJson('tcm_templates', templates.value) }

  const activeTemplates = computed(() => templates.value.filter((t) => t.isActive && !t.deletedAt))

  function getTemplate(id) { return templates.value.find((t) => t.id === id) || null }

  async function addTemplate(data) {
    const created = await templatesApi.create(data)
    templates.value.push(created); saveState(); return created
  }
  async function updateTemplate(id, data) {
    const updated = await templatesApi.update(id, data)
    const idx = templates.value.findIndex((t) => t.id === id)
    if (idx !== -1) templates.value[idx] = updated
    saveState(); return updated
  }
  async function deleteTemplate(id) {
    const updated = await templatesApi.softDelete(id)
    const idx = templates.value.findIndex((t) => t.id === id)
    if (idx !== -1) templates.value[idx] = updated
    saveState()
  }
  async function restoreTemplate(id) {
    const updated = await templatesApi.restore(id)
    const idx = templates.value.findIndex((t) => t.id === id)
    if (idx !== -1) templates.value[idx] = updated
    saveState()
  }
  async function hardDeleteTemplate(id) {
    await templatesApi.hardDelete(id)
    templates.value = templates.value.filter((t) => t.id !== id)
    saveState()
  }

  const deletedTemplates = computed(() => templates.value.filter((t) => t.deletedAt))

  init()

  return { templates, activeTemplates, deletedTemplates, getTemplate, addTemplate, updateTemplate, deleteTemplate, restoreTemplate, hardDeleteTemplate }
})
