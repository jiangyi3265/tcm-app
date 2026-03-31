<script setup>
import { computed, inject } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth'
import { useBranchesStore } from '../../stores/branches'
import { canAccess } from '../../utils/permissions'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
  mobile: { type: Boolean, default: false },
})

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const branchesStore = useBranchesStore()
const toggleSidebar = inject('toggleSidebar', () => {})

const roles = computed(() => authStore.roles)
const user = computed(() => authStore.currentUser)

const menuItems = [
  { path: '/dashboard', icon: 'Odometer', labelKey: 'nav.dashboard', module: 'dashboard' },
  { path: '/patients', icon: 'User', labelKey: 'nav.patients', module: 'patients', inactiveNames: ['consultation-new', 'consultation-detail'] },
  { path: '/consultations', icon: 'Memo', labelKey: 'nav.consultations', module: 'consultations', activeNames: ['consultation-list', 'consultation-new', 'consultation-detail'] },
  { path: '/appointments', icon: 'Calendar', labelKey: 'nav.appointments', module: 'appointments' },
  { path: '/inventory', icon: 'Box', labelKey: 'nav.inventory', module: 'inventory' },
  { path: '/formulas', icon: 'Collection', labelKey: 'nav.formulas', module: 'formulas' },
  { path: '/pharmacy', icon: 'FirstAidKit', labelKey: 'nav.pharmacy', module: 'pharmacy' },
  { path: '/cashier', icon: 'Money', labelKey: 'nav.cashier', module: 'cashier' },
  { path: '/statistics', icon: 'TrendCharts', labelKey: 'nav.statistics', module: 'statistics' },
  { path: '/audit-logs', icon: 'Document', labelKey: 'nav.auditLogs', module: 'audit-logs' },
  { path: '/admin', icon: 'Setting', labelKey: 'nav.admin', module: 'admin' },
]

const visibleMenus = computed(() =>
  menuItems.filter((item) => canAccess(roles.value, item.module)),
)

function navigate(path) {
  router.push(path)
  if (props.mobile) toggleSidebar()
}

function isActive(item) {
  const currentName = route.name ? String(route.name) : ''
  if (Array.isArray(item.inactiveNames) && item.inactiveNames.includes(currentName)) return false
  if (Array.isArray(item.activeNames) && item.activeNames.includes(currentName)) return true
  return route.path.startsWith(item.path)
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: collapsed && !mobile, 'mobile-hidden': mobile && collapsed, 'mobile-show': mobile && !collapsed }">
    <div class="sidebar-logo">
      <el-icon class="logo-icon"><FirstAidKit /></el-icon>
      <span class="logo-text">{{ t('app.name') }}</span>
    </div>

    <nav class="sidebar-nav">
      <div
        v-for="item in visibleMenus"
        :key="item.path"
        class="nav-item"
        :class="{ active: isActive(item) }"
        @click="navigate(item.path)"
      >
        <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
        <span class="nav-label">{{ t(item.labelKey) }}</span>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div v-if="branchesStore.currentBranch" class="branch-info">
        <el-icon style="color: #52b788; font-size: 14px"><OfficeBuilding /></el-icon>
        <span class="branch-name">{{ branchesStore.currentBranch.name }}</span>
      </div>
      <div class="user-info">
        <el-avatar :size="36" style="background: #40916c; flex-shrink: 0">
          {{ user?.name?.charAt(0) }}
        </el-avatar>
        <div class="user-details">
          <div class="user-name">{{ user?.name }}</div>
          <el-tag v-for="r in roles" :key="r" size="small" type="info" style="font-size: 11px; margin-right: 2px">
            {{ t('roles.' + r) }}
          </el-tag>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 220px;
  min-width: 220px;
  background-color: var(--color-sidebar-bg);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  transition: width 0.3s, min-width 0.3s, transform 0.3s;
}

.sidebar.collapsed {
  width: 64px;
  min-width: 64px;
}

.sidebar.collapsed .logo-text,
.sidebar.collapsed .nav-label,
.sidebar.collapsed .user-details,
.sidebar.collapsed .branch-name {
  display: none;
}

.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 12px 0;
}

.sidebar.collapsed .sidebar-logo {
  justify-content: center;
}

@media (max-width: 767px) {
  .sidebar {
    position: fixed;
    z-index: 999;
    left: 0;
    top: 0;
    width: 220px;
    min-width: 220px;
  }
  .sidebar.mobile-hidden {
    transform: translateX(-100%);
  }
  .sidebar.mobile-show {
    transform: translateX(0);
  }
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo-icon {
  font-size: 28px;
  color: #52b788;
}

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: #d8f3dc;
  letter-spacing: 1px;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 0;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: var(--color-sidebar-text);
  border-left: 3px solid transparent;
}

.nav-item:hover {
  background-color: var(--color-sidebar-hover);
}

.nav-item.active {
  background-color: var(--color-sidebar-active);
  border-left-color: #52b788;
  color: #fff;
}

.nav-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.nav-label {
  font-size: 14px;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 13px;
  color: #d8f3dc;
  font-weight: 600;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.branch-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.branch-name {
  font-size: 12px;
  color: #b7e4c7;
}
</style>
