import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/consent/:token',
      name: 'consent-sign',
      component: () => import('../views/public/ConsentSignView.vue'),
      meta: { public: true },
    },
    {
      path: '/intake/:token',
      name: 'intake-form',
      component: () => import('../views/public/IntakeFormView.vue'),
      meta: { public: true },
    },
    {
      path: '/book',
      name: 'public-booking',
      component: () => import('../views/public/PublicBookingView.vue'),
      meta: { public: true },
    },
    {
      path: '/booking',
      name: 'public-booking-wordpress',
      component: () => import('../views/public/PublicBookingView.vue'),
      meta: { public: true },
    },
    {
      path: '/manage/:token',
      name: 'public-appointment-manage',
      component: () => import('../views/public/PublicAppointmentManageView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('../components/layout/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/dashboard',
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('../views/DashboardView.vue'),
        },
        {
          path: 'patients',
          name: 'patients',
          component: () => import('../views/patients/PatientListView.vue'),
          meta: { roles: ['admin', 'practitioner', 'apprentice'] },
        },
        {
          path: 'consultations',
          name: 'consultation-list',
          component: () => import('../views/consultations/ConsultationListView.vue'),
          meta: { roles: ['admin', 'practitioner', 'apprentice'] },
        },
        {
          path: 'patients/:id',
          name: 'patient-detail',
          component: () => import('../views/patients/PatientDetailView.vue'),
          meta: { roles: ['admin', 'practitioner', 'apprentice'] },
        },
        {
          path: 'patients/:patientId/consultations/new',
          name: 'consultation-new',
          component: () => import('../views/consultations/ConsultationView.vue'),
          meta: { roles: ['admin', 'practitioner'] },
        },
        {
          path: 'patients/:patientId/consultations/:id',
          name: 'consultation-detail',
          component: () => import('../views/consultations/ConsultationView.vue'),
          meta: { roles: ['admin', 'practitioner', 'apprentice', 'cashier'] },
        },
        {
          path: 'appointments',
          name: 'appointments',
          component: () => import('../views/appointments/AppointmentView.vue'),
          meta: { roles: ['admin', 'practitioner', 'apprentice'] },
        },
        {
          path: 'inventory',
          name: 'inventory',
          component: () => import('../views/inventory/InventoryView.vue'),
          meta: { roles: ['admin', 'practitioner', 'pharmacist'] },
        },
        {
          path: 'formulas',
          name: 'formulas',
          component: () => import('../views/formulas/FormulaView.vue'),
          meta: { roles: ['admin', 'practitioner'] },
        },
        {
          path: 'pharmacy',
          name: 'pharmacy',
          component: () => import('../views/pharmacy/PharmacyView.vue'),
          meta: { roles: ['admin', 'pharmacist'] },
        },
        {
          path: 'cashier',
          name: 'cashier',
          component: () => import('../views/cashier/CashierView.vue'),
          meta: { roles: ['admin', 'cashier'] },
        },
        {
          path: 'statistics',
          name: 'statistics',
          component: () => import('../views/statistics/StatisticsView.vue'),
          meta: { roles: ['admin', 'practitioner'] },
        },
        {
          path: 'audit-logs',
          name: 'audit-logs',
          component: () => import('../views/audit/AuditLogView.vue'),
          meta: { roles: ['admin'] },
        },
        {
          path: 'admin',
          name: 'admin',
          component: () => import('../views/admin/AdminView.vue'),
          meta: { roles: ['admin'] },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach((to, from) => {
  const authStore = useAuthStore()

  if (to.meta.public) {
    if (authStore.isLoggedIn && to.name === 'login') {
      return '/dashboard'
    }
    return true
  }

  if (!authStore.isLoggedIn) {
    return '/login'
  }

  // 多角色支持：只要用户的任一角色在路由允许列表中即可
  if (to.meta.roles) {
    const userRoles = authStore.roles || []
    const hasAccess = userRoles.some(r => to.meta.roles.includes(r))
    if (!hasAccess) return '/dashboard'
  }

  return true
})

export default router
