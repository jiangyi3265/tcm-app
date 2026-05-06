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
import { getPaymentRecords, getPaymentStatus, getBillablePrescriptionTotal } from '../../utils/prescriptionWorkflow'

const { t } = useI18n()
const authStore = useAuthStore()
const consultationsStore = useConsultationsStore()
const patientsStore = usePatientsStore()
const appointmentsStore = useAppointmentsStore()
const inventoryStore = useInventoryStore()

const CURRENCY_SYMBOLS = { CAD: '$', USD: '$' }
const cs = computed(() => {
  const currencies = allPaymentRecords.value.map((record) => record.consultation?.currency).filter(Boolean)
  if (currencies.length === 0) return '$'
  const counts = {}
  currencies.forEach(c => { counts[c] = (counts[c] || 0) + 1 })
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  return CURRENCY_SYMBOLS[top] || `${top} `
})

const loading = ref(false)
const serverStats = ref(null)

// Use local data as fallback, prefer server data when available
const totalPatients = computed(() => serverStats.value?.totalPatients ?? patientsStore.activePatients.length)
const allConsultations = computed(() => consultationsStore.consultations.filter(c => !c.deletedAt))
const totalConsultations = computed(() => serverStats.value?.totalConsultations ?? allConsultations.value.length)
const allPaymentRecords = computed(() =>
  allConsultations.value.flatMap((consultation) => getPaymentRecords(consultation).map((record) => ({
    ...record,
    consultation,
  }))),
)

const paidConsultations = computed(() => allConsultations.value.filter(c => getPaymentStatus(c) === 'paid'))
const totalRevenue = computed(() => allPaymentRecords.value.reduce((sum, record) => sum + Number(record.amount || 0), 0))

// Consultation status breakdown
const statusBreakdown = computed(() => {
  const draft = serverStats.value?.draftCount ?? allConsultations.value.filter(c => c.status === 'draft').length
  const completed = serverStats.value?.completedCount ?? allConsultations.value.filter(c => c.status === 'completed').length
  const paid = paidConsultations.value.length
  return { draft, completed, paid }
})

// Revenue last 7 days
const dailyRevenue = computed(() => {
  const result = []
  for (let i = 6; i >= 0; i--) {
    const day = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
    const dayShort = dayjs().subtract(i, 'day').format('MM/DD')
    const revenue = allPaymentRecords.value
      .filter((record) => String(record.date || '').startsWith(day))
      .reduce((sum, record) => sum + Number(record.amount || 0), 0)
    const count = allConsultations.value.filter(c => c.date === day).length
    result.push({ date: day, dayShort, revenue, count })
  }
  return result
})

// Monthly revenue last 6 months
const monthlyRevenue = computed(() => {
  const result = []
  for (let i = 5; i >= 0; i--) {
    const monthStart = dayjs().subtract(i, 'month').startOf('month')
    const monthEnd = monthStart.endOf('month')
    const label = monthStart.format('YYYY-MM')
    const revenue = allPaymentRecords.value
      .filter((record) => {
        const date = String(record.date || '').slice(0, 10)
        return date >= monthStart.format('YYYY-MM-DD') && date <= monthEnd.format('YYYY-MM-DD')
      })
      .reduce((sum, record) => sum + Number(record.amount || 0), 0)
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
const todayRevenue = computed(() =>
  allPaymentRecords.value
    .filter((record) => String(record.date || '').startsWith(todayStr.value))
    .reduce((sum, record) => sum + Number(record.amount || 0), 0),
)
const todayConsultations = computed(() => allConsultations.value.filter(c => c.date === todayStr.value).length)
const todayAppointments = computed(() => appointmentsStore.todayAppointments.length)

// This week
const weekRevenue = computed(() => {
  const weekStart = dayjs().startOf('week').format('YYYY-MM-DD')
  return allPaymentRecords.value
    .filter((record) => String(record.date || '').slice(0, 10) >= weekStart)
    .reduce((sum, record) => sum + Number(record.amount || 0), 0)
})

// This month
const monthRevenue = computed(() => {
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  return allPaymentRecords.value
    .filter((record) => String(record.date || '').slice(0, 10) >= monthStart)
    .reduce((sum, record) => sum + Number(record.amount || 0), 0)
})

function formatMoney(val) {
  return Number(val || 0).toFixed(2)
}

// ── Revenue Export ──
const exportDateRange = ref([
  dayjs().startOf('year').format('YYYY-MM-DD'),
  dayjs().endOf('year').format('YYYY-MM-DD'),
])
const exportPreset = ref('year')

function setExportPreset(preset) {
  exportPreset.value = preset
  const now = dayjs()
  if (preset === 'q1') {
    exportDateRange.value = [now.startOf('year').format('YYYY-MM-DD'), now.startOf('year').add(2, 'month').endOf('month').format('YYYY-MM-DD')]
  } else if (preset === 'q2') {
    exportDateRange.value = [now.startOf('year').add(3, 'month').format('YYYY-MM-DD'), now.startOf('year').add(5, 'month').endOf('month').format('YYYY-MM-DD')]
  } else if (preset === 'q3') {
    exportDateRange.value = [now.startOf('year').add(6, 'month').format('YYYY-MM-DD'), now.startOf('year').add(8, 'month').endOf('month').format('YYYY-MM-DD')]
  } else if (preset === 'q4') {
    exportDateRange.value = [now.startOf('year').add(9, 'month').format('YYYY-MM-DD'), now.endOf('year').format('YYYY-MM-DD')]
  } else if (preset === 'year') {
    exportDateRange.value = [now.startOf('year').format('YYYY-MM-DD'), now.endOf('year').format('YYYY-MM-DD')]
  } else if (preset === 'lastYear') {
    exportDateRange.value = [now.subtract(1, 'year').startOf('year').format('YYYY-MM-DD'), now.subtract(1, 'year').endOf('year').format('YYYY-MM-DD')]
  }
}

const exportConsultations = computed(() => {
  const [start, end] = exportDateRange.value || []
  if (!start || !end) return []
  return allConsultations.value.filter(c => {
    const d = c.date || ''
    return d >= start && d <= end
  })
})

const exportSummary = computed(() => {
  let acupunctureIncome = 0
  let herbIncome = 0
  let otherServiceIncome = 0
  let totalTax = 0
  let totalPaid = 0
  const rows = []

  for (const c of exportConsultations.value) {
    const payments = getPaymentRecords(c)
    const paidAmount = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
    if (paidAmount === 0) continue

    const tax = Number(c.taxAmount || 0)
    totalTax += tax
    totalPaid += paidAmount

    // Classify services
    let consultAcuIncome = 0
    let consultHerbIncome = 0
    let consultOtherIncome = 0
    const services = c.services || []
    for (const svc of services) {
      const amount = Number(svc.amount || svc.price || 0) * Number(svc.quantity || 1)
      const key = svc.serviceKey || svc.key || ''
      if (key.includes('acupuncture') || key.includes('acu')) {
        consultAcuIncome += amount
      } else if (key.includes('herb') || key.includes('formula') || key.includes('chinese_medicine')) {
        consultHerbIncome += amount
      } else {
        consultOtherIncome += amount
      }
    }

    // If no services breakdown, classify by prescriptionType
    if (services.length === 0) {
      const fee = Number(c.consultationFee || 0)
      const rxTotal = Number(c.totalWithoutTax || paidAmount - tax) - fee
      if (c.prescriptionType && c.prescriptionType !== 'none') {
        consultHerbIncome += rxTotal > 0 ? rxTotal : 0
        consultAcuIncome += fee
      } else {
        consultAcuIncome += paidAmount - tax
      }
    }

    acupunctureIncome += consultAcuIncome
    herbIncome += consultHerbIncome
    otherServiceIncome += consultOtherIncome

    const patient = patientsStore.getPatient(c.patientId)
    const practitioner = authStore.users.find(u => u.id === c.practitionerId)
    rows.push({
      date: c.date || '',
      patientName: patient?.name || c.patientId || '',
      practitionerName: practitioner?.name || c.practitionerId || '',
      acupunture: consultAcuIncome,
      herbs: consultHerbIncome,
      other: consultOtherIncome,
      tax,
      total: paidAmount,
      paymentMethod: payments.map(p => p.method || '').join(', '),
    })
  }

  return { acupunctureIncome, herbIncome, otherServiceIncome, totalTax, totalPaid, rows }
})

function downloadRevenueCsv() {
  const { rows } = exportSummary.value
  if (!rows.length) return
  const headers = [
    t('statistics.exportDate'), t('statistics.exportPatient'), t('statistics.exportPractitioner'),
    t('statistics.exportAcupuncture'), t('statistics.exportHerbs'), t('statistics.exportOther'),
    t('statistics.exportTax'), t('statistics.exportTotal'), t('statistics.exportPaymentMethod'),
  ]
  const csvRows = [headers.join(',')]
  for (const r of rows) {
    csvRows.push([
      r.date, `"${r.patientName}"`, `"${r.practitionerName}"`,
      r.acupunture.toFixed(2), r.herbs.toFixed(2), r.other.toFixed(2),
      r.tax.toFixed(2), r.total.toFixed(2), `"${r.paymentMethod}"`,
    ].join(','))
  }
  // Summary row
  const s = exportSummary.value
  csvRows.push('')
  csvRows.push([t('statistics.exportSummary'), '', '',
    s.acupunctureIncome.toFixed(2), s.herbIncome.toFixed(2), s.otherServiceIncome.toFixed(2),
    s.totalTax.toFixed(2), s.totalPaid.toFixed(2), '',
  ].join(','))

  const bom = '\uFEFF'
  const blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `revenue_${exportDateRange.value[0]}_${exportDateRange.value[1]}.csv`
  a.click()
  URL.revokeObjectURL(url)
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
    <el-row :gutter="16" style="margin-bottom: 16px">
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

    <!-- 收入导出 -->
    <el-card style="margin-bottom: 16px">
      <div class="chart-title">{{ t('statistics.revenueExport') }}</div>
      <div class="export-toolbar">
        <div class="export-presets">
          <el-button size="small" :type="exportPreset === 'q1' ? 'primary' : ''" @click="setExportPreset('q1')">Q1</el-button>
          <el-button size="small" :type="exportPreset === 'q2' ? 'primary' : ''" @click="setExportPreset('q2')">Q2</el-button>
          <el-button size="small" :type="exportPreset === 'q3' ? 'primary' : ''" @click="setExportPreset('q3')">Q3</el-button>
          <el-button size="small" :type="exportPreset === 'q4' ? 'primary' : ''" @click="setExportPreset('q4')">Q4</el-button>
          <el-button size="small" :type="exportPreset === 'year' ? 'primary' : ''" @click="setExportPreset('year')">{{ t('statistics.thisYear') }}</el-button>
          <el-button size="small" :type="exportPreset === 'lastYear' ? 'primary' : ''" @click="setExportPreset('lastYear')">{{ t('statistics.lastYear') }}</el-button>
        </div>
        <el-date-picker
          v-model="exportDateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          :start-placeholder="t('statistics.startDate')"
          :end-placeholder="t('statistics.endDate')"
          size="small"
          style="width: 280px"
          @change="exportPreset = ''"
        />
        <el-button type="success" size="small" @click="downloadRevenueCsv" :disabled="!exportSummary.rows.length">
          <el-icon><Download /></el-icon> {{ t('statistics.downloadCsv') }}
        </el-button>
      </div>

      <div v-if="exportSummary.rows.length" class="export-summary">
        <div class="export-summary-cards">
          <div class="es-card acupuncture">
            <div class="es-label">{{ t('statistics.acupunctureIncome') }}</div>
            <div class="es-value">{{ cs }}{{ formatMoney(exportSummary.acupunctureIncome) }}</div>
          </div>
          <div class="es-card herbs">
            <div class="es-label">{{ t('statistics.herbIncome') }}</div>
            <div class="es-value">{{ cs }}{{ formatMoney(exportSummary.herbIncome) }}</div>
          </div>
          <div class="es-card other" v-if="exportSummary.otherServiceIncome > 0">
            <div class="es-label">{{ t('statistics.otherIncome') }}</div>
            <div class="es-value">{{ cs }}{{ formatMoney(exportSummary.otherServiceIncome) }}</div>
          </div>
          <div class="es-card tax">
            <div class="es-label">{{ t('statistics.totalTax') }}</div>
            <div class="es-value">{{ cs }}{{ formatMoney(exportSummary.totalTax) }}</div>
          </div>
          <div class="es-card total">
            <div class="es-label">{{ t('statistics.totalPaidAmount') }}</div>
            <div class="es-value">{{ cs }}{{ formatMoney(exportSummary.totalPaid) }}</div>
          </div>
        </div>
        <div style="font-size:12px; color:#888; margin-top:8px">
          {{ t('statistics.exportRecordCount', { count: exportSummary.rows.length }) }}
        </div>
      </div>
      <div v-else style="text-align:center;padding:20px;color:#999">{{ t('statistics.noDataInRange') }}</div>
    </el-card>
  </div>
</template>

<style scoped>
.statistics-view { max-width: 100%; }

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

/* Export */
.export-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
.export-presets { display: flex; gap: 4px; }
.export-summary-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.es-card { padding: 14px; border-radius: 10px; background: #f8fafc; border: 1px solid #eef2f7; }
.es-card.acupuncture { border-left: 3px solid #2d6a4f; }
.es-card.herbs { border-left: 3px solid #7c3aed; }
.es-card.other { border-left: 3px solid #0d9488; }
.es-card.tax { border-left: 3px solid #b45309; }
.es-card.total { border-left: 3px solid #1d4ed8; background: #eef4ff; }
.es-label { font-size: 12px; color: #888; margin-bottom: 4px; }
.es-value { font-size: 20px; font-weight: 700; color: #1a1a1a; }
</style>
