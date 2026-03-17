<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConsultationsStore } from '../../stores/consultations'
import { useAuthStore } from '../../stores/auth'
import { formatDate } from '../../utils/dateUtils'
import { emptyDiff } from '../../utils/sampleData'

const { t } = useI18n()

const props = defineProps({
  patientId: { type: String, required: true },
  currentForm: { type: Object, required: true },
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['update:visible', 'copy-section'])

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
    data.acupuncture = JSON.parse(JSON.stringify(selected.value.acupuncture || []))
    data.prescriptions = JSON.parse(JSON.stringify(selected.value.prescriptions || []))
    data.herbals = JSON.parse(JSON.stringify(selected.value.herbals || []))
    data.formulaName = selected.value.formulaName
    data.prescriptionType = selected.value.prescriptionType
    data.prognosis = selected.value.prognosis
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

function getPractitionerName(id) {
  const u = authStore.users.find((u) => u.id === id || u.id === String(id))
  return u ? u.name : id
}

// 辨证对比辅助
const diffFields = computed(() => [
  { key: 'coldHeat', label: t('compare.coldHeat') },
  { key: 'sweat', label: t('compare.sweat') },
  { key: 'headDiscomfort', label: t('compare.head') },
  { key: 'sleep', label: t('compare.sleep') },
  { key: 'appetite', label: t('compare.appetite') },
  { key: 'thirst', label: t('compare.thirst') },
  { key: 'bowelMovement', label: t('compare.bowel') },
  { key: 'urine', label: t('compare.urine') },
  { key: 'pulse', label: t('compare.pulse') },
  { key: 'detailedPulse', label: t('compare.detailedPulse') },
  { key: 'tongueColor', label: t('compare.tongueColor') },
  { key: 'tongueBody', label: t('compare.tongueBody') },
  { key: 'tongueCoating', label: t('compare.tongueCoating') },
])

function getDiffVal(consult, key) {
  return consult?.diff?.[key] || '-'
}
function isDiffChanged(key) {
  if (!selected.value || !props.currentForm) return false
  const a = selected.value.diff?.[key] || ''
  const b = props.currentForm.diff?.[key] || ''
  return a !== b
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    :title="t('compare.title')"
    direction="rtl"
    size="65%"
    :close-on-click-modal="true"
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
      </div>

      <el-divider />

      <!-- ── Summary 对比 ── -->
      <div class="compare-section">
        <div class="compare-section-header">
          <h4>{{ t('compare.summary') }}</h4>
          <el-button size="small" type="primary" text @click="copySection('summary')">
            {{ t('compare.copyToCurrent') }}
          </el-button>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item :label="t('compare.chiefComplaint')">
            <div class="compare-cell-pair">
              <div class="compare-old">{{ selected.chiefComplaint || '-' }}</div>
              <div class="compare-new">{{ currentForm.chiefComplaint || '-' }}</div>
            </div>
          </el-descriptions-item>
          <el-descriptions-item :label="t('compare.duration')">
            <div class="compare-cell-pair">
              <div class="compare-old">{{ selected.chiefComplaintDuration || '-' }}</div>
              <div class="compare-new">{{ currentForm.chiefComplaintDuration || '-' }}</div>
            </div>
          </el-descriptions-item>
          <el-descriptions-item :label="t('compare.description')" :span="2">
            <div class="compare-cell-pair">
              <div class="compare-old">{{ selected.chiefComplaintDescription || '-' }}</div>
              <div class="compare-new">{{ currentForm.chiefComplaintDescription || '-' }}</div>
            </div>
          </el-descriptions-item>
          <el-descriptions-item :label="t('compare.prognosis')" :span="2">
            <div class="compare-cell-pair">
              <div class="compare-old">{{ selected.prognosis || '-' }}</div>
              <div class="compare-new">{{ currentForm.prognosis || '-' }}</div>
            </div>
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- ── Differentiation 对比 ── -->
      <div class="compare-section">
        <div class="compare-section-header">
          <h4>{{ t('compare.differentiation') }}</h4>
          <el-button size="small" type="primary" text @click="copySection('differentiation')">
            {{ t('compare.copyToCurrent') }}
          </el-button>
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
          <el-table-column :label="t('compare.currentRecord')">
            <template #default="{ row }">
              <span :class="{ 'diff-changed': isDiffChanged(row.key) }">
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
          <el-button size="small" type="primary" text @click="copySection('treatment')">
            {{ t('compare.copyToCurrent') }}
          </el-button>
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
          <el-button size="small" type="primary" text @click="copySection('pricing')">
            {{ t('compare.copyToCurrent') }}
          </el-button>
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
  </el-drawer>
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
</style>
