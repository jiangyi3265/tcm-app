<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConsultationsStore } from '../../stores/consultations'
import { useAuthStore } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'
import { formatDate } from '../../utils/dateUtils'
import { emptyDiff } from '../../utils/sampleData'
import { localizeMixedJoinedValue, localizeMixedText } from '../../utils/localizeMixedText'
import { buildCopiedTreatmentData } from '../../utils/consultationCopy'
import { getActivePrescriptions, getPrescriptionStatus } from '../../utils/prescriptionWorkflow'
import {
  canSelectNewerHistory,
  canSelectOlderHistory,
  getHistoryDisplayOrder,
  getNewerHistoryIndex,
  getOlderHistoryIndex,
} from '../../utils/historyCompareNavigation'

const { t, locale } = useI18n()

const props = defineProps({
  patientId: { type: String, required: true },
  currentForm: { type: Object, required: true },
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['update:visible', 'copy-section', 'update-field'])

const consultStore = useConsultationsStore()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const compareRefreshing = ref(false)

const historyList = computed(() =>
  consultStore
    .getPatientConsultations(props.patientId)
    .filter((c) => c.id !== props.currentForm?.id),
)

const selectedIdx = ref(0)
const selected = computed(() => historyList.value[selectedIdx.value] || null)
const selectedOrder = computed(() => getHistoryDisplayOrder(selectedIdx.value, historyList.value.length))

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    selectedIdx.value = 0
    void refreshHistoryList()
  },
)

watch(historyList, (list) => {
  if (!props.visible) return
  if (selectedIdx.value >= list.length) {
    selectedIdx.value = Math.max(0, list.length - 1)
  }
})

async function refreshHistoryList() {
  if (compareRefreshing.value) return
  compareRefreshing.value = true
  try {
    await consultStore.refreshFromApi()
  } catch (error) {
    console.warn('Failed to refresh consultation history for compare:', error)
  } finally {
    compareRefreshing.value = false
  }
}

function prevHistory() {
  selectedIdx.value = getOlderHistoryIndex(selectedIdx.value, historyList.value.length)
}
function nextHistory() {
  selectedIdx.value = getNewerHistoryIndex(selectedIdx.value)
}

function copySection(section) {
  if (!selected.value) return
  const data = {}
  if (section === 'summary') {
    data.chiefComplaint = selected.value.chiefComplaint
    data.chiefComplaintDuration = selected.value.chiefComplaintDuration
    data.chiefComplaintDescription = selected.value.chiefComplaintDescription
    data.progressOfDisease = selected.value.progressOfDisease
    data.summary = selected.value.summary
  } else if (section === 'differentiation') {
    data.diff = JSON.parse(JSON.stringify(selected.value.diff || emptyDiff()))
    data.differentiation = selected.value.differentiation
  } else if (section === 'treatment') {
    Object.assign(data, buildCopiedTreatmentData(selected.value))
  } else if (section === 'pricing') {
    data.services = JSON.parse(JSON.stringify(selected.value.services || []))
    data.servicePriceList = selected.value.servicePriceList
    data.consultationFee = selected.value.consultationFee
    data.consultationFeeTaxable = selected.value.consultationFeeTaxable
    data.overrideTaxRate = selected.value.overrideTaxRate
    data.includeRxAmount = selected.value.includeRxAmount
    data.add3rdParty = selected.value.add3rdParty
    data.discountType = selected.value.discountType
    data.discountValue = selected.value.discountValue
    data.taxable = selected.value.taxable
    data.currency = selected.value.currency
  }
  emit('copy-section', data)
}

// 一键拷贝全部到当前（单次emit避免多条toast）
function copyAll() {
  if (!selected.value) return
  const data = {}
  // summary
  data.chiefComplaint = selected.value.chiefComplaint
  data.chiefComplaintDuration = selected.value.chiefComplaintDuration
  data.chiefComplaintDescription = selected.value.chiefComplaintDescription
  data.progressOfDisease = selected.value.progressOfDisease
  data.summary = selected.value.summary
  // differentiation
  data.diff = JSON.parse(JSON.stringify(selected.value.diff || emptyDiff()))
  data.differentiation = selected.value.differentiation
  // treatment
  Object.assign(data, buildCopiedTreatmentData(selected.value))
  // pricing
  data.services = JSON.parse(JSON.stringify(selected.value.services || []))
  data.servicePriceList = selected.value.servicePriceList
  data.consultationFee = selected.value.consultationFee
  data.consultationFeeTaxable = selected.value.consultationFeeTaxable
  data.overrideTaxRate = selected.value.overrideTaxRate
  data.includeRxAmount = selected.value.includeRxAmount
  data.add3rdParty = selected.value.add3rdParty
  data.discountType = selected.value.discountType
  data.discountValue = selected.value.discountValue
  data.taxable = selected.value.taxable
  data.currency = selected.value.currency
  emit('copy-section', data)
}

function getPractitionerName(id) {
  const u = authStore.users.find((u) => u.id === id || u.id === String(id))
  return u ? u.name : id
}

function formatAmount(value) {
  const amount = Number(value || 0)
  return amount.toFixed(2)
}

function money(value, currency = null) {
  const code = currency || settingsStore.currency || 'CAD'
  const prefix = ['CAD', 'USD'].includes(code) ? '$' : `${code} `
  return `${prefix}${formatAmount(value)}`
}

function formatSide(value) {
  const side = String(value || '').trim()
  if (side === 'bilateral') return 'Bilateral'
  if (side === 'left') return 'Left'
  if (side === 'right') return 'Right'
  return side || '-'
}

function getAcuRows(source = {}) {
  return Array.isArray(source?.acupuncture) ? source.acupuncture.filter((row) => row?.point) : []
}

function getPrescriptionTypeLabel(type) {
  const labels = {
    powder: 'Powder',
    raw_herbs: 'Raw herbs',
    pills: 'Pills',
    none: 'None',
  }
  return labels[type] || type || '-'
}

function getRxStatusLabel(rx) {
  const status = getPrescriptionStatus(rx)
  if (status === 'editing') return 'Editing'
  if (status === 'pending') return 'Pending'
  if (status === 'dispensed') return 'Dispensed'
  if (status === 'legacy') return 'Legacy'
  return status || '-'
}

function getRxRows(source = {}) {
  const active = getActivePrescriptions(source)
  if (active.length > 0) return active
  const herbals = Array.isArray(source?.herbals) ? source.herbals : []
  if (herbals.length === 0 || source?.prescriptionType === 'none') return []
  return [{
    formulaName: source.formulaName || '',
    prescriptionType: source.prescriptionType || 'raw_herbs',
    quantity: source.quantity || 1,
    direction: source.direction || '',
    whereToGet: source.whereToGet || '',
    rxStatus: 'legacy',
    items: herbals,
    subtotal: Number(source.prescriptionSubtotal || source.rxSubtotal || 0),
  }]
}

function getRxName(rx = {}) {
  return rx.formulaName || rx.name || rx.prescriptionType || 'Prescription'
}

function getRxItems(rx = {}) {
  return Array.isArray(rx.items) ? rx.items.filter((item) => item?.name || item?.herbName) : []
}

function formatDose(item = {}) {
  const dosage = item.dosage ?? item.originalDosage ?? ''
  const unit = item.unit || item.originalUnit || ''
  return `${dosage || '-'}${unit || ''}`
}

// 辨证对比辅助
const diffFields = computed(() => [
  { key: 'coldHeat', label: localizeMixedText('Cold/Heat 寒热', locale.value) },
  { key: 'sweat', label: localizeMixedText('Sweat 汗出', locale.value) },
  { key: 'headDiscomfort', label: localizeMixedText('Head 头部不适', locale.value) },
  { key: 'headPosition', label: localizeMixedText('Head Position 位置', locale.value) },
  { key: 'eye', label: localizeMixedText('Eye 眼睛', locale.value) },
  { key: 'ear', label: localizeMixedText('Ears 耳朵', locale.value) },
  { key: 'nose', label: localizeMixedText('Noses 鼻子', locale.value) },
  { key: 'mouth', label: localizeMixedText('Mouth 口', locale.value) },
  { key: 'taste', label: localizeMixedText('Taste 味道', locale.value) },
  { key: 'bodyDiscomforts', label: localizeMixedText('Body Discomforts 身体不适', locale.value) },
  { key: 'bodyDiscomfortsLocation', label: localizeMixedText('Body Location 位置', locale.value) },
  { key: 'skinIssues', label: localizeMixedText('Skin 皮肤', locale.value) },
  { key: 'chest', label: localizeMixedText('Chest 心胸', locale.value) },
  { key: 'hypochondriac', label: localizeMixedText('Hypochondriac 两胁', locale.value) },
  { key: 'sleep', label: localizeMixedText('Sleep 睡觉', locale.value) },
  { key: 'appetite', label: localizeMixedText('Appetite 胃口', locale.value) },
  { key: 'thirst', label: localizeMixedText('Thirst 口渴', locale.value) },
  { key: 'abdomen', label: localizeMixedText('Abdomen 腹部', locale.value) },
  { key: 'bowelMovement', label: localizeMixedText('Bowel 大便', locale.value) },
  { key: 'urine', label: localizeMixedText('Urine 小便', locale.value) },
  { key: 'bloodQuality', label: localizeMixedText('Blood Quality 经血', locale.value) },
  { key: 'pms', label: localizeMixedText('PMS 经期症状', locale.value) },
  { key: 'pulse', label: localizeMixedText('Pulse 脉', locale.value) },
  { key: 'detailedPulse', label: localizeMixedText('Detailed Pulse 脉详', locale.value) },
  { key: 'tongueColor', label: localizeMixedText('Tongue Color 舌色', locale.value) },
  { key: 'tongueBody', label: localizeMixedText('Tongue Body 舌体', locale.value) },
  { key: 'tongueCoating', label: localizeMixedText('Tongue Coating 舌苔', locale.value) },
  { key: 'pathologicalChannel', label: localizeMixedText('Channel 病变经络', locale.value) },
])

// 直接编辑当前记录的字段
function updateCurrentField(field, value) {
  emit('update-field', { [field]: value })
}
function updateCurrentDiffField(key, value) {
  emit('update-field', { diff: { ...props.currentForm.diff, [key]: value } })
}

function getDiffVal(consult, key) {
  const val = consult?.diff?.[key]
  if (Array.isArray(val)) return val.length > 0 ? localizeMixedJoinedValue(val, locale.value) : '-'
  return val != null && val !== '' ? localizeMixedJoinedValue(val, locale.value) : '-'
}
function isDiffChanged(key) {
  if (!selected.value || !props.currentForm) return false
  const a = selected.value.diff?.[key] || ''
  const b = props.currentForm.diff?.[key] || ''
  const aStr = Array.isArray(a) ? a.join(',') : a
  const bStr = Array.isArray(b) ? b.join(',') : b
  return aStr !== bStr
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    :title="t('compare.title')"
    width="92%"
    top="5vh"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    class="compare-dialog"
    v-loading="compareRefreshing"
  >
    <template v-if="historyList.length === 0">
      <el-empty :description="t('compare.noHistory')" />
    </template>

    <template v-else-if="selected">
      <!-- 历史记录切换 -->
      <div class="compare-nav">
        <el-button :disabled="!canSelectOlderHistory(selectedIdx, historyList.length)" circle size="small" @click="prevHistory">
          <el-icon><arrow-left /></el-icon>
        </el-button>
        <span class="compare-nav-info">
          {{ formatDate(selected.date) }} — {{ selected.consultationId }}
          <el-tag size="small" type="info" style="margin-left: 4px">
            {{ getPractitionerName(selected.practitionerId) }}
          </el-tag>
          <span style="color: #999; margin-left: 8px">
            ({{ selectedOrder }} / {{ historyList.length }})
          </span>
        </span>
        <el-button :disabled="!canSelectNewerHistory(selectedIdx)" circle size="small" @click="nextHistory">
          <el-icon><arrow-right /></el-icon>
        </el-button>
        <el-button size="small" type="primary" @click="copyAll" style="margin-left: 16px">
          {{ t('compare.copyAllToCurrent') }}
        </el-button>
        <el-button size="small" @click="emit('update:visible', false)">
          {{ t('common.close') }}
        </el-button>
      </div>

      <el-divider />

      <!-- ── Summary 对比 ── -->
      <div class="compare-section">
        <div class="compare-section-header">
          <h4>{{ t('compare.summary') }}</h4>
        </div>
        <el-table :data="[
          { field: t('compare.chiefComplaint'), key: 'chiefComplaint', old: selected.chiefComplaint, cur: currentForm.chiefComplaint },
          { field: t('compare.duration'), key: 'chiefComplaintDuration', old: selected.chiefComplaintDuration, cur: currentForm.chiefComplaintDuration },
          { field: t('compare.description'), key: 'chiefComplaintDescription', old: selected.chiefComplaintDescription, cur: currentForm.chiefComplaintDescription },
          { field: localizeMixedText('Progress 病程', locale.value), key: 'progressOfDisease', old: selected.progressOfDisease, cur: currentForm.progressOfDisease },
          { field: t('compare.prognosis'), key: 'prognosis', old: selected.prognosis, cur: currentForm.prognosis },
        ]" border size="small" style="width: 100%">
          <el-table-column label="Field" prop="field" width="180" />
          <el-table-column :label="`${t('compare.historyRecord')} (${formatDate(selected.date)})`">
            <template #default="{ row }">
              <span class="compare-old-text">{{ row.old || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="`${t('compare.currentRecord')} (${t('compare.editable')})`">
            <template #default="{ row }">
              <el-input
                :model-value="row.cur || ''"
                size="small"
                @update:model-value="(val) => updateCurrentField(row.key, val)"
                placeholder="---"
              />
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- ── Differentiation 对比 ── -->
      <div class="compare-section">
        <div class="compare-section-header">
          <h4>{{ t('compare.differentiation') }}</h4>
        </div>
        <el-table :data="diffFields" border size="small" style="width: 100%">
          <el-table-column :label="t('compare.field')" prop="label" width="80" />
          <el-table-column :label="t('compare.historyRecord')">
            <template #default="{ row }">
              <span :class="{ 'diff-changed': isDiffChanged(row.key) }">
                {{ getDiffVal(selected, row.key) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="`${t('compare.currentRecord')} (${t('compare.editable')})`">
            <template #default="{ row }">
              <el-input
                v-if="typeof currentForm.diff?.[row.key] === 'string' || currentForm.diff?.[row.key] == null"
                :model-value="currentForm.diff?.[row.key] || ''"
                size="small"
                @update:model-value="(val) => updateCurrentDiffField(row.key, val)"
                placeholder="---"
                :class="{ 'diff-changed': isDiffChanged(row.key) }"
              />
              <span v-else :class="{ 'diff-changed': isDiffChanged(row.key) }">
                {{ getDiffVal(currentForm, row.key) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
        <div style="margin-top: 8px">
          <strong>{{ t('compare.diffConclusion') }}</strong>
          <div class="compare-cell-pair">
            <div class="compare-old">{{ selected.differentiation || '-' }}</div>
            <div class="compare-new">{{ currentForm.differentiation || '-' }}</div>
          </div>
        </div>
      </div>

      <!-- ── Treatment 对比 ── -->
      <div class="compare-section">
        <div class="compare-section-header">
          <h4>{{ t('compare.treatment') }}</h4>
          <el-button size="small" type="primary" plain @click="copySection('treatment')">
            {{ t('compare.copyToCurrent') }}
          </el-button>
        </div>
        <!-- 针灸穴位 -->
        <div class="treatment-compare-grid">
          <div class="treatment-panel history">
            <div class="treatment-panel-title">{{ t('compare.historyRecord') }}</div>
            <div class="treatment-block">
              <div class="treatment-block-title">
                {{ t('compare.acuPoints') }}
                <span>{{ getAcuRows(selected).length }}</span>
              </div>
              <div v-if="getAcuRows(selected).length" class="acu-list">
                <div v-for="(pt, idx) in getAcuRows(selected)" :key="idx" class="acu-row">
                  <span class="acu-point">{{ pt.point }}</span>
                  <span class="acu-side">{{ formatSide(pt.side) }}</span>
                  <span class="acu-notes">{{ pt.notes || '-' }}</span>
                </div>
              </div>
              <div v-else class="empty-line">-</div>
            </div>

            <div class="treatment-block">
              <div class="treatment-block-title">
                {{ t('consultation.prescription') }}
                <span>{{ getRxRows(selected).length }}</span>
              </div>
              <div v-if="getRxRows(selected).length" class="rx-list">
                <div v-for="(rx, idx) in getRxRows(selected)" :key="rx.id || idx" class="compare-rx-card">
                  <div class="rx-card-head">
                    <div>
                      <div class="rx-title">{{ getRxName(rx) }}</div>
                      <div class="rx-meta">
                        {{ getPrescriptionTypeLabel(rx.prescriptionType) }}
                        / Qty {{ rx.quantity || 1 }}
                        / {{ getRxStatusLabel(rx) }}
                      </div>
                    </div>
                    <div class="rx-amount">{{ money(rx.subtotal, selected.currency) }}</div>
                  </div>
                  <div v-if="getRxItems(rx).length" class="rx-items">
                    <span v-for="(item, itemIdx) in getRxItems(rx)" :key="item.id || itemIdx">
                      {{ item.name || item.herbName }} {{ formatDose(item) }}
                    </span>
                  </div>
                </div>
              </div>
              <div v-else class="empty-line">-</div>
            </div>
          </div>

          <div class="treatment-panel current">
            <div class="treatment-panel-title">{{ t('compare.currentRecord') }}</div>
            <div class="treatment-block">
              <div class="treatment-block-title">
                {{ t('compare.acuPoints') }}
                <span>{{ getAcuRows(currentForm).length }}</span>
              </div>
              <div v-if="getAcuRows(currentForm).length" class="acu-list">
                <div v-for="(pt, idx) in getAcuRows(currentForm)" :key="idx" class="acu-row">
                  <span class="acu-point">{{ pt.point }}</span>
                  <span class="acu-side">{{ formatSide(pt.side) }}</span>
                  <span class="acu-notes">{{ pt.notes || '-' }}</span>
                </div>
              </div>
              <div v-else class="empty-line">-</div>
            </div>

            <div class="treatment-block">
              <div class="treatment-block-title">
                {{ t('consultation.prescription') }}
                <span>{{ getRxRows(currentForm).length }}</span>
              </div>
              <div v-if="getRxRows(currentForm).length" class="rx-list">
                <div v-for="(rx, idx) in getRxRows(currentForm)" :key="rx.id || idx" class="compare-rx-card">
                  <div class="rx-card-head">
                    <div>
                      <div class="rx-title">{{ getRxName(rx) }}</div>
                      <div class="rx-meta">
                        {{ getPrescriptionTypeLabel(rx.prescriptionType) }}
                        / Qty {{ rx.quantity || 1 }}
                        / {{ getRxStatusLabel(rx) }}
                      </div>
                    </div>
                    <div class="rx-amount">{{ money(rx.subtotal, currentForm.currency) }}</div>
                  </div>
                  <div v-if="getRxItems(rx).length" class="rx-items">
                    <span v-for="(item, itemIdx) in getRxItems(rx)" :key="item.id || itemIdx">
                      {{ item.name || item.herbName }} {{ formatDose(item) }}
                    </span>
                  </div>
                </div>
              </div>
              <div v-else class="empty-line">-</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Pricing 对比 ── -->
      <div class="compare-section">
        <div class="compare-section-header">
          <h4>{{ t('compare.pricing') }}</h4>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item :label="t('compare.totalAmount')">
            <div class="compare-cell-pair">
              <div class="compare-old">{{ money(selected.totalAmount, selected.currency) }}</div>
              <div class="compare-new">{{ money(currentForm.totalAmount, currentForm.currency) }}</div>
            </div>
          </el-descriptions-item>
          <el-descriptions-item :label="t('compare.taxAmount')">
            <div class="compare-cell-pair">
              <div class="compare-old">{{ money(selected.taxAmount, selected.currency) }}</div>
              <div class="compare-new">{{ money(currentForm.taxAmount, currentForm.currency) }}</div>
            </div>
          </el-descriptions-item>
        </el-descriptions>
        <p style="margin-top: 8px"><strong>{{ t('compare.serviceItems') }}</strong></p>
        <div class="compare-cell-pair">
          <div class="compare-old">
            <div v-for="(s, i) in selected.services || []" :key="i" class="service-item">
              {{ s.name }} × {{ s.quantity }} = {{ money(s.price * s.quantity, selected.currency) }}
            </div>
            <span v-if="!selected.services?.length">-</span>
          </div>
          <div class="compare-new">
            <div v-for="(s, i) in currentForm.services || []" :key="i" class="service-item">
              {{ s.name }} × {{ s.quantity }} = {{ money(s.price * s.quantity, currentForm.currency) }}
            </div>
            <span v-if="!currentForm.services?.length">-</span>
          </div>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.compare-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  flex-wrap: wrap;
  position: sticky;
  top: 0;
  z-index: 3;
  background: #fff;
}
.compare-nav-info {
  flex: 1 1 320px;
  min-width: 0;
  text-align: center;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.compare-section {
  margin-bottom: 20px;
  overflow-x: auto;
}
.compare-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.compare-section-header h4 {
  margin: 0;
  color: #2d6a4f;
}
.compare-cell-pair {
  display: flex;
  gap: 12px;
  align-items: stretch;
}
.compare-old {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  background: #fef0f0;
  border-radius: 4px;
  font-size: 13px;
  min-height: 24px;
  overflow-wrap: anywhere;
}
.compare-new {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  background: #f0f9eb;
  border-radius: 4px;
  font-size: 13px;
  min-height: 24px;
  overflow-wrap: anywhere;
}
.diff-changed {
  color: #e6a23c;
  font-weight: 600;
}
.herbal-item,
.service-item {
  font-size: 12px;
  line-height: 1.6;
}
.compare-old-text {
  color: #c45656;
}
.compare-new-text {
  color: #529b2e;
}
.treatment-compare-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
.treatment-panel {
  min-width: 0;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fafafa;
  padding: 12px;
}
.treatment-panel.current {
  border-color: #b7dfc4;
  background: #f6fbf8;
}
.treatment-panel-title {
  margin-bottom: 10px;
  color: #2d6a4f;
  font-weight: 600;
}
.treatment-block + .treatment-block {
  margin-top: 12px;
}
.treatment-block-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  color: #606266;
  font-size: 13px;
  font-weight: 600;
}
.treatment-block-title span {
  color: #909399;
  font-weight: 500;
}
.acu-list,
.rx-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.acu-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 88px minmax(120px, 1fr);
  gap: 8px;
  align-items: center;
  padding: 7px 8px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
}
.acu-point {
  color: #303133;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.acu-side {
  color: #409eff;
}
.acu-notes {
  color: #606266;
  overflow-wrap: anywhere;
}
.compare-rx-card {
  padding: 9px 10px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
}
.rx-card-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.rx-title {
  color: #303133;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.rx-meta {
  margin-top: 3px;
  color: #909399;
  font-size: 12px;
}
.rx-amount {
  color: #2d6a4f;
  font-weight: 600;
  white-space: nowrap;
}
.rx-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.rx-items span {
  padding: 3px 6px;
  border-radius: 4px;
  background: #f5f7fa;
  color: #606266;
  font-size: 12px;
}
.empty-line {
  padding: 8px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  background: #fff;
  color: #c0c4cc;
  font-size: 13px;
}

@media (max-width: 1180px) {
  .treatment-compare-grid {
    grid-template-columns: 1fr;
  }

  .acu-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .compare-section :deep(.el-table) {
    min-width: 760px;
  }
}

@media (max-width: 768px) {
  .compare-cell-pair {
    flex-direction: column;
  }

  .compare-section :deep(.el-table) {
    min-width: 680px;
  }
}
</style>

<!-- 非 scoped：el-dialog 被 teleport 到 body，需用全局选择器约束尺寸 -->
<style>
.compare-dialog {
  max-width: 1100px;
}
.compare-dialog .el-dialog__body {
  max-height: 78vh;
  overflow-y: auto;
  padding-top: 0;
}
</style>
