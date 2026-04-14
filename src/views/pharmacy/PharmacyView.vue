<script setup>
import { ref, computed, inject, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConsultationsStore } from '../../stores/consultations'
import { usePatientsStore } from '../../stores/patients'
import { useAuthStore } from '../../stores/auth'
import { useInventoryStore } from '../../stores/inventory'
import { useBranchesStore } from '../../stores/branches'
import { formatDate, formatDateTime } from '../../utils/dateUtils'
import {
  getActivePrescriptions,
  getOutstandingAmount,
  getPaidAmount,
  getPaymentRecords,
  getPaymentStatus,
  getPrescriptionStatus,
} from '../../utils/prescriptionWorkflow'
import { getPaymentMethodLabel, getPaymentMethodOptions, normalizePaymentMethodValue } from '../../utils/paymentMethods'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t, locale } = useI18n()
const consultationsStore = useConsultationsStore()
const patientsStore = usePatientsStore()
const authStore = useAuthStore()
const inventoryStore = useInventoryStore()
const branchesStore = useBranchesStore()
const isMobile = inject('isMobile', ref(false))

const activeTab = ref('pending')
const selectedRow = ref(null)
const showDetailDialog = ref(false)
const drawerSize = computed(() => (isMobile.value ? '100%' : '560px'))
const selectedPaymentMethod = ref('cash')

onMounted(() => {
  consultationsStore.refreshFromApi().catch((error) => {
    console.warn('发药台刷新问诊失败:', error.message)
  })
})

const CATEGORY_MAP = { raw_herbs: 'raw_herbs', powder: 'powder', pills: 'pills' }

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

function getPrescriptionStatusTagType(status) {
  if (status === 'dispensed') return 'success'
  if (status === 'pending') return 'warning'
  return 'info'
}

function getPrescriptionStatusLabel(status) {
  if (status === 'dispensed') return t('pharmacy.statusDispensed')
  if (status === 'pending') return t('pharmacy.statusPending')
  return t('pharmacy.statusEditing')
}

function buildPrescriptionRow(consultation, prescription) {
  const patient = patientsStore.getPatient(consultation.patientId)
  const practitioner = authStore.users.find((u) => u.id === consultation.practitionerId)
  return {
    id: `${consultation.id}:${prescription.id}`,
    consultationId: consultation.id,
    prescriptionId: prescription.id,
    consultation,
    prescription,
    patient,
    practitioner,
    quantity: Number(prescription.quantity || 1),
    items: Array.isArray(prescription.items) ? prescription.items : [],
    formulaName: prescription.formulaName || consultation.formulaName || t('common.customFormula'),
    prescriptionType: prescription.prescriptionType || consultation.prescriptionType || 'raw_herbs',
    rxStatus: getPrescriptionStatus(prescription),
    paymentStatus: getPaymentStatus(consultation),
    paidAmount: getPaidAmount(consultation),
    outstandingAmount: getOutstandingAmount(consultation),
  }
}

const prescriptionRows = computed(() => {
  const branchId = branchesStore.currentBranchId
  return consultationsStore.consultations
    .filter((consultation) => !consultation.deletedAt && (!branchId || consultation.branchId === branchId || !consultation.branchId))
    .flatMap((consultation) => getActivePrescriptions(consultation).map((prescription) => buildPrescriptionRow(consultation, prescription)))
    .sort((a, b) => new Date(b.consultation?.date || 0) - new Date(a.consultation?.date || 0))
})

const editingRows = computed(() => prescriptionRows.value.filter((row) => row.rxStatus === 'editing'))
const pendingRows = computed(() => prescriptionRows.value.filter((row) => row.rxStatus === 'pending'))
const dispensedRows = computed(() => prescriptionRows.value.filter((row) => row.rxStatus === 'dispensed'))

const paymentMethods = computed(() => getPaymentMethodOptions(t))

function formatAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

function getConsultPrescriptionItems(row) {
  return Array.isArray(row?.items) ? row.items : []
}

function matchInventory(item, prescriptionType) {
  if (!item) return null
  const category = CATEGORY_MAP[prescriptionType] || 'raw_herbs'
  const activeItems = inventoryStore.items
    .filter((inventoryItem) => inventoryItem.isActive && !inventoryItem.deletedAt && inventoryItem.category === category)

  if (item.inventoryId) {
    const byInventoryId = activeItems.find((inventoryItem) => inventoryItem.id === item.inventoryId)
    if (byInventoryId) return byInventoryId
  }

  if (item.herbDictId) {
    const byHerbDict = activeItems
      .filter((inventoryItem) => inventoryItem.herbDictId === item.herbDictId)
      .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))
    if (byHerbDict.length > 0) return byHerbDict[0]
  }

  const herbName = String(item.name || item.herbName || '').trim().toLowerCase()
  if (!herbName) return null

  const exactName = activeItems
    .filter((inventoryItem) => String(inventoryItem.name || '').trim().toLowerCase() === herbName)
    .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))
  if (exactName.length > 0) return exactName[0]

  const fuzzyName = activeItems
    .filter((inventoryItem) => String(inventoryItem.name || '').toLowerCase().includes(herbName))
    .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))
  return fuzzyName[0] || null
}

function getRequiredQuantity(item, row) {
  if (item?.convertedQty != null) return Number(item.convertedQty || 0)
  return Number(item?.dosage || 0) * Number(row?.quantity || 1)
}

function getRequiredUnit(item, prescriptionType) {
  if (item?.convertedUnit) return item.convertedUnit
  if (item?.unit) return item.unit
  return { raw_herbs: 'g', powder: '包', pills: '盒' }[prescriptionType] || 'g'
}

function formatMedicineAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '0'
  if (Number.isInteger(amount)) return String(amount)
  return amount.toFixed(2).replace(/\.?0+$/, '')
}

function getPerDoseQuantity(item, row) {
  const doses = Number(row?.quantity || 1)
  if (row?.prescriptionType === 'powder') {
    if (item?.packetsPerDose != null) return Number(item.packetsPerDose || 0)
    if (item?.convertedQty != null && doses > 0) return Number(item.convertedQty || 0) / doses
  }
  if (row?.prescriptionType === 'pills' && item?.convertedQty != null) {
    return Number(item.convertedQty || 0)
  }
  return Number(item?.dosage || 0)
}

function getPerDoseUnit(item, row) {
  if (row?.prescriptionType === 'powder' || row?.prescriptionType === 'pills') {
    return item?.convertedUnit || getRequiredUnit(item, row?.prescriptionType)
  }
  return item?.unit || getRequiredUnit(item, row?.prescriptionType)
}

function formatDispenseDisplay(item, row) {
  const perDoseQuantity = formatMedicineAmount(getPerDoseQuantity(item, row))
  const unit = getPerDoseUnit(item, row)
  const doses = formatMedicineAmount(row?.quantity || 1)
  if (locale.value === 'zh-CN') {
    return `${perDoseQuantity}${unit}/剂 · 共${doses}剂`
  }
  return `${perDoseQuantity}${unit}/dose · ${doses} doses`
}

function buildHerbSummary(row) {
  return getConsultPrescriptionItems(row)
    .map((item) => `${item.name} ${formatDispenseDisplay(item, row)}`)
    .join('　')
}

function refreshSelectedRow(consultationId, prescriptionId) {
  const consultation = consultationsStore.getConsultation(consultationId)
  const prescription = getActivePrescriptions(consultation).find((item) => item.id === prescriptionId)
  if (!consultation || !prescription) {
    showDetailDialog.value = false
    selectedRow.value = null
    return
  }
  selectedRow.value = buildPrescriptionRow(consultation, prescription)
}

function viewDetail(row) {
  selectedRow.value = row
  selectedPaymentMethod.value = 'cash'
  showDetailDialog.value = true
}

async function processPayment(row) {
  if (!row || row.outstandingAmount <= 0) {
    ElMessage.info(t('cashier.noPendingAmount'))
    return
  }

  try {
    await ElMessageBox.confirm(
      t('cashier.confirmPaymentMsg', { name: row.patient?.name, amount: formatAmount(row.outstandingAmount) }),
      t('cashier.confirmPaymentTitle'),
      { type: 'success' },
    )
  } catch {
    return
  }

  try {
    const updated = await consultationsStore.markAsPaid(row.consultationId, {
      paymentMethod: normalizePaymentMethodValue(selectedPaymentMethod.value),
      amount: row.outstandingAmount,
    })
    refreshSelectedRow(updated?.id || row.consultationId, row.prescriptionId)
    ElMessage.success(t('cashier.paymentSuccess'))
  } catch (error) {
    ElMessage.error(error.message || t('cashier.paymentFailed'))
  }
}

async function markDispensed(row) {
  if (!row) return
  try {
    await ElMessageBox.confirm(
      t('pharmacy.confirmDispenseMsg', { name: row.patient?.name }),
      t('pharmacy.confirmDispenseTitle'),
      { type: 'success' },
    )
  } catch {
    return
  }

  try {
    const updated = await consultationsStore.dispensePrescription(row.consultationId, row.prescriptionId)
    refreshSelectedRow(updated?.id || row.consultationId, row.prescriptionId)
    ElMessage.success(t('pharmacy.dispensed'))
  } catch (error) {
    ElMessage.error(error.message || t('pharmacy.stockWarning'))
  }
}

async function reopenPrescription(row) {
  if (!row) return
  try {
    const updated = await consultationsStore.reopenPrescription(row.consultationId, row.prescriptionId)
    refreshSelectedRow(updated?.id || row.consultationId, row.prescriptionId)
    ElMessage.success(t('consultation.rxReopened'))
  } catch (error) {
    ElMessage.error(error.message || t('common.operationFailed'))
  }
}
</script>

<template>
  <div class="pharmacy-view">
    <div class="pharmacy-header">
      <h2>{{ t('pharmacy.title') }}</h2>
      <el-badge :value="pendingRows.length" :hidden="pendingRows.length === 0">
        <el-tag type="warning">{{ t('pharmacy.pendingPrescriptions') }}</el-tag>
      </el-badge>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane :label="t('pharmacy.editingTab')" name="editing">
        <div v-if="editingRows.length === 0" class="empty-state">
          <el-empty :description="t('pharmacy.noEditing')" />
        </div>
        <div v-else class="prescription-list">
          <el-card v-for="row in editingRows" :key="row.id" class="rx-card" @click="viewDetail(row)">
            <div class="rx-card-header">
              <div class="rx-patient-info">
                <el-avatar :size="40" style="background: var(--color-primary)">
                  {{ row.patient?.name?.charAt(0) }}
                </el-avatar>
                <div>
                  <div class="rx-patient-name">{{ row.patient?.name }}</div>
                  <div class="rx-date">{{ formatDate(row.consultation?.date) }} · {{ row.practitioner?.name }}</div>
                </div>
              </div>
              <div class="rx-tag-group">
                <el-tag type="info">{{ getPrescriptionStatusLabel(row.rxStatus) }}</el-tag>
                <el-tag :type="row.prescriptionType === 'powder' ? 'warning' : row.prescriptionType === 'pills' ? '' : 'success'">
                  {{ t('pharmacy.prescriptionType.' + (row.prescriptionType || 'raw_herbs')) }}
                </el-tag>
              </div>
            </div>
            <div class="rx-formula">
              <span class="rx-formula-name">{{ row.formulaName }}</span>
            </div>
            <div v-if="row.items.length > 0" class="rx-herbs">
              {{ buildHerbSummary(row) }}
            </div>
            <div class="rx-meta">
              <span>{{ t('cashier.currentCharge') }} ${{ formatAmount(row.outstandingAmount) }}</span>
              <span>{{ t('cashier.paidAmount') }} ${{ formatAmount(row.paidAmount) }}</span>
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('pharmacy.pendingTab')" name="pending">
        <div v-if="pendingRows.length === 0" class="empty-state">
          <el-empty :description="t('pharmacy.noPending')" />
        </div>
        <div v-else class="prescription-list">
          <el-card v-for="row in pendingRows" :key="row.id" class="rx-card" @click="viewDetail(row)">
            <div class="rx-card-header">
              <div class="rx-patient-info">
                <el-avatar :size="40" style="background: var(--color-primary)">
                  {{ row.patient?.name?.charAt(0) }}
                </el-avatar>
                <div>
                  <div class="rx-patient-name">{{ row.patient?.name }}</div>
                  <div class="rx-date">{{ formatDate(row.consultation?.date) }} · {{ row.practitioner?.name }}</div>
                </div>
              </div>
              <div class="rx-tag-group">
                <el-tag type="warning">{{ getPrescriptionStatusLabel(row.rxStatus) }}</el-tag>
                <el-tag :type="getPaymentStatusTagType(row.paymentStatus)">
                  {{ getPaymentStatusLabel(row.paymentStatus) }}
                </el-tag>
              </div>
            </div>

            <div class="rx-formula">
              <span class="rx-formula-name">{{ row.formulaName }}</span>
              <el-tag size="small" :type="row.prescriptionType === 'powder' ? 'warning' : row.prescriptionType === 'pills' ? '' : 'success'" style="margin-left: 6px">
                {{ t('pharmacy.prescriptionType.' + (row.prescriptionType || 'raw_herbs')) }}
              </el-tag>
            </div>

            <div v-if="row.items.length > 0" class="rx-herbs">
              {{ buildHerbSummary(row) }}
            </div>

            <div class="rx-actions" @click.stop>
              <span class="rx-amount">{{ t('cashier.currentCharge') }} ${{ formatAmount(row.outstandingAmount) }}</span>
              <el-button v-if="row.outstandingAmount > 0" size="small" @click="processPayment(row)">
                {{ t('pharmacy.collectPayment') }}
              </el-button>
              <el-button type="success" size="small" @click="markDispensed(row)">
                <el-icon><Check /></el-icon> {{ t('pharmacy.confirmDispense') }}
              </el-button>
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('pharmacy.dispensedTab')" name="dispensed">
        <div v-if="dispensedRows.length === 0" class="empty-state">
          <el-empty :description="t('pharmacy.noDispensed')" />
        </div>
        <div v-else class="wide-table-wrap">
          <el-table :data="dispensedRows" stripe>
            <el-table-column :label="t('pharmacy.patient')" min-width="100">
              <template #default="{ row }">{{ row.patient?.name }}</template>
            </el-table-column>
            <el-table-column :label="t('pharmacy.date')" width="120">
              <template #default="{ row }">{{ formatDate(row.consultation?.date) }}</template>
            </el-table-column>
            <el-table-column :label="t('pharmacy.formula')" min-width="120">
              <template #default="{ row }">{{ row.formulaName }}</template>
            </el-table-column>
            <el-table-column :label="t('pharmacy.type')" width="80">
              <template #default="{ row }">{{ t('pharmacy.prescriptionType.' + (row.prescriptionType || 'raw_herbs')) }}</template>
            </el-table-column>
            <el-table-column :label="t('pharmacy.practitioner')" min-width="80">
              <template #default="{ row }">{{ row.practitioner?.name }}</template>
            </el-table-column>
            <el-table-column :label="t('pharmacy.dispensedAt')" width="160">
              <template #default="{ row }">{{ formatDateTime(row.prescription?.dispensedAt || row.consultation?.dispensingCompletedAt) || '-' }}</template>
            </el-table-column>
            <el-table-column :label="t('common.operation')" width="120">
              <template #default="{ row }">
                <el-button size="small" text type="primary" @click="viewDetail(row)">{{ t('common.view') }}</el-button>
                <el-button
                  v-if="authStore.roles.includes('admin')"
                  size="small"
                  text
                  type="warning"
                  @click="reopenPrescription(row)"
                >
                  {{ t('consultation.reopenRx') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="showDetailDialog" :title="t('pharmacy.prescriptionDetail')" :size="drawerSize" direction="rtl">
      <div v-if="selectedRow" class="rx-detail">
        <div class="rx-detail-header">
          <div>
            <strong>{{ selectedRow.patient?.name }}</strong>
            <span style="color:#888; margin-left: 8px">{{ formatDate(selectedRow.consultation?.date) }}</span>
          </div>
          <div class="rx-tag-group">
            <el-tag :type="getPrescriptionStatusTagType(selectedRow.rxStatus)">
              {{ getPrescriptionStatusLabel(selectedRow.rxStatus) }}
            </el-tag>
            <el-tag :type="getPaymentStatusTagType(selectedRow.paymentStatus)">
              {{ getPaymentStatusLabel(selectedRow.paymentStatus) }}
            </el-tag>
          </div>
        </div>

        <div class="rx-detail-formula">
          <el-tag type="success">{{ selectedRow.formulaName }}</el-tag>
          <el-tag size="small" style="margin-left: 6px" :type="selectedRow.prescriptionType === 'powder' ? 'warning' : selectedRow.prescriptionType === 'pills' ? '' : 'success'">
            {{ t('pharmacy.prescriptionType.' + (selectedRow.prescriptionType || 'raw_herbs')) }}
          </el-tag>
        </div>

        <div class="rx-payment-card">
          <div>{{ t('cashier.totalCharge') }}: ${{ formatAmount(selectedRow.consultation?.totalAmount) }}</div>
          <div>{{ t('cashier.paidAmount') }}: ${{ formatAmount(selectedRow.paidAmount) }}</div>
          <div>{{ t('cashier.currentCharge') }}: ${{ formatAmount(selectedRow.outstandingAmount) }}</div>
          <div v-if="getPaymentRecords(selectedRow.consultation).length">
            {{ t('cashier.paymentMethod') }}：{{ getPaymentMethodLabel(getPaymentRecords(selectedRow.consultation)[0]?.method, t) }}
          </div>
        </div>

        <div v-if="selectedRow.outstandingAmount > 0" style="margin-top: 12px">
          <strong style="font-size: 13px; color: #555">{{ t('cashier.paymentMethod') }}：</strong>
          <el-radio-group v-model="selectedPaymentMethod" size="small" style="margin-top: 6px">
            <el-radio-button v-for="m in paymentMethods" :key="m.value" :value="m.value">{{ m.label }}</el-radio-button>
          </el-radio-group>
        </div>

        <div class="wide-table-wrap">
          <el-table :data="getConsultPrescriptionItems(selectedRow)" size="small" style="margin-top: 12px">
            <el-table-column prop="name" :label="t('pharmacy.herb')" />
            <el-table-column :label="t('pharmacy.dosageCol')" width="140">
              <template #default="{ row }">
                <span>{{ formatDispenseDisplay(row, selectedRow) }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('pharmacy.stockStatus')" width="180">
              <template #default="{ row }">
                <span>
                  <template v-if="matchInventory(row, selectedRow.prescriptionType)">
                    <el-tag
                      :type="Number(matchInventory(row, selectedRow.prescriptionType).quantity || 0) >= getRequiredQuantity(row, selectedRow) ? 'success' : 'danger'"
                      size="small"
                    >
                      {{ matchInventory(row, selectedRow.prescriptionType).quantity }}{{ getRequiredUnit(row, selectedRow.prescriptionType) }}
                    </el-tag>
                    <div style="font-size:11px; color:#888; margin-top:2px">
                      {{ matchInventory(row, selectedRow.prescriptionType).supplier ? matchInventory(row, selectedRow.prescriptionType).supplier + ' · ' : '' }}{{ { raw_herbs: t('pharmacy.prescriptionType.raw_herbs'), powder: t('pharmacy.prescriptionType.powder'), pills: t('pharmacy.prescriptionType.pills') }[matchInventory(row, selectedRow.prescriptionType).category] || '' }}
                    </div>
                  </template>
                  <el-tag v-else type="info" size="small">{{ t('pharmacy.noStock') }}</el-tag>
                </span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div style="margin-top: 12px; font-size: 13px; color: #666">
          <strong>{{ t('pharmacy.diagnosis') }}</strong>{{ selectedRow.consultation?.differentiation }}
        </div>
      </div>
      <template #footer>
        <el-button @click="showDetailDialog = false">{{ t('common.close') }}</el-button>
        <el-button v-if="selectedRow?.outstandingAmount > 0" @click="processPayment(selectedRow)">
          {{ t('pharmacy.collectPayment') }}
        </el-button>
        <el-button v-if="selectedRow?.rxStatus === 'pending'" type="success" @click="markDispensed(selectedRow)">
          {{ t('pharmacy.confirmDispense') }}
        </el-button>
        <el-button
          v-if="selectedRow?.rxStatus === 'dispensed' && authStore.roles.includes('admin')"
          type="warning"
          @click="reopenPrescription(selectedRow)"
        >
          {{ t('consultation.reopenRx') }}
        </el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.pharmacy-view { max-width: 100%; }

.pharmacy-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.pharmacy-header h2 { font-size: 20px; color: #1b4332; }

.empty-state { padding: 40px; display: flex; justify-content: center; }

.prescription-list { display: flex; flex-direction: column; gap: 12px; }

.rx-card {
  border-radius: 10px;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.rx-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); }

.rx-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 12px;
}

.rx-patient-info { display: flex; gap: 12px; align-items: center; }
.rx-patient-name { font-weight: 600; font-size: 15px; }
.rx-date { font-size: 12px; color: #888; }
.rx-tag-group { display: flex; gap: 6px; flex-wrap: wrap; }
.rx-formula { margin-bottom: 6px; }
.rx-formula-name { font-weight: 600; color: #2d6a4f; }
.wide-table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }

.rx-herbs {
  font-size: 13px;
  color: #555;
  line-height: 1.8;
  background: #f9f9f9;
  padding: 8px;
  border-radius: 6px;
  margin-bottom: 10px;
}

.rx-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #777;
}

.rx-actions {
  text-align: right;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.rx-amount {
  font-size: 12px;
  color: #666;
  margin-right: auto;
}

.rx-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 12px;
}

.rx-detail-formula { margin-bottom: 6px; }

.rx-payment-card {
  margin-top: 12px;
  border-radius: 8px;
  background: #f8fafc;
  padding: 12px;
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #555;
}

@media (max-width: 767px) {
  .pharmacy-header,
  .rx-card-header,
  .rx-detail-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .rx-patient-info {
    width: 100%;
  }

  .rx-actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .wide-table-wrap :deep(.el-table) {
    min-width: 560px;
  }
}
</style>
