<script setup>
import { ref, computed, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { setLocale, getLocale } from '../../i18n'
import { useAuthStore } from '../../stores/auth'
import { useInventoryStore } from '../../stores/inventory'
import { useBranchesStore } from '../../stores/branches'
import { authApi } from '../../utils/api'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const inventoryStore = useInventoryStore()
const branchesStore = useBranchesStore()
const toggleSidebar = inject('toggleSidebar', () => {})
const sidebarCollapsed = inject('sidebarCollapsed', ref(false))
const isMobile = inject('isMobile', ref(false))

const lowStockCount = computed(() => inventoryStore.lowStockItems.length)

const breadcrumbKeys = {
  '/dashboard': 'nav.dashboard',
  '/patients': 'nav.patients',
  '/appointments': 'nav.appointments',
  '/inventory': 'nav.inventory',
  '/pharmacy': 'nav.pharmacy',
  '/cashier': 'nav.cashier',
  '/statistics': 'nav.statistics',
  '/audit-logs': 'nav.auditLogs',
  '/admin': 'nav.admin',
}

// Password change
const showPasswordDialog = ref(false)
const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })
const changingPwd = ref(false)

// Prescription preference
const showPreferenceDialog = ref(false)
const preferenceForm = ref({ prescriptionPreference: '' })

function openPreferenceDialog() {
  preferenceForm.value.prescriptionPreference = authStore.currentUser?.prescriptionPreference || ''
  showPreferenceDialog.value = true
}

async function savePreference() {
  try {
    await authStore.updateUser(authStore.currentUser.id, {
      prescriptionPreference: preferenceForm.value.prescriptionPreference,
    })
    showPreferenceDialog.value = false
    ElMessage.success(t('header.preferenceSaved'))
  } catch (e) {
    ElMessage.error(e?.message || t('header.preferenceSaveFailed'))
  }
}

async function handleChangePassword() {
  if (!passwordForm.value.oldPassword || !passwordForm.value.newPassword) {
    return ElMessage.warning(t('header.fillOldAndNew'))
  }
  if (passwordForm.value.newPassword.length < 8) {
    return ElMessage.warning(t('header.passwordTooShort'))
  }
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    return ElMessage.warning(t('header.passwordMismatch'))
  }
  try {
    changingPwd.value = true
    await authApi.changePassword(passwordForm.value.oldPassword, passwordForm.value.newPassword)
    ElMessage.success(t('header.passwordChanged'))
    showPasswordDialog.value = false
    passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  } catch (e) {
    ElMessage.error(e?.message || t('header.passwordChangeFailed'))
  } finally {
    changingPwd.value = false
  }
}

const breadcrumb = computed(() => {
  const path = route.path
  for (const [key, labelKey] of Object.entries(breadcrumbKeys)) {
    if (path.startsWith(key)) return t(labelKey)
  }
  return t('app.name')
})

async function handleLogout() {
  try {
    await ElMessageBox.confirm(t('header.logoutConfirm'), t('header.logoutTitle'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    authStore.logout()
    router.push('/login')
  } catch (_) {}
}

const currentLang = computed(() => getLocale())

function toggleLang() {
  const next = currentLang.value === 'zh-CN' ? 'en' : 'zh-CN'
  setLocale(next)
  window.location.reload()
}

function handleCommand(command) {
  if (command === 'logout') handleLogout()
  if (command === 'change-password') showPasswordDialog.value = true
  if (command === 'preference') openPreferenceDialog()
}
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <el-button class="hamburger-btn" text @click="toggleSidebar">
        <el-icon :size="20"><Fold v-if="!sidebarCollapsed" /><Expand v-else /></el-icon>
      </el-button>
      <span class="page-title">{{ breadcrumb }}</span>
    </div>
    <div class="header-center">
      <el-select
        :model-value="branchesStore.currentBranchId"
        @update:model-value="branchesStore.setCurrentBranch($event)"
        :placeholder="t('header.allBranches')"
        clearable
        size="small"
        style="width: 160px"
      >
        <el-option
          v-for="b in branchesStore.activeBranches"
          :key="b.id"
          :label="b.name"
          :value="b.id"
        />
      </el-select>
    </div>
    <div class="header-right">
      <!-- 低库存警告 -->
      <el-tooltip
        v-if="lowStockCount > 0"
        :content="t('header.lowStockWarning', { count: lowStockCount })"
        placement="bottom"
      >
        <el-badge :value="lowStockCount" class="badge-item">
          <el-button
            circle
            size="small"
            type="warning"
            :icon="'Warning'"
            @click="$router.push('/inventory')"
          />
        </el-badge>
      </el-tooltip>

      <el-tooltip :content="t('header.langSwitch')" placement="bottom">
        <el-button circle size="small" @click="toggleLang">
          {{ currentLang === 'zh-CN' ? 'EN' : '中' }}
        </el-button>
      </el-tooltip>

      <el-dropdown @command="handleCommand">
        <div class="user-avatar-btn">
          <el-avatar :size="32" style="background: var(--color-primary)">
            {{ authStore.currentUser?.name?.charAt(0) }}
          </el-avatar>
          <span class="header-username">{{ authStore.currentUser?.name }}</span>
          <el-icon><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="preference">
              <el-icon><Setting /></el-icon> {{ t('header.rxPreference') }}
            </el-dropdown-item>
            <el-dropdown-item command="change-password">
              <el-icon><Lock /></el-icon> {{ t('header.changePassword') }}
            </el-dropdown-item>
            <el-dropdown-item command="logout" divided>
              <el-icon><SwitchButton /></el-icon> {{ t('header.logout') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- 密码修改对话框 -->
      <el-dialog v-model="showPasswordDialog" :title="t('header.changePasswordTitle')" width="400px" :close-on-click-modal="false">
        <el-form :model="passwordForm" label-width="90px">
          <el-form-item :label="t('header.oldPassword')" required>
            <el-input v-model="passwordForm.oldPassword" type="password" show-password :placeholder="t('header.oldPasswordPh')" />
          </el-form-item>
          <el-form-item :label="t('header.newPassword')" required>
            <el-input v-model="passwordForm.newPassword" type="password" show-password :placeholder="t('header.newPasswordPh')" />
          </el-form-item>
          <el-form-item :label="t('header.confirmPassword')" required>
            <el-input v-model="passwordForm.confirmPassword" type="password" show-password :placeholder="t('header.confirmPasswordPh')" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showPasswordDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="changingPwd" @click="handleChangePassword">{{ t('header.confirmChange') }}</el-button>
        </template>
      </el-dialog>

      <!-- 处方偏好设置对话框 -->
      <el-dialog v-model="showPreferenceDialog" :title="t('header.rxPreferenceTitle')" width="380px" :close-on-click-modal="false">
        <el-form :model="preferenceForm" label-width="120px">
          <el-form-item :label="t('header.defaultRxType')">
            <el-radio-group v-model="preferenceForm.prescriptionPreference">
              <el-radio-button value="powder">Powder</el-radio-button>
              <el-radio-button value="raw_herbs">Raw Herbs</el-radio-button>
              <el-radio-button value="pills">Pills</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showPreferenceDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="savePreference">{{ t('common.save') }}</el-button>
        </template>
      </el-dialog>
    </div>
  </header>
</template>


<style scoped>
.app-header {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.header-center {
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.badge-item {
  cursor: pointer;
}

.user-avatar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.user-avatar-btn:hover {
  background: #f5f5f5;
}

.header-username {
  font-size: 14px;
  color: #333;
}

.hamburger-btn {
  padding: 4px;
  margin-right: 4px;
}

@media (max-width: 767px) {
  .header-center {
    display: none;
  }
  .header-username {
    display: none;
  }
  .page-title {
    font-size: 14px;
  }
  .header-right {
    gap: 8px;
  }
}
</style>
