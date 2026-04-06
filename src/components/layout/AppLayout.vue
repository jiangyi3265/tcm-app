<script setup>
import { RouterView, useRoute } from 'vue-router'
import { ref, provide, onMounted, onUnmounted } from 'vue'
import AppSidebar from './AppSidebar.vue'
import AppHeader from './AppHeader.vue'
import { useAuthStore } from '../../stores/auth'
import { usePatientsStore } from '../../stores/patients'

const route = useRoute()
const authStore = useAuthStore()
const patientsStore = usePatientsStore()
const sidebarCollapsed = ref(false)
const isMobile = ref(false)

function checkMobile() {
  isMobile.value = window.innerWidth < 768
  if (isMobile.value) sidebarCollapsed.value = true
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  // 登录后自动为当前员工补建病人档案（兼容老账号）
  if (authStore.currentUser) {
    patientsStore.ensureStaffPatient(authStore.currentUser).catch(() => {})
  }
})
onUnmounted(() => window.removeEventListener('resize', checkMobile))

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

provide('sidebarCollapsed', sidebarCollapsed)
provide('isMobile', isMobile)
provide('toggleSidebar', toggleSidebar)
</script>

<template>
  <div class="app-layout" :class="{ 'mobile': isMobile }">
    <div v-if="isMobile && !sidebarCollapsed" class="sidebar-overlay" @click="sidebarCollapsed = true" />
    <AppSidebar :collapsed="sidebarCollapsed" :mobile="isMobile" />
    <div class="main-container">
      <AppHeader />
      <main class="main-content">
        <RouterView :key="route.fullPath" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background-color: #f0f2f5;
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 998;
}

@media (max-width: 767px) {
  .main-content {
    padding: 12px;
  }
}
</style>
