import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { branchesApi } from '../utils/api'
import { readStoredJson, writeStoredJson } from '../utils/storage'

export const useBranchesStore = defineStore('branches', () => {
  const branches = ref([])
  const currentBranchId = ref(null) // null = 全部分店

  function init() {
    const data = readStoredJson('tcm_branches', null)
    branches.value = data?.branches || []
    currentBranchId.value = data?.currentBranchId || null
  }

  function saveState() {
    writeStoredJson('tcm_branches', {
      branches: branches.value,
      currentBranchId: currentBranchId.value,
    })
  }

  function getBranch(id) {
    return branches.value.find(b => b.id === id) || null
  }

  const activeBranches = computed(() => branches.value.filter(b => b.isActive))

  const currentBranch = computed(() => {
    if (!currentBranchId.value) return null
    return branches.value.find(b => b.id === currentBranchId.value) || null
  })

  const mainBranch = computed(() => branches.value.find(b => b.isMain))

  function setCurrentBranch(branchId) {
    currentBranchId.value = branchId
    saveState()
  }

  async function createBranch(data) {
    const newBranch = {
      name: data.name,
      code: data.code || '',
      address: data.address || '',
      phone: data.phone || '',
      email: data.email || '',
      managerId: data.managerId || null,
      isActive: true,
      isMain: false,
      roomIds: data.roomIds || [],
      createdAt: new Date().toISOString(),
    }
    const created = await branchesApi.create(newBranch)
    branches.value.push(created)
    saveState()
    return created
  }

  async function updateBranch(id, updates) {
    const idx = branches.value.findIndex(b => b.id === id)
    if (idx !== -1) {
      const updated = await branchesApi.update(id, updates)
      branches.value[idx] = updated
      saveState()
      return updated
    }
    return null
  }

  async function toggleBranch(id) {
    const idx = branches.value.findIndex(b => b.id === id)
    if (idx !== -1) {
      const updated = await branchesApi.toggle(id)
      branches.value[idx] = updated
      saveState()
    }
  }

  async function deleteBranch(id) {
    const branch = branches.value.find(b => b.id === id)
    if (branch?.isMain) return false
    const idx = branches.value.findIndex(b => b.id === id)
    if (idx !== -1) {
      await branchesApi.remove(id)
      branches.value.splice(idx, 1)
      saveState()
    }
    return true
  }

  // 过滤辅助方法：根据当前分店过滤数据
  function filterByBranch(items) {
    if (!currentBranchId.value) return items
    return items.filter(item => item.branchId === currentBranchId.value || !item.branchId)
  }

  init()

  return {
    branches,
    currentBranchId,
    activeBranches,
    currentBranch,
    mainBranch,
    getBranch,
    setCurrentBranch,
    createBranch,
    updateBranch,
    toggleBranch,
    deleteBranch,
    filterByBranch,
  }
})
