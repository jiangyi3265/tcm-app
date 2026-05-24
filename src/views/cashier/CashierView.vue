<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useConsultationsStore } from '../../stores/consultations'
import { usePatientsStore } from '../../stores/patients'
import { useAuthStore } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'
import { useBranchesStore } from '../../stores/branches'
import { formatDate, formatDateTime } from '../../utils/dateUtils'
import { getCountryLabel, getProvinceLabel } from '../../utils/countryRegionOptions'
import { printInvoice } from '../../utils/pdfExport'
import { useEmailSimulator } from '../../utils/emailSimulator'
import { consultationsApi, filesApi } from '../../utils/api'
import { runStripeTerminalPayment } from '../../utils/stripeTerminalPayment'
import {
  getLatestPaymentTime,
  getOutstandingAmount,
  getPaidAmount,
  getPaymentRecords,
  getPaymentStatus,
} from '../../utils/prescriptionWorkflow'
import { getPaymentMethodLabel, getPaymentMethodOptions, normalizePaymentMethodValue, requiresStripeTerminal } from '../../utils/paymentMethods'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const consultationsStore = useConsultationsStore()
const patientsStore = usePatientsStore()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const branchesStore = useBranchesStore()
const { showEmailDialog, emailData, openEmailPreview, sendEmail, sendEmailContent, buildInvoiceEmail } = useEmailSimulator()

const activeTab = ref('pending')
const selectedConsult = ref(null)
const showInvoiceDialog = ref(false)
const selectedPaymentMethod = ref('cash')

function formatPatientAddress(patient = {}) {
  const parts = [
    patient.addressStreet || patient.address,
    patient.addressCity,
    patient.addressState ? getProvinceLabel(patient.addressCountry, patient.addressState) : '',
    patient.addressPostal,
    patient.addressCountry ? getCountryLabel(patient.addressCountry) : '',
  ].filter(Boolean)
  return parts.join(', ') || '-'
}

onMounted(async () => {
  await consultationsStore.refreshFromApi().catch((error) => {
    console.warn('收银台刷新问诊失败:', error.message)
  })
  handleStripeReturn()
})

function handleStripeReturn() {
  const status = String(route.query.stripe || '')
  if (!status) return
  if (status === 'success') {
    ElMessage.success(t('cashier.stripeReturnSuccess'))
  } else if (status === 'cancelled') {
    ElMessage.info(t('cashier.stripeReturnCancelled'))
  }
  const query = { ...route.query }
  delete query.stripe
  delete query.session_id
  router.replace({ query }).catch(() => {})
}

function toAmount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function formatAmount(value) {
  return toAmount(value).toFixed(2)
}

function money(value, currency = null) {
  const code = currency || settingsStore.currency || 'CAD'
  const prefix = ['CAD', 'USD'].includes(code) ? '$' : `${code} `
  return `${prefix}${formatAmount(value)}`
}

function consultationMoney(consultation, value) {
  return money(value, consultation?.currency)
}

function consultationTaxRate(consultation) {
  return consultation?.overrideTaxRate ?? settingsStore.taxRate
}

function getPaymentStatusTagType(status) {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  return 'info'
}

function getPaymentStatusLabel(status) {
  if (status === 'paid') return t('cashier.statusPaid')
  if (status === 'partial') return t('cashier.statusPartial')
  return t('cashier.statusPending')
}

function enrichConsultation(consultation) {
  return {
    ...consultation,
    totalAmount: toAmount(consultation.totalAmount),
    taxAmount: toAmount(consultation.taxAmount),
    paidAmount: getPaidAmount(consultation),
    outstandingAmount: getOutstandingAmount(consultation),
    paymentStatus: getPaymentStatus(consultation),
    paymentRecords: getPaymentRecords(consultation),
    latestPaymentTime: getLatestPaymentTime(consultation),
    services: Array.isArray(consultation.services) ? consultation.services : [],
    patient: patientsStore.getPatient(consultation.patientId),
    practitioner: authStore.users.find((u) => u.id === consultation.practitionerId),
  }
}

function applyInvoicePdfResult(consultation, result) {
  if (!consultation || !result) return
  consultation.invoicePdfUrl = result.url || result.pdfUrl || consultation.invoicePdfUrl
  consultation.invoicePdfPath = result.filePath || result.resource || consultation.invoicePdfPath
}

async function generateInvoicePdfForEmail(consultation) {
  if (!consultation?.id) return null
  const result = await consultationsApi.generateInvoice(consultation.id)
  applyInvoicePdfResult(consultation, result)
  return result
}

const pendingPayments = computed(() => {
  const branchId = branchesStore.currentBranchId
  return consultationsStore.pendingPayments
    .filter((c) => !branchId || c.branchId === branchId || !c.branchId)
    .map(enrichConsultation)
})

const paymentHistory = computed(() => {
  const branchId = branchesStore.currentBranchId
  return consultationsStore.consultations
    .filter((c) => !c.deletedAt && (!branchId || c.branchId === branchId || !c.branchId))
    .flatMap((consultation) => {
      const enriched = enrichConsultation(consultation)
      return enriched.paymentRecords.map((record) => ({
        ...record,
        consultation: enriched,
        patient: enriched.patient,
        practitioner: enriched.practitioner,
      }))
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 100)
})

const paymentMethods = computed(() => getPaymentMethodOptions(t))

const todayRevenue = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  return paymentHistory.value
    .filter((record) => String(record.date || '').startsWith(today))
    .reduce((sum, record) => sum + toAmount(record.amount), 0)
})

const todayCount = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  return paymentHistory.value.filter((record) => String(record.date || '').startsWith(today)).length
})

function viewInvoice(target) {
  const consultation = target?.consultation || target
  if (!consultation) return
  selectedConsult.value = enrichConsultation(consultation)
  selectedPaymentMethod.value = 'cash'
  showInvoiceDialog.value = true
}

async function processPayment(consultation) {
  const consult = enrichConsultation(consultation)
  if (consult.outstandingAmount <= 0) {
    ElMessage.info(t('cashier.noPendingAmount'))
    return
  }

  try {
    await ElMessageBox.confirm(
      t('cashier.confirmPaymentMsg', { name: consult.patient?.name, amount: formatAmount(consult.outstandingAmount) }),
      t('cashier.confirmPaymentTitle'),
      { type: 'success' },
    )
  } catch {
    return
  }

  try {
    const method = normalizePaymentMethodValue(selectedPaymentMethod.value)
    if (requiresStripeTerminal(method)) {
      ElMessage.info(t('consultation.posSimulationWaiting'))
      await runStripeTerminalPayment(consult.id)
      await consultationsStore.refreshFromApi()
      selectedConsult.value = enrichConsultation(consultationsStore.getConsultation(consult.id) || consult)
      ElMessage.success(t('cashier.paymentSuccess'))
      return
    }
    const updated = await consultationsStore.markAsPaid(consult.id, {
      paymentMethod: method,
      amount: consult.outstandingAmount,
    })
    const refreshed = enrichConsultation(updated || consult)
    selectedConsult.value = refreshed
    ElMessage.success(t('cashier.paymentSuccess'))

    if (refreshed.patient?.emails?.[0] || refreshed.patient?.email) {
      let invoiceResult = null
      try {
        invoiceResult = await generateInvoicePdfForEmail(refreshed)
      } catch (error) {
        ElMessage.warning((error.message || t('consultation.pdfFailed')))
        return
      }
      const emailContent = buildInvoiceEmail(refreshed.patient, refreshed, settingsStore.clinicName, { pdfResult: invoiceResult })
      sendEmailContent(emailContent)
    }
  } catch (error) {
    ElMessage.error(error.message || t('cashier.paymentFailed'))
  }
}

async function handlePrintInvoice(consultation) {
  if (!consultation) return
  try {
    if (consultation.id) {
      const res = await consultationsApi.generateInvoice(consultation.id)
      const pdfUrl = res.url || res.pdfUrl || res.filePath
      if (pdfUrl) {
        await filesApi.open(pdfUrl)
        return
      }
    }
  } catch (error) {
    ElMessage.warning(error.message || t('consultation.pdfFailed'))
  }
  printInvoice(consultation, consultation.patient, consultation.practitioner, settingsStore.clinicName, consultationTaxRate(consultation), {
    address: settingsStore.clinicAddress,
    phone: settingsStore.clinicPhone,
    clinicSeal: settingsStore.clinicSeal,
    thirdPartySignature: settingsStore.thirdPartySignature,
  })
}

async function handleSendInvoiceEmail(consultation) {
  if (!consultation) return
  const consult = enrichConsultation(consultation)
  if (!consult.patient?.emails?.[0] && !consult.patient?.email) {
    ElMessage.warning(t('patientDetail.noEmailForConsent'))
    return
  }
  let invoiceResult = null
  try {
    invoiceResult = await generateInvoicePdfForEmail(consult)
  } catch (error) {
    ElMessage.warning(error.message || t('consultation.pdfFailed'))
    return
  }
  openEmailPreview(buildInvoiceEmail(consult.patient, consult, settingsStore.clinicName, { pdfResult: invoiceResult }))
}
</script>

<template>
  <div class="cashier-view">
    <div class="cashier-stats">
      <div class="cashier-stat">
        <div class="cstat-label">{{ t('cashier.todayTransactions') }}</div>
        <div class="cstat-num">{{ todayCount }}</div>
      </div>
      <div class="cashier-stat primary">
        <div class="cstat-label">{{ t('cashier.todayRevenue') }}</div>
        <div class="cstat-num">{{ money(todayRevenue) }}</div>
      </div>
      <div class="cashier-stat warning">
        <div class="cstat-label">{{ t('cashier.pendingPayments') }}</div>
        <div class="cstat-num">{{ pendingPayments.length }}</div>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane :label="t('cashier.pendingTab')" name="pending">
        <div v-if="pendingPayments.length === 0" class="empty-state">
          <el-empty :description="t('cashier.noPending')" />
        </div>
        <div v-else class="payment-list">
          <el-card v-for="c in pendingPayments" :key="c.id" class="payment-card">
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
                <div class="amount-total">{{ consultationMoney(c, c.outstandingAmount) }}</div>
                <div class="amount-meta">
                  {{ t('cashier.paidAmount') }} {{ consultationMoney(c, c.paidAmount) }} / {{ t('cashier.totalCharge') }} {{ consultationMoney(c, c.totalAmount) }}
                </div>
              </div>
            </div>

            <div class="payment-tags">
              <el-tag :type="getPaymentStatusTagType(c.paymentStatus)" size="small">
                {{ getPaymentStatusLabel(c.paymentStatus) }}
              </el-tag>
              <el-tag v-if="c.latestPaymentTime" type="info" size="small">
                {{ t('cashier.lastPayment') }} {{ formatDateTime(c.latestPaymentTime) }}
              </el-tag>
            </div>

            <div class="payment-services">
              <el-tag
                v-for="(s, idx) in (c.services || [])"
                :key="idx"
                size="small"
                type="info"
                style="margin-right: 4px; margin-bottom: 4px"
              >
                {{ s.name }} {{ consultationMoney(c, (Number(s?.price || 0) * (s?.quantity || 1)) - (s?.manualDiscount || 0)) }}
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

      <el-tab-pane :label="t('cashier.historyTab')" name="history">
        <div v-if="paymentHistory.length === 0" class="empty-state">
          <el-empty :description="t('cashier.noHistory')" />
        </div>
        <el-table v-else :data="paymentHistory" stripe>
          <el-table-column :label="t('cashier.patient')" min-width="100">
            <template #default="{ row }">{{ row.patient?.name }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.consultDate')" width="120">
            <template #default="{ row }">{{ formatDate(row.consultation?.date) }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.practitioner')" width="90">
            <template #default="{ row }">{{ row.practitioner?.name }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.amount')" width="110" align="right">
            <template #default="{ row }">
              <span style="font-weight: 600; color: #1b4332">{{ consultationMoney(row.consultation, row.amount) }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('cashier.paymentMethod')" width="100">
            <template #default="{ row }">{{ getPaymentMethodLabel(row.method, t) }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.paymentTime')" width="160">
            <template #default="{ row }">{{ formatDateTime(row.date) }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.operation')" width="80">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click="viewInvoice(row)">{{ t('cashier.invoice') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

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
        <div class="inv-patient-row">
          <span><strong>地址：</strong>{{ formatPatientAddress(selectedConsult.patient) }}</span>
        </div>
        <div class="inv-patient-row">
          <span><strong>针灸师：</strong>{{ selectedConsult.practitioner?.name || '-' }}</span>
          <span><strong>组织：</strong>{{ selectedConsult.practitioner?.regulatoryBody || '-' }}</span>
          <span><strong>组织号：</strong>{{ selectedConsult.practitioner?.organizationNumber || selectedConsult.practitioner?.registrationNumber || '-' }}</span>
        </div>
        <el-divider />
        <el-table :data="selectedConsult.services || []" size="small">
          <el-table-column prop="name" :label="t('cashier.serviceItem')" />
          <el-table-column :label="t('cashier.amountCol')" width="100" align="right">
            <template #default="{ row }">{{ consultationMoney(selectedConsult, (Number(row.price || 0) * (row.quantity || 1)) - (row.manualDiscount || 0)) }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.taxIncluded')" width="60" align="center">
            <template #default="{ row }">{{ row.taxable ? '✓' : '-' }}</template>
          </el-table-column>
          <el-table-column :label="t('cashier.taxCol')" width="80" align="right">
            <template #default="{ row }">
              <span v-if="row.taxable">{{ consultationMoney(selectedConsult, ((Number(row.price || 0) * (row.quantity || 1)) - (row.manualDiscount || 0)) * toAmount(consultationTaxRate(selectedConsult))) }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="(selectedConsult.prescriptions || []).length > 0" style="margin-top:12px">
          <div style="font-weight:600; color:#555; margin-bottom:6px">药品收费</div>
          <el-table :data="selectedConsult.prescriptions || []" size="small">
            <el-table-column :label="'方剂'" min-width="120">
              <template #default="{ row }">{{ row.formulaName || '-' }}</template>
            </el-table-column>
            <el-table-column :label="'剂数'" width="60" align="center">
              <template #default="{ row }">{{ row.quantity || 1 }}</template>
            </el-table-column>
            <el-table-column :label="'小计'" width="100" align="right">
              <template #default="{ row }">{{ consultationMoney(selectedConsult, row.subtotal) }}</template>
            </el-table-column>
          </el-table>
        </div>
        <div class="inv-totals">
          <div class="inv-row"><span>{{ t('cashier.subtotal') }}</span><span>{{ consultationMoney(selectedConsult, selectedConsult.totalAmount - selectedConsult.taxAmount) }}</span></div>
          <div class="inv-row"><span>{{ t('cashier.salesTax', { rate: (toAmount(consultationTaxRate(selectedConsult)) * 100).toFixed(0) }) }}</span><span>{{ consultationMoney(selectedConsult, selectedConsult.taxAmount) }}</span></div>
          <div class="inv-row"><span>{{ t('cashier.totalCharge') }}</span><span>{{ consultationMoney(selectedConsult, selectedConsult.totalAmount) }}</span></div>
          <div class="inv-row"><span>{{ t('cashier.paidAmount') }}</span><span>{{ consultationMoney(selectedConsult, selectedConsult.paidAmount) }}</span></div>
          <div class="inv-row total"><span>{{ t('cashier.currentCharge') }}</span><span>{{ consultationMoney(selectedConsult, selectedConsult.outstandingAmount) }}</span></div>
        </div>
        <div v-if="selectedConsult.outstandingAmount > 0" style="margin-top: 12px">
          <strong style="font-size: 13px; color: #555">{{ t('cashier.paymentMethod') }}：</strong>
          <el-radio-group v-model="selectedPaymentMethod" size="small" style="margin-top: 6px">
            <el-radio-button v-for="m in paymentMethods" :key="m.value" :value="m.value">{{ m.label }}</el-radio-button>
          </el-radio-group>
        </div>
        <div class="inv-status">
          <el-tag :type="getPaymentStatusTagType(selectedConsult.paymentStatus)" size="large">
            {{ getPaymentStatusLabel(selectedConsult.paymentStatus) }}
          </el-tag>
        </div>
      </div>
      <template #footer>
        <el-button @click="showInvoiceDialog = false">{{ t('common.close') }}</el-button>
        <el-button v-if="selectedConsult?.outstandingAmount > 0" type="primary" @click="processPayment(selectedConsult)">
          {{ t('cashier.confirmPayment') }}
        </el-button>
        <el-button type="info" @click="handlePrintInvoice(selectedConsult)">
          {{ t('cashier.exportPdf') }}
        </el-button>
        <el-button type="success" @click="handleSendInvoiceEmail(selectedConsult)">
          {{ t('cashier.sendInvoiceEmail') }}
        </el-button>
      </template>
    </el-drawer>

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
  gap: 12px;
}

.payment-patient { display: flex; gap: 12px; align-items: center; }
.payment-name { font-weight: 600; font-size: 15px; }
.payment-date { font-size: 12px; color: #888; }

.payment-amount { text-align: right; }
.amount-total { font-size: 22px; font-weight: 700; color: #1b4332; }
.amount-meta { font-size: 12px; color: #888; margin-top: 2px; }

.payment-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

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

@media (max-width: 767px) {
  .payment-header,
  .payment-patient,
  .payment-actions,
  .inv-top,
  .inv-patient-row {
    align-items: stretch;
    flex-direction: column;
  }

  .payment-amount {
    text-align: left;
  }

  .payment-actions :deep(.el-button) {
    width: 100%;
    justify-content: center;
    margin-left: 0;
  }

  :deep(.el-drawer) {
    width: 100% !important;
  }
}
</style>
