<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConsultationsStore } from '../../stores/consultations'
import { usePatientsStore } from '../../stores/patients'
import { useAuthStore } from '../../stores/auth'
import { useInventoryStore } from '../../stores/inventory'
import { useSettingsStore } from '../../stores/settings'
import { useBranchesStore } from '../../stores/branches'
import { formatDate, formatDateTime } from '../../utils/dateUtils'
import { printInvoice } from '../../utils/pdfExport'
import { useEmailSimulator } from '../../utils/emailSimulator'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()
const consultationsStore = useConsultationsStore()
const patientsStore = usePatientsStore()
const authStore = useAuthStore()
const inventoryStore = useInventoryStore()
const settingsStore = useSettingsStore()
const branchesStore = useBranchesStore()
const { showEmailDialog, emailData, openEmailPreview, sendEmail, buildInvoiceEmail } = useEmailSimulator()

const activeTab = ref('pending')

function toAmount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatAmount(value) {
  return toAmount(value).toFixed(2)
}

const pendingPayments = computed(() => {
  const branchId = branchesStore.currentBranchId
  return consultationsStore.pendingPayments
    .filter(c => !branchId || c.branchId === branchId || !c.branchId)
    .map((c) => ({
      ...c,
      totalAmount: toAmount(c.totalAmount),
      taxAmount: toAmount(c.taxAmount),
      services: Array.isArray(c.services) ? c.services : [],
      patient: patientsStore.getPatient(c.patientId),
      practitioner: authStore.users.find((u) => u.id === c.practitionerId),
    }))
})

const paidConsultations = computed(() => {
  const branchId = branchesStore.currentBranchId
  return consultationsStore.consultations
    .filter((c) => c.status === 'paid' && !c.deletedAt && (!branchId || c.branchId === branchId || !c.branchId))
    .map((c) => ({
      ...c,
      totalAmount: toAmount(c.totalAmount),
      taxAmount: toAmount(c.taxAmount),
      services: Array.isArray(c.services) ? c.services : [],
      patient: patientsStore.getPatient(c.patientId),
      practitioner: authStore.users.find((u) => u.id === c.practitionerId),
    }))
    .sort((a, b) => new Date(b.lockedAt) - new Date(a.lockedAt))
    .slice(0, 50)
})

const selectedConsult = ref(null)
const showInvoiceDialog = ref(false)
const selectedPaymentMethod = ref('cash')

const paymentMethods = computed(() => [
  { value: 'cash', label: t('cashier.paymentMethods.cash') },
  { value: 'card', label: t('cashier.paymentMethods.card') },
  { value: 'wechat', label: t('cashier.paymentMethods.wechat') },
  { value: 'alipay', label: t('cashier.paymentMethods.alipay') },
  { value: 'transfer', label: t('cashier.paymentMethods.transfer') },
  { value: 'other', label: t('cashier.paymentMethods.other') },
])

function viewInvoice(consult) {
  selectedConsult.value = consult
  selectedPaymentMethod.value = 'cash'
  showInvoiceDialog.value = true
}

async function processPayment(consult) {
  try {
    await ElMessageBox.confirm(
      t('cashier.confirmPaymentMsg', { name: consult.patient?.name, amount: formatAmount(consult.totalAmount) }),
      t('cashier.confirmPaymentTitle'),
      { type: 'success' },
    )
  } catch {
    return // 用户取消
  }
  try {
    const updated = await consultationsStore.markAsPaid(consult.id, { paymentMethod: selectedPaymentMethod.value })
    await inventoryStore.refreshFromApi()
    ElMessage.success(t('cashier.paymentSuccess'))
    showInvoiceDialog.value = false
    // 发票邮件预览
    const emailContent = buildInvoiceEmail(consult.patient, { ...consult, ...updated }, settingsStore.clinicName)
    if (consult.patient?.emails?.[0] || consult.patient?.email) {
      openEmailPreview(emailContent)
    }
  } catch (e) {
    ElMessage.error(e.message || t('cashier.paymentFailed'))
  }
}

function handlePrintInvoice(consult) {
  printInvoice(consult, consult.patient, consult.practitioner, settingsStore.clinicName, settingsStore.taxRate)
}

// 今日收入统计
const todayRevenue = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  return paidConsultations.value
    .filter((c) => c.lockedAt?.startsWith(today))
    .reduce((sum, c) => sum + toAmount(c.totalAmount), 0)
})

const todayCount = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  return paidConsultations.value.filter((c) => c.lockedAt?.startsWith(today)).length
})
</script>

<template>
  <div class="cashier-view">
    <!-- 今日统计 -->
    <div class="cashier-stats">
      <div class="cashier-stat">
        <div class="cstat-label">{{ t('cashier.todayTransactions') }}</div>
        <div class="cstat-num">{{ todayCount }}</div>
      </div>
      <div class="cashier-stat primary">
        <div class="cstat-label">{{ t('cashier.todayRevenue') }}</div>
        <div class="cstat-num">${{ formatAmount(todayRevenue) }}</div>
      </div>
      <div class="cashier-stat warning">
        <div class="cstat-label">{{ t('cashier.pendingPayments') }}</div>
        <div class="cstat-num">{{ pendingPayments.length }}</div>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <!-- 待收款 -->
      <el-tab-pane :label="t('cashier.pendingTab')" name="pending">
        <div v-if="pendingPayments.length === 0" class="empty-state">
          <el-empty :description="t('cashier.noPending')" />
        </div>
        <div v-else class="payment-list">
          <el-card
            v-for="c in pendingPayments"
            :key="c.id"
            class="payment-card"
          >
            <div class="payment-header">
              <div class="payment-patient">
                <el-avatar :size="40" style="background: var(--color-primary)">
                  {{ c.patient?.name?.charAt(0) }}
                </el-avatar>
                <div>
                  <div class="payment-name">{{ c.patient?.name }}</div>
                  <div class="payment-date">{{ formatDate(c.date) }} · {{ c.practitioner?.name }}</div>
                </div>
              </div>
              <div class="payment-amount">
                <div class="amount-total">${{ formatAmount(c.totalAmount) }}</div>
                <div class="amount-tax" style="font-size: 12px; color: #888">{{ t('cashier.tax') }} ${{ formatAmount(c.taxAmount) }}</div>
              </div>
            </div>

            <div class="payment-services">
              <el-tag
                v-for="(s, idx) in (c.services || [])"
                :key="idx"
                size="small"
                type="info"
                style="margin-right: 4px; margin-bottom: 4px"
              >
                {{ s.name }} ${{ formatAmount(s?.price) }}
              </el-tag>
            </div>

            <div class="payment-actions">
              <el-button size="small" @click="viewInvoice(c)">{{ t('cashier.viewInvoice') }}</el-button>
              <el-button size="small" type="primary" @click="processPayment(c)">
                <el-icon><Money /></el-icon> {{ t('cashier.confirmPayment') }}
              </el-button>
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- 已收款历史 -->
      <el-tab-pane :label="t('cashier.historyTab')" name="history">
        <el-table :data="paidConsultations" stripe>
          <el-table-column :label="t('cashier.patient')" min-width="100">
            <template #default="{ row }">{{ row.patient?.name }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.consultDate')" width="120">
            <template #default="{ row }">{{ formatDate(row.date) }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.practitioner')" width="90">
            <template #default="{ row }">{{ row.practitioner?.name }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.amount')" width="110" align="right">
            <template #default="{ row }">
              <span style="font-weight: 600; color: #1b4332">${{ formatAmount(row.totalAmount) }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('cashier.taxAmount')" width="90" align="right">
            <template #default="{ row }">${{ formatAmount(row.taxAmount) }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.paymentTime')" width="160">
            <template #default="{ row }">{{ formatDateTime(row.lockedAt) }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.operation')" width="80">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click="viewInvoice(row)">{{ t('cashier.invoice') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 发票对话框 -->
    <el-drawer v-model="showInvoiceDialog" :title="t('cashier.invoiceDetail')" size="480px" direction="rtl">
      <div v-if="selectedConsult" class="invoice-view">
        <div class="inv-top">
          <div class="inv-title">{{ t('cashier.invoiceTitle') }}</div>
          <div class="inv-number"># {{ String(selectedConsult.id || '').slice(-8).toUpperCase() }}</div>
        </div>
        <div class="inv-patient-row">
          <span><strong>{{ t('cashier.patientLabel') }}</strong>{{ selectedConsult.patient?.name }}</span>
          <span><strong>{{ t('cashier.dateLabel') }}</strong>{{ formatDate(selectedConsult.date) }}</span>
        </div>
        <el-divider />
        <el-table :data="selectedConsult.services || []" size="small">
          <el-table-column prop="name" :label="t('cashier.serviceItem')" />
          <el-table-column :label="t('cashier.amountCol')" width="100" align="right">
            <template #default="{ row }">${{ formatAmount((Number(row.price || 0) * (row.quantity || 1)) - (row.manualDiscount || 0)) }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.taxIncluded')" width="60" align="center">
            <template #default="{ row }">{{ row.taxable ? '✓' : '-' }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.taxCol')" width="80" align="right">
            <template #default="{ row }">
              <span v-if="row.taxable">${{ formatAmount(((Number(row.price || 0) * (row.quantity || 1)) - (row.manualDiscount || 0)) * toAmount(settingsStore.taxRate)) }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="inv-totals">
          <div class="inv-row"><span>{{ t('cashier.subtotal') }}</span><span>${{ formatAmount(toAmount(selectedConsult.totalAmount) - toAmount(selectedConsult.taxAmount)) }}</span></div>
          <div class="inv-row"><span>{{ t('cashier.salesTax', { rate: (toAmount(settingsStore.taxRate) * 100).toFixed(0) }) }}</span><span>${{ formatAmount(selectedConsult.taxAmount) }}</span></div>
          <div class="inv-row total"><span>{{ t('cashier.totalAmount') }}</span><span>${{ formatAmount(selectedConsult.totalAmount) }}</span></div>
        </div>
        <div v-if="selectedConsult.status !== 'paid'" style="margin-top: 12px">
          <strong style="font-size: 13px; color: #555">{{ t('cashier.paymentMethod') }}：</strong>
          <el-radio-group v-model="selectedPaymentMethod" size="small" style="margin-top: 6px">
            <el-radio-button v-for="m in paymentMethods" :key="m.value" :value="m.value">{{ m.label }}</el-radio-button>
          </el-radio-group>
        </div>
        <div class="inv-status">
          <el-tag :type="selectedConsult.status === 'paid' ? 'success' : 'warning'" size="large">
            {{ selectedConsult.status === 'paid' ? t('cashier.statusPaid') : t('cashier.statusPending') }}
          </el-tag>
        </div>
      </div>
      <template #footer>
        <el-button @click="showInvoiceDialog = false">{{ t('common.close') }}</el-button>
        <el-button v-if="selectedConsult?.status !== 'paid'" type="primary" @click="processPayment(selectedConsult)">
          {{ t('cashier.confirmPayment') }}
        </el-button>
        <el-button type="info" @click="handlePrintInvoice(selectedConsult)">
          {{ t('cashier.exportPdf') }}
        </el-button>
      </template>
    </el-drawer>

    <!-- 邮件预览对话框 -->
    <el-drawer v-model="showEmailDialog" :title="t('email.preview')" size="520px" direction="rtl">
      <el-form label-width="60px" size="small">
        <el-form-item :label="t('email.recipient')">
          <el-input v-model="emailData.to" />
        </el-form-item>
        <el-form-item :label="t('email.subject')">
          <el-input v-model="emailData.subject" />
        </el-form-item>
        <el-form-item :label="t('email.body')">
          <el-input v-model="emailData.body" type="textarea" :rows="10" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEmailDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="sendEmail(); ElMessage.success(t('common.emailSent'))">{{ t('common.sendEmail') }}</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.cashier-view { max-width: 100%; }

.cashier-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.cashier-stat {
  background: #fff;
  border-radius: 10px;
  padding: 16px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}

.cashier-stat.primary { border-top: 3px solid #2d6a4f; }
.cashier-stat.warning { border-top: 3px solid #e9c46a; }

.cstat-label { font-size: 13px; color: #888; margin-bottom: 6px; }
.cstat-num { font-size: 26px; font-weight: 700; color: #1b4332; }

.empty-state { padding: 40px; display: flex; justify-content: center; }

.payment-list { display: flex; flex-direction: column; gap: 12px; }

.payment-card { border-radius: 10px; }

.payment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.payment-patient { display: flex; gap: 12px; align-items: center; }
.payment-name { font-weight: 600; font-size: 15px; }
.payment-date { font-size: 12px; color: #888; }

.payment-amount { text-align: right; }
.amount-total { font-size: 22px; font-weight: 700; color: #1b4332; }

.payment-services { margin-bottom: 12px; }
.payment-actions { text-align: right; display: flex; gap: 8px; justify-content: flex-end; }

.invoice-view { font-size: 14px; }
.inv-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.inv-title { font-size: 18px; font-weight: 700; color: #1b4332; }
.inv-number { font-size: 12px; color: #999; }
.inv-patient-row { display: flex; justify-content: space-between; margin-bottom: 8px; color: #555; }

.inv-totals { margin-top: 12px; }
.inv-row { display: flex; justify-content: space-between; padding: 4px 0; color: #555; }
.inv-row.total { font-size: 16px; font-weight: 700; color: #1b4332; border-top: 1px solid #e0e0e0; padding-top: 8px; margin-top: 4px; }

.inv-status { text-align: center; margin-top: 12px; }
</style>
