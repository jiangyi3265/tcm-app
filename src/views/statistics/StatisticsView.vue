<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth'
import { useConsultationsStore } from '../../stores/consultations'
import { usePatientsStore } from '../../stores/patients'
import { useAppointmentsStore } from '../../stores/appointments'
import { useInventoryStore } from '../../stores/inventory'
import { statisticsApi } from '../../utils/api'
import { formatDate, dayjs } from '../../utils/dateUtils'

const { t } = useI18n()
const authStore = useAuthStore()
const consultationsStore = useConsultationsStore()
const patientsStore = usePatientsStore()
const appointmentsStore = useAppointmentsStore()
const inventoryStore = useInventoryStore()

const CURRENCY_SYMBOLS = { CAD: '$', USD: '$', CNY: '¥' }
const cs = computed(() => {
  // Derive currency from paid consultations (most common), fallback to ¥
  const currencies = paidConsultations.value.map(c => c.currency).filter(Boolean)
  if (currencies.length === 0) return '¥'
  const counts = {}
  currencies.forEach(c => { counts[c] = (counts[c] || 0) + 1 })
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  return CURRENCY_SYMBOLS[top] || '¥'
})

const loading = ref(false)
const serverStats = ref(null)

// Use local data as fallback, prefer server data when available
const totalPatients = computed(() => serverStats.value?.totalPatients ?? patientsStore.activePatients.length)
const allConsultations = computed(() => consultationsStore.consultations.filter(c => !c.deletedAt))
const totalConsultations = computed(() => serverStats.value?.totalConsultations ?? allConsultations.value.length)

const paidConsultations = computed(() => allConsultations.value.filter(c => c.status === 'paid'))
const totalRevenue = computed(() => serverStats.value?.totalRevenue ?? paidConsultations.value.reduce((s, c) => s + (c.totalAmount || 0), 0))

// Consultation status breakdown
const statusBreakdown = computed(() => {
  const draft = serverStats.value?.draftCount ?? allConsultations.value.filter(c => c.status === 'draft').length
  const completed = serverStats.value?.completedCount ?? allConsultations.value.filter(c => c.status === 'completed').length
  const paid = serverStats.value?.paidCount ?? paidConsultations.value.length
  return { draft, completed, paid }
})

// Revenue last 7 days
const dailyRevenue = computed(() => {
  if (serverStats.value?.dailyRevenue) return serverStats.value.dailyRevenue
  const result = []
  for (let i = 6; i >= 0; i--) {
    const day = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
    const dayShort = dayjs().subtract(i, 'day').format('MM/DD')
    const revenue = paidConsultations.value
      .filter(c => c.date === day)
      .reduce((s, c) => s + (c.totalAmount || 0), 0)
    const count = allConsultations.value.filter(c => c.date === day).length
    result.push({ date: day, dayShort, revenue, count })
  }
  return result
})

// Monthly revenue last 6 months
const monthlyRevenue = computed(() => {
  if (serverStats.value?.monthlyRevenue) return serverStats.value.monthlyRevenue
  const result = []
  for (let i = 5; i >= 0; i--) {
    const monthStart = dayjs().subtract(i, 'month').startOf('month')
    const monthEnd = monthStart.endOf('month')
    const label = monthStart.format('YYYY-MM')
    const revenue = paidConsultations.value
      .filter(c => c.date && c.date >= monthStart.format('YYYY-MM-DD') && c.date <= monthEnd.format('YYYY-MM-DD'))
      .reduce((s, c) => s + (c.totalAmount || 0), 0)
    const count = allConsultations.value
      .filter(c => c.date && c.date >= monthStart.format('YYYY-MM-DD') && c.date <= monthEnd.format('YYYY-MM-DD'))
      .length
    result.push({ month: label, revenue, count })
  }
  return result
})

// Top chief complaints
const topComplaints = computed(() => {
  if (serverStats.value?.topComplaints) return serverStats.value.topComplaints
  const counts = {}
  allConsultations.value.forEach(c => {
    if (c.chiefComplaint) {
      counts[c.chiefComplaint] = (counts[c.chiefComplaint] || 0) + 1
    }
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))
})

// Top practitioners
const topPractitioners = computed(() => {
  const counts = {}
  allConsultations.value.forEach(c => {
    if (c.practitionerId) {
      counts[c.practitionerId] = (counts[c.practitionerId] || 0) + 1
    }
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      id,
      name: authStore.users.find(u => u.id === id)?.name || id,
      count,
    }))
})

// Revenue bar chart visual (pure CSS)
const maxDailyRevenue = computed(() => Math.max(...dailyRevenue.value.map(d => d.revenue), 1))
const maxMonthlyRevenue = computed(() => Math.max(...monthlyRevenue.value.map(d => d.revenue), 1))

// Today's stats
const todayStr = computed(() => dayjs().format('YYYY-MM-DD'))
const todayRevenue = computed(() => paidConsultations.value.filter(c => c.date === todayStr.value).reduce((s, c) => s + (c.totalAmount || 0), 0))
const todayConsultations = computed(() => allConsultations.value.filter(c => c.date === todayStr.value).length)
const todayAppointments = computed(() => appointmentsStore.todayAppointments.length)

// This week
const weekRevenue = computed(() => {
  const weekStart = dayjs().startOf('week').format('YYYY-MM-DD')
  return paidConsultations.value
    .filter(c => c.date && c.date >= weekStart)
    .reduce((s, c) => s + (c.totalAmount || 0), 0)
})

// This month
const monthRevenue = computed(() => {
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  return paidConsultations.value
    .filter(c => c.date && c.date >= monthStart)
    .reduce((s, c) => s + (c.totalAmount || 0), 0)
})

function formatMoney(val) {
  return Number(val || 0).toFixed(2)
}

onMounted(async () => {
  try {
    loading.value = true
    const data = await statisticsApi.overview()
    serverStats.value = data
  } catch (e) {
    // fallback to local data
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="statistics-view">
    <h2 class="page-title">
      <el-icon style="margin-right: 8px"><TrendCharts /></el-icon>
      {{ t('statistics.title') }}
    </h2>

    <!-- 今日速览 -->
    <div class="quick-stats">
      <div class="qs-card green">
        <div class="qs-icon"><el-icon><Calendar /></el-icon></div>
        <div>
          <div class="qs-number">{{ todayConsultations }}</div>
          <div class="qs-label">{{ t('statistics.todayConsultations') }}</div>
        </div>
      </div>
      <div class="qs-card blue">
        <div class="qs-icon blue"><el-icon><Clock /></el-icon></div>
        <div>
          <div class="qs-number">{{ todayAppointments }}</div>
          <div class="qs-label">{{ t('statistics.todayAppointments') }}</div>
        </div>
      </div>
      <div class="qs-card gold">
        <div class="qs-icon gold"><el-icon><Money /></el-icon></div>
        <div>
          <div class="qs-number">{{ cs }}{{ formatMoney(todayRevenue) }}</div>
          <div class="qs-label">{{ t('statistics.todayRevenue') }}</div>
        </div>
      </div>
      <div class="qs-card purple">
        <div class="qs-icon purple"><el-icon><Coin /></el-icon></div>
        <div>
          <div class="qs-number">{{ cs }}{{ formatMoney(weekRevenue) }}</div>
          <div class="qs-label">{{ t('statistics.weekRevenue') }}</div>
        </div>
      </div>
      <div class="qs-card teal">
        <div class="qs-icon teal"><el-icon><Wallet /></el-icon></div>
        <div>
          <div class="qs-number">{{ cs }}{{ formatMoney(monthRevenue) }}</div>
          <div class="qs-label">{{ t('statistics.monthRevenue') }}</div>
        </div>
      </div>
    </div>

    <!-- 总览卡片 -->
    <div class="overview-cards">
      <el-card class="ov-card">
        <div class="ov-title">{{ t('statistics.overview') }}</div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item :label="t('statistics.totalPatients')">{{ totalPatients }}</el-descriptions-item>
          <el-descriptions-item :label="t('statistics.totalConsultations')">{{ totalConsultations }}</el-descriptions-item>
          <el-descriptions-item :label="t('statistics.completed')">{{ statusBreakdown.completed }}</el-descriptions-item>
          <el-descriptions-item :label="t('statistics.paid')">{{ statusBreakdown.paid }}</el-descriptions-item>
          <el-descriptions-item :label="t('statistics.draft')">{{ statusBreakdown.draft }}</el-descriptions-item>
          <el-descriptions-item :label="t('statistics.totalRevenue')">
            <span style="font-weight:700;color:#2d6a4f">{{ cs }}{{ formatMoney(totalRevenue) }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card class="ov-card">
        <div class="ov-title">{{ t('statistics.statusDistribution') }}</div>
        <div class="status-bars">
          <div class="sb-row">
            <span class="sb-label">{{ t('statistics.draft') }}</span>
            <div class="sb-track">
              <div class="sb-fill info" :style="{ width: totalConsultations ? (statusBreakdown.draft / totalConsultations * 100) + '%' : '0%' }"></div>
            </div>
            <span class="sb-count">{{ statusBreakdown.draft }}</span>
          </div>
          <div class="sb-row">
            <span class="sb-label">{{ t('statistics.completed') }}</span>
            <div class="sb-track">
              <div class="sb-fill warning" :style="{ width: totalConsultations ? (statusBreakdown.completed / totalConsultations * 100) + '%' : '0%' }"></div>
            </div>
            <span class="sb-count">{{ statusBreakdown.completed }}</span>
          </div>
          <div class="sb-row">
            <span class="sb-label">{{ t('statistics.paid') }}</span>
            <div class="sb-track">
              <div class="sb-fill success" :style="{ width: totalConsultations ? (statusBreakdown.paid / totalConsultations * 100) + '%' : '0%' }"></div>
            </div>
            <span class="sb-count">{{ statusBreakdown.paid }}</span>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 收入图表 -->
    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="14">
        <el-card>
          <div class="chart-title">{{ t('statistics.dailyTrend') }}</div>
          <div class="bar-chart">
            <div class="bar-row" v-for="d in dailyRevenue" :key="d.date">
              <span class="bar-label">{{ d.dayShort }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: (d.revenue / maxDailyRevenue * 100) + '%' }">
                  <span v-if="d.revenue > 0" class="bar-value">{{ cs }}{{ formatMoney(d.revenue) }}</span>
                </div>
              </div>
              <span class="bar-count">{{ t('statistics.times', { count: d.count }) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card>
          <div class="chart-title">{{ t('statistics.monthlyTrend') }}</div>
          <div class="bar-chart">
            <div class="bar-row" v-for="m in monthlyRevenue" :key="m.month">
              <span class="bar-label">{{ m.month }}</span>
              <div class="bar-track">
                <div class="bar-fill monthly" :style="{ width: (m.revenue / maxMonthlyRevenue * 100) + '%' }">
                  <span v-if="m.revenue > 0" class="bar-value">{{ cs }}{{ formatMoney(m.revenue) }}</span>
                </div>
              </div>
              <span class="bar-count">{{ t('statistics.times', { count: m.count }) }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 病种排行 & 医师排行 -->
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card>
          <div class="chart-title">{{ t('statistics.topComplaints') }}</div>
          <div v-if="topComplaints.length === 0" style="text-align:center;padding:20px;color:#999">{{ t('statistics.noData') }}</div>
          <div v-else class="rank-list">
            <div v-for="(c, idx) in topComplaints" :key="c.name" class="rank-item">
              <span class="rank-no" :class="{ top3: idx < 3 }">{{ idx + 1 }}</span>
              <span class="rank-name">{{ c.name }}</span>
              <el-tag size="small" type="info">{{ t('statistics.times', { count: c.count }) }}</el-tag>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <div class="chart-title">{{ t('statistics.practitionerRanking') }}</div>
          <div v-if="topPractitioners.length === 0" style="text-align:center;padding:20px;color:#999">{{ t('statistics.noData') }}</div>
          <div v-else class="rank-list">
            <div v-for="(p, idx) in topPractitioners" :key="p.id" class="rank-item">
              <span class="rank-no" :class="{ top3: idx < 3 }">{{ idx + 1 }}</span>
              <el-avatar :size="28" style="background:#2d6a4f;font-size:12px">{{ (p.name || '?').charAt(0) }}</el-avatar>
              <span class="rank-name">{{ p.name }}</span>
              <el-tag size="small" type="success">{{ t('statistics.times', { count: p.count }) }}</el-tag>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.statistics-view { max-width: 1200px; }

.page-title {
  font-size: 20px; font-weight: 700; color: #1b4332;
  display: flex; align-items: center; margin-bottom: 20px;
}

/* Quick Stats */
.quick-stats {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px; margin-bottom: 20px;
}
.qs-card {
  background: #fff; border-radius: 12px; padding: 18px 16px;
  display: flex; align-items: center; gap: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  transition: transform 0.2s;
}
.qs-card:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,0,0,0.08); }
.qs-icon {
  width: 44px; height: 44px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center; font-size: 22px;
  background: #d8f3dc; color: #2d6a4f;
}
.qs-icon.blue { background: #dbeafe; color: #1d4ed8; }
.qs-icon.gold { background: #fef3c7; color: #b45309; }
.qs-icon.purple { background: #ede9fe; color: #7c3aed; }
.qs-icon.teal { background: #ccfbf1; color: #0d9488; }
.qs-number { font-size: 22px; font-weight: 700; color: #1a1a1a; line-height: 1.2; }
.qs-label { font-size: 12px; color: #888; margin-top: 2px; }

/* Overview Cards */
.overview-cards {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;
}
.ov-card { border-radius: 12px; }
.ov-title { font-size: 14px; font-weight: 700; color: #1b4332; margin-bottom: 12px; }

/* Status Bars */
.status-bars { display: flex; flex-direction: column; gap: 12px; }
.sb-row { display: flex; align-items: center; gap: 10px; }
.sb-label { font-size: 13px; color: #555; width: 60px; text-align: right; }
.sb-track { flex: 1; height: 20px; background: #f3f4f6; border-radius: 10px; overflow: hidden; }
.sb-fill { height: 100%; border-radius: 10px; transition: width 0.6s ease; min-width: 2px; }
.sb-fill.info { background: linear-gradient(90deg, #93c5fd, #60a5fa); }
.sb-fill.warning { background: linear-gradient(90deg, #fcd34d, #f59e0b); }
.sb-fill.success { background: linear-gradient(90deg, #6ee7b7, #10b981); }
.sb-count { font-size: 13px; font-weight: 600; color: #555; width: 40px; }

/* Bar Chart */
.chart-title { font-size: 14px; font-weight: 700; color: #1b4332; margin-bottom: 14px; }
.bar-chart { display: flex; flex-direction: column; gap: 10px; }
.bar-row { display: flex; align-items: center; gap: 8px; }
.bar-label { font-size: 12px; color: #888; width: 50px; text-align: right; flex-shrink: 0; }
.bar-track { flex: 1; height: 24px; background: #f3f4f6; border-radius: 6px; overflow: hidden; position: relative; }
.bar-fill {
  height: 100%; border-radius: 6px;
  background: linear-gradient(90deg, #52b788, #2d6a4f);
  transition: width 0.6s ease; min-width: 0;
  display: flex; align-items: center; justify-content: flex-end; padding-right: 6px;
}
.bar-fill.monthly { background: linear-gradient(90deg, #7c3aed, #4c1d95); }
.bar-value { font-size: 10px; color: white; font-weight: 600; white-space: nowrap; }
.bar-count { font-size: 11px; color: #999; width: 40px; flex-shrink: 0; }

/* Rank List */
.rank-list { display: flex; flex-direction: column; gap: 8px; }
.rank-item {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 8px; border-radius: 6px; transition: background 0.2s;
}
.rank-item:hover { background: #f5f5f5; }
.rank-no {
  width: 24px; height: 24px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #888; background: #f0f0f0;
}
.rank-no.top3 { background: #fef3c7; color: #b45309; }
.rank-name { flex: 1; font-size: 13px; color: #333; }
</style>
