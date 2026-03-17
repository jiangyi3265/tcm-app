import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { applyBootstrapToLocalStorage, authApi, bootstrapApi, usersApi } from '../utils/api'
import { clearClinicCache, getStoredItem, readStoredJson, removeStoredKey, writeStoredJson } from '../utils/storage'

const STORAGE_KEY = 'tcm_auth'
const USERS_KEY = 'tcm_users'
const TOKEN_KEY = 'tcm_token'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref(null)
  const users = ref([])

  async function loadUsers() {
    users.value = []
    users.value = readStoredJson(USERS_KEY, []) || []

    const token = getStoredItem(TOKEN_KEY)
    if (token) {
      try {
        const payload = await bootstrapApi.fetch()
        applyBootstrapToLocalStorage(payload)
        users.value = readStoredJson(USERS_KEY, []) || []
      } catch (e) {
        // keep current cache if backend fails
      }
    }
  }

  // 初始化：从 localStorage 读取
  function init() {
    currentUser.value = readStoredJson(STORAGE_KEY, null)?.currentUser || null
    loadUsers()
  }

  function saveState() {
    writeStoredJson(STORAGE_KEY, { currentUser: currentUser.value })
  }

  function saveUsers() {
    writeStoredJson(USERS_KEY, users.value)
  }

  const isLoggedIn = computed(() => !!currentUser.value)
  // 多角色支持：优先使用 roles 数组，兼容单 role 字符串
  const roles = computed(() => {
    const user = currentUser.value
    if (!user) return []
    if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles
    if (user.role) return [user.role]
    return []
  })
  // 保留 role 向下兼容（取第一个角色）
  const role = computed(() => roles.value[0] || null)
  const userId = computed(() => currentUser.value?.id || null)

  async function login(email, password) {
    try {
      const result = await authApi.login(email, password)

      if (result.token) {
        localStorage.setItem(TOKEN_KEY, result.token)
      }

      currentUser.value = result.user || null
      saveState()

      try {
        const bootstrap = await bootstrapApi.fetch()
        applyBootstrapToLocalStorage(bootstrap)
      } catch (e) {
        // allow login to succeed even if bootstrap refresh temporarily fails
      }
      await loadUsers()

      return { success: true }
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : '登录失败',
      }
    }
  }

  function logout() {
    currentUser.value = null
    removeStoredKey(TOKEN_KEY)
    clearClinicCache()
    saveState()
    users.value = []
  }

  async function addUser(userData) {
    const created = await usersApi.create(userData)
    users.value.push(created)
    saveUsers()
    return created
  }

  async function updateUser(id, updates) {
    const updated = await usersApi.update(id, updates)
    const idx = users.value.findIndex((u) => u.id === id)
    if (idx !== -1) {
      users.value[idx] = updated
      saveUsers()
      if (currentUser.value?.id === id) {
        currentUser.value = { ...currentUser.value, ...updated }
        saveState()
      }
    }
    return updated
  }

  async function deleteUser(id) {
    await usersApi.remove(id)
    users.value = users.value.filter((u) => u.id !== id)
    saveUsers()
  }

  function getPractitioners() {
    return users.value.filter((u) => {
      // 多角色支持：检查 roles 数组
      const userRoles = Array.isArray(u.roles) && u.roles.length > 0
        ? u.roles
        : u.role ? [u.role] : []
      return userRoles.some(r => {
        const rl = r.toLowerCase()
        return rl === 'practitioner' || rl === 'doctor' || rl.includes('医师') || rl.includes('医生')
      })
    })
  }

  init()

  return {
    currentUser,
    users,
    isLoggedIn,
    roles,
    role,
    userId,
    login,
    logout,
    addUser,
    updateUser,
    deleteUser,
    getPractitioners,
  }
})
