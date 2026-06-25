import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { naturalCompareText } from '../utils/naturalSort'
import { authApi, setAuthToken, usersApi } from '../utils/api'
import { clearClinicCache, getStoredItem, readStoredJson, writeStoredJson } from '../utils/storage'

const STORAGE_KEY = 'tcm_auth'
const USERS_KEY = 'tcm_users'
const TOKEN_KEY = 'tcm_token'

function normalizeUserRoles(user) {
  if (!user) return []
  const rawRoles = Array.isArray(user.roles) && user.roles.length > 0
    ? user.roles
    : user.role ? [user.role] : []
  const priority = ['admin', 'practitioner', 'cashier', 'pharmacist', 'apprentice']
  return [...new Set(rawRoles
    .map((role) => {
      const normalized = String(role || '').trim().toLowerCase()
      return normalized === 'doctor' ? 'practitioner' : normalized
    })
    .filter(Boolean))]
    .sort((left, right) => {
      const leftIndex = priority.includes(left) ? priority.indexOf(left) : priority.length
      const rightIndex = priority.includes(right) ? priority.indexOf(right) : priority.length
      if (leftIndex !== rightIndex) return leftIndex - rightIndex
      return left.localeCompare(right)
    })
}

function hasUserRole(user, roleKey) {
  return normalizeUserRoles(user).map((role) => String(role).toLowerCase()).includes(roleKey)
}

function resolvePractitionerSortOrder(user) {
  const sortOrder = Number(user?.practitionerSortOrder)
  return Number.isFinite(sortOrder) ? sortOrder : Number.MAX_SAFE_INTEGER
}

function comparePractitioners(left, right) {
  const sortDiff = resolvePractitionerSortOrder(left) - resolvePractitionerSortOrder(right)
  if (sortDiff !== 0) return sortDiff
  const nameDiff = naturalCompareText(left?.name, right?.name)
  if (nameDiff !== 0) return nameDiff
  return naturalCompareText(left?.id, right?.id)
}

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref(null)
  const users = ref([])
  let usersRefreshPromise = null

  async function loadUsers({ background = false } = {}) {
    users.value = readStoredJson(USERS_KEY, []) || []
    mergeCurrentUserFromUsers()

    const token = getStoredItem(TOKEN_KEY)
    if (!token) return

    if (!usersRefreshPromise) {
      usersRefreshPromise = (async () => {
        const list = await usersApi.list()
        users.value = Array.isArray(list)
          ? list
          : readStoredJson(USERS_KEY, []) || []
        saveUsers()
        mergeCurrentUserFromUsers()
      })()
        .catch(() => {
          // Keep the cached user list if the bootstrap refresh fails.
        })
        .finally(() => {
          usersRefreshPromise = null
        })
    }

    if (background) {
      void usersRefreshPromise
      return
    }
    await usersRefreshPromise
  }

  function init() {
    currentUser.value = readStoredJson(STORAGE_KEY, null)?.currentUser || null
    void loadUsers({ background: true })
  }

  function saveState() {
    writeStoredJson(STORAGE_KEY, { currentUser: currentUser.value })
  }

  function saveUsers() {
    writeStoredJson(USERS_KEY, users.value)
  }

  function mergeCurrentUserFromUsers() {
    if (!currentUser.value?.id) return
    const matched = users.value.find((user) => String(user.id) === String(currentUser.value.id))
    if (!matched) return
    currentUser.value = { ...currentUser.value, ...matched }
    saveState()
  }

  const isLoggedIn = computed(() => !!currentUser.value)
  const roles = computed(() => normalizeUserRoles(currentUser.value))
  const role = computed(() => roles.value[0] || null)
  const userId = computed(() => currentUser.value?.id || null)

  async function login(email, password) {
    try {
      const result = await authApi.login(email, password)

      if (result.token) {
        setAuthToken(result.token)
      }

      currentUser.value = result.user || null
      saveState()

      if (result.user?.id && !users.value.some((user) => String(user.id) === String(result.user.id))) {
        users.value = [result.user, ...users.value]
        saveUsers()
      }

      void loadUsers({ background: true })
      if (hasUserRole(currentUser.value, 'apprentice')) {
        void (async () => {
          try {
            const updated = await usersApi.recordApprenticeSession('login')
            syncUser(updated)
          } catch {
            // Tracking should not block login.
          }
        })()
      }
      return { success: true }
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : 'Login failed',
      }
    }
  }

  function logout() {
    if (hasUserRole(currentUser.value, 'apprentice')) {
      void usersApi.recordApprenticeSession('logout').catch(() => {})
    }
    currentUser.value = null
    setAuthToken(null)
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
    const merged = { ...(updates || {}), ...(updated || {}) }
    // Preserve UI-only fields the backend may strip (color/overlap1/overlap2/regulatoryBody/registrationNumber)
    ;[
      'color',
      'overlap1',
      'overlap2',
      'regulatoryBody',
      'registrationNumber',
      'organization',
      'organizationNumber',
      'dripEnabled',
      'signature',
    ].forEach((key) => {
      if (updates && Object.prototype.hasOwnProperty.call(updates, key) && (merged[key] === undefined || merged[key] === null)) {
        merged[key] = updates[key]
      }
    })
    const idx = users.value.findIndex((u) => String(u.id) === String(id))
    if (idx !== -1) {
      users.value[idx] = merged
      saveUsers()
      if (String(currentUser.value?.id) === String(id)) {
        currentUser.value = { ...currentUser.value, ...merged }
        saveState()
      }
    }
    return merged
  }

  function syncUser(user) {
    if (!user?.id) return null
    const idx = users.value.findIndex((item) => String(item.id) === String(user.id))
    if (idx === -1) {
      users.value.push(user)
    } else {
      users.value[idx] = user
    }
    saveUsers()
    if (String(currentUser.value?.id) === String(user.id)) {
      currentUser.value = { ...currentUser.value, ...user }
      saveState()
    }
    return user
  }

  async function deleteUser(id) {
    await usersApi.remove(id)
    users.value = users.value.filter((u) => u.id !== id)
    saveUsers()
  }

  function getPractitioners() {
    return users.value
      .filter((u) => {
        return normalizeUserRoles(u).some((rawRole) => {
          const roleKey = String(rawRole).toLowerCase()
          return roleKey === 'practitioner' || roleKey === 'doctor'
        })
      })
      .slice()
      .sort(comparePractitioners)
  }

  function getUserById(id) {
    return users.value.find((user) => String(user.id) === String(id)) || null
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
    syncUser,
    deleteUser,
    getUserById,
    getPractitioners,
  }
})
