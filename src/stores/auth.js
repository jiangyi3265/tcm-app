import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { applyBootstrapToLocalStorage, authApi, bootstrapApi, usersApi } from '../utils/api'
import { clearClinicCache, getStoredItem, readStoredJson, removeStoredKey, writeStoredJson } from '../utils/storage'

const STORAGE_KEY = 'tcm_auth'
const USERS_KEY = 'tcm_users'
const TOKEN_KEY = 'tcm_token'

function normalizeUserRoles(user) {
  if (!user) return []
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles.filter(Boolean)
  if (user.role) return [user.role]
  return []
}

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref(null)
  const users = ref([])

  async function loadUsers() {
    users.value = readStoredJson(USERS_KEY, []) || []

    const token = getStoredItem(TOKEN_KEY)
    if (!token) return

    try {
      const payload = await bootstrapApi.fetch()
      applyBootstrapToLocalStorage(payload)
      users.value = readStoredJson(USERS_KEY, []) || []
    } catch {
      // Keep the cached user list if the bootstrap refresh fails.
    }
  }

  function init() {
    currentUser.value = readStoredJson(STORAGE_KEY, null)?.currentUser || null
    void loadUsers()
  }

  function saveState() {
    writeStoredJson(STORAGE_KEY, { currentUser: currentUser.value })
  }

  function saveUsers() {
    writeStoredJson(USERS_KEY, users.value)
  }

  const isLoggedIn = computed(() => !!currentUser.value)
  const roles = computed(() => normalizeUserRoles(currentUser.value))
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
      } catch {
        // Allow login to succeed even if the bootstrap refresh fails.
      }

      await loadUsers()
      return { success: true }
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : 'Login failed',
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
      return normalizeUserRoles(u).some((rawRole) => {
        const roleKey = String(rawRole).toLowerCase()
        return roleKey === 'practitioner' || roleKey === 'doctor'
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