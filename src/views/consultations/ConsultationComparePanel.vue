<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConsultationsStore } from '../../stores/consultations'
import { useAuthStore } from '../../stores/auth'
import { formatDate } from '../../utils/dateUtils'
import { emptyDiff } from '../../utils/sampleData'
import { localizeMixedJoinedValue, localizeMixedText } from '../../utils/localizeMixedText'
import { buildCopiedTreatmentData } from '../../utils/consultationCopy'

const { t, locale } = useI18n()

const props = defineProps({
  patientId: { type: String, required: true },
  currentForm: { type: Object, required: true },
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['update:visible', 'copy-section', 'update-field'])

const consultStore = useConsultationsStore()
const authStore = useAuthStore()

const historyList = computed(() =>
  consultStore
    .getPatientConsultations(props.patientId)
    .filter((c) => c.id !== props.currentForm?.id),
)

const selectedIdx = ref(0)
const selected = computed(() => historyList.value[selectedIdx.value] || null)

watch(
  () => props.visible,
  (v) => {
    if (v) selectedIdx.value = 0
  },
)

function prevHistory() {
  if (selectedIdx.value > 0) selectedIdx.value--
}
function nextHistory() {
  if (selectedIdx.value < historyList.value.length - 1) selectedIdx.value++
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
    fullscreen
    :close-on-click-modal="true"
    class="compare-fullscreen-dialog"
  >
    <template v-if="historyList.length === 0">
      <el-empty :description="t('compare.noHistory')" />
    </template>

    <template v-else-if="selected">
      <!-- 历史记录切换 -->
      <div class="compare-nav">
        <el-button :disabled="selectedIdx <= 0" circle size="small" @click="prevHistory">
          <el-icon><arrow-left /></el-icon>
        </el-button>
        <span class="compare-nav-info">
          {{ formatDate(selected.date) }} — {{ selected.consultationId }}
          <el-tag size="small" type="info" style="margin-left: 4px">
            {{ getPractitionerName(selected.practitionerId) }}
          </el-tag>
          <span style="color: #999; margin-left: 8px">
            ({{ selectedIdx + 1 }} / {{ historyList.length }})
          </span>
        </span>
        <el-button :disabled="selectedIdx >= historyList.length - 1" circle size="small" @click="nextHistory">
          <el-icon><arrow-right /></el-icon>
        </el-button>
        <el-button size="small" type="primary" @click="copyAll" style="margin-left: 16px">
          {{ t('compare.copyAllToCurrent') }}
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
        </div>
        <!-- 针灸穴位 -->
        <p><strong>{{ t('compare.acuPoints') }}</strong></p>
        <div class="compare-cell-pair" style="margin-bottom: 8px">
          <div class="compare-old">
            <el-tag
              v-for="(pt, idx) in selected.acupuncture || []"
              :key="idx"
              size="small"
              style="margin: 2px"
            >
              {{ pt.point }} ({{ pt.side }})
            </el-tag>
            <span v-if="!selected.acupuncture?.length">-</span>
          </div>
          <div class="compare-new">
            <el-tag
              v-for="(pt, idx) in currentForm.acupuncture || []"
              :key="idx"
              size="small"
              style="margin: 2px"
            >
              {{ pt.point }} ({{ pt.side }})
            </el-tag>
            <span v-if="!currentForm.acupuncture?.length">-</span>
          </div>
        </div>
        <!-- 处方 -->
        <p><strong>{{ t('compare.rxType') }}</strong></p>
        <div class="compare-cell-pair" style="margin-bottom: 8px">
          <div class="compare-old">{{ selected.prescriptionType || 'none' }} — {{ selected.formulaName || '-' }}</div>
          <div class="compare-new">{{ currentForm.prescriptionType || 'none' }} — {{ currentForm.formulaName || '-' }}</div>
        </div>
        <!-- 药材 -->
        <p><strong>{{ t('compare.herbList') }}</strong></p>
        <div class="compare-cell-pair">
          <div class="compare-old">
            <div v-for="(h, i) in selected.herbals || []" :key="i" class="herbal-item">
              {{ h.name }} {{ h.dosage }}{{ h.unit }}
            </div>
            <span v-if="!selected.herbals?.length">-</span>
          </div>
          <div class="compare-new">
            <div v-for="(h, i) in currentForm.herbals || []" :key="i" class="herbal-item">
              {{ h.name }} {{ h.dosage }}{{ h.unit }}
            </div>
            <span v-if="!currentForm.herbals?.length">-</span>
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
              <div class="compare-old">${{ selected.totalAmount || 0 }}</div>
              <div class="compare-new">${{ currentForm.totalAmount || 0 }}</div>
            </div>
          </el-descriptions-item>
          <el-descriptions-item :label="t('compare.taxAmount')">
            <div class="compare-cell-pair">
              <div class="compare-old">${{ selected.taxAmount || 0 }}</div>
              <div class="compare-new">${{ currentForm.taxAmount || 0 }}</div>
            </div>
          </el-descriptions-item>
        </el-descriptions>
        <p style="margin-top: 8px"><strong>{{ t('compare.serviceItems') }}</strong></p>
        <div class="compare-cell-pair">
          <div class="compare-old">
            <div v-for="(s, i) in selected.services || []" :key="i" class="service-item">
              {{ s.name }} × {{ s.quantity }} = ${{ s.price * s.quantity }}
            </div>
            <span v-if="!selected.services?.length">-</span>
          </div>
          <div class="compare-new">
            <div v-for="(s, i) in currentForm.services || []" :key="i" class="service-item">
              {{ s.name }} × {{ s.quantity }} = ${{ s.price * s.quantity }}
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
}
.compare-nav-info {
  flex: 1;
  text-align: center;
  font-weight: 600;
}
.compare-section {
  margin-bottom: 20px;
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
}
.compare-old {
  flex: 1;
  padding: 6px 8px;
  background: #fef0f0;
  border-radius: 4px;
  font-size: 13px;
  min-height: 24px;
}
.compare-new {
  flex: 1;
  padding: 6px 8px;
  background: #f0f9eb;
  border-radius: 4px;
  font-size: 13px;
  min-height: 24px;
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
</style>
