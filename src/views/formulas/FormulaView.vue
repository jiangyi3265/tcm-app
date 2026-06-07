<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormulasStore } from '../../stores/formulas'
import { useInventoryStore } from '../../stores/inventory'
import { useHerbDictStore } from '../../stores/herbDict'
import { useSuppliersStore } from '../../stores/suppliers'
import { useSettingsStore } from '../../stores/settings'
import { calculatePrescription } from '../../utils/prescriptionCalc'
import { bindHerbSelection } from '../../utils/herbBinding'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t, locale } = useI18n()
const formulasStore = useFormulasStore()
const inventoryStore = useInventoryStore()
const herbDictStore = useHerbDictStore()
const suppliersStore = useSuppliersStore()
const settingsStore = useSettingsStore()

const searchQuery = ref('')
const filterCategory = ref('')
const PAGE_SIZE = 20
const currentPage = ref(1)

const FORMULA_CATEGORIES = [
  { value: '调和剂', key: 'harmonizing' },
  { value: '清热剂', key: 'heatClearing' },
  { value: '温里剂', key: 'warmingInterior' },
  { value: '补益剂', key: 'tonifying' },
  { value: '理气剂', key: 'qiRegulating' },
  { value: '理血剂', key: 'bloodRegulating' },
  { value: '祛湿剂', key: 'dampnessDispelling' },
  { value: '祛风剂', key: 'windDispelling' },
  { value: '固涩剂', key: 'astringent' },
  { value: '安神剂', key: 'calmingSpirit' },
  { value: '解表剂', key: 'exteriorReleasing' },
  { value: '消食剂', key: 'digestive' },
  { value: '其他', key: 'other' },
]

function getFormulaCategoryLabel(value) {
  if (!value) return t('formulaView.uncategorized')
  const match = FORMULA_CATEGORIES.find((item) => item.value === value)
  return match ? t(`formulaView.categories.${match.key}`) : value
}

const formulaCategoryOptions = computed(() => [
  { value: '', label: t('formulaView.allCategories') },
  ...(settingsStore.formulaCategories || []).map((category) => ({
    value: category,
    label: getFormulaCategoryLabel(category),
  })),
])

const herbOptions = computed(() => herbDictStore.activeHerbs)

function createHerbDraft() {
  return { herbDictId: null, herbName: '', dosage: 0, unit: 'g', notes: '' }
}

function applyHerbSelection(target, herbId) {
  return bindHerbSelection(target, herbDictStore.getHerb(herbId), { nameKey: 'herbName' })
}

function syncDraftHerb(draftRef, herbId) {
  draftRef.value = applyHerbSelection(draftRef.value, herbId)
}

function syncRowHerb(row, herbId) {
  Object.assign(row, applyHerbSelection(row, herbId))
}

function validateFormulaHerbs(items = []) {
  if (items.some((item) => !item.herbDictId)) {
    ElMessage.warning(t('inventory.selectHerbRequired'))
    return false
  }
  return true
}

// ── 过滤 ──
const filteredFormulas = computed(() => {
  let list = formulasStore.activeFormulas
  if (filterCategory.value) {
    list = list.filter(f => f.category === filterCategory.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.description?.toLowerCase().includes(q) ||
      f.source?.toLowerCase().includes(q) ||
      (f.items || []).some(i => i.herbName.toLowerCase().includes(q))
    )
  }
  return list
})
const pagedFormulas = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredFormulas.value.slice(start, start + PAGE_SIZE)
})

watch([searchQuery, filterCategory], () => {
  currentPage.value = 1
})

watch(() => filteredFormulas.value.length, (count) => {
  const maxPage = Math.max(1, Math.ceil(count / PAGE_SIZE))
  if (currentPage.value > maxPage) currentPage.value = maxPage
})

// ── 展开面板 ──
const expandedId = ref(null)
const editing = ref(false)
const editForm = ref({})
const editHerb = ref(createHerbDraft())

// ── 预览换算 ──
const previewType = ref('raw_herbs')
const previewQty = ref(7)
const previewResult = computed(() => {
  if (!expandedId.value) return null
  const formula = formulasStore.getFormula(expandedId.value)
  if (!formula || !formula.items?.length) return null
  if (previewType.value === 'none') return null
  return calculatePrescription(
    formula.items,
    previewQty.value,
    previewType.value,
    inventoryStore.items,
    null
  )
})

function formatConvertedPreview(row) {
  if (previewType.value === 'powder' && row.packetsPerDose != null) {
    return `${row.packetsPerDose}${row.convertedUnit || ''}`
  }
  return `${row.convertedQty}${row.convertedUnit || ''}`
}

function formatConvertedSummary(row) {
  if (previewType.value !== 'powder' || row.convertedQty == null || !row.convertedUnit) return ''
  if (locale.value === 'zh-CN') {
    return `共 ${row.convertedQty}${row.convertedUnit} / ${previewQty.value} 剂`
  }
  return `Total ${row.convertedQty}${row.convertedUnit} / ${previewQty.value} doses`
}

function toggleExpand(formula) {
  if (expandedId.value === formula.id) {
    expandedId.value = null
    editing.value = false
  } else {
    expandedId.value = formula.id
    editing.value = false
  }
}

function startEdit(formula) {
  expandedId.value = formula.id
  editing.value = true
  editForm.value = {
    name: formula.name,
    category: formula.category || '',
    source: formula.source || '',
    description: formula.description || '',
    items: (formula.items || []).map(i => ({ ...i })),
  }
  editHerb.value = createHerbDraft()
}

function cancelEdit() {
  editing.value = false
}

function addEditHerb() {
  if (!editHerb.value.herbDictId) return ElMessage.warning(t('inventory.selectHerbRequired'))
  editForm.value.items.push({
    ...editHerb.value,
    sortOrder: editForm.value.items.length + 1,
  })
  editHerb.value = createHerbDraft()
}

function removeEditHerb(idx) {
  editForm.value.items.splice(idx, 1)
}

async function saveEdit() {
  if (!editForm.value.name) return ElMessage.warning(t('admin.fillFormulaName'))
  if (!validateFormulaHerbs(editForm.value.items)) return
  try {
    await formulasStore.updateFormula(expandedId.value, editForm.value)
    ElMessage.success(t('admin.formulaUpdated'))
    editing.value = false
  } catch (e) {
    ElMessage.error(e.message || t('formulaView.saveFailed'))
  }
}

// ── 新建方剂 ──
const showAddPanel = ref(false)
const newFormula = ref({
  name: '', category: '', source: '', description: '', items: [],
})
const newHerb = ref(createHerbDraft())

function addNewHerb() {
  if (!newHerb.value.herbDictId) return ElMessage.warning(t('inventory.selectHerbRequired'))
  newFormula.value.items.push({
    ...newHerb.value,
    sortOrder: newFormula.value.items.length + 1,
  })
  newHerb.value = createHerbDraft()
}

function removeNewHerb(idx) {
  newFormula.value.items.splice(idx, 1)
}

async function handleAddFormula() {
  if (!newFormula.value.name) return ElMessage.warning(t('admin.fillFormulaName'))
  if (!validateFormulaHerbs(newFormula.value.items)) return
  try {
    await formulasStore.addFormula({ ...newFormula.value })
    ElMessage.success(t('admin.formulaCreated'))
    showAddPanel.value = false
    newFormula.value = { name: '', category: '', source: '', description: '', items: [] }
  } catch (e) {
    ElMessage.error(e.message || t('formulaView.createFailed'))
  }
}

// ── 删除 ──
async function deleteFormula(formula) {
  try {
    await ElMessageBox.confirm(
      t('admin.confirmDeleteFormula', { name: formula.name }),
      t('admin.confirmDeleteTitle'),
      { type: 'warning' },
    )
    await formulasStore.deleteFormula(formula.id)
    if (expandedId.value === formula.id) expandedId.value = null
    ElMessage.success(t('admin.formulaDeleted'))
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || t('formulaView.deleteFailed'))
  }
}

// ── 复制方剂 ──
async function duplicateFormula(formula) {
  try {
    const copyData = {
      name: formula.name + t('formulaView.copySuffix'),
      category: formula.category || '',
      source: formula.source || '',
      description: formula.description || '',
      items: (formula.items || []).map(i => ({
        herbName: i.herbName,
        herbDictId: i.herbDictId || null,
        dosage: i.dosage,
        unit: i.unit || 'g',
        sortOrder: i.sortOrder,
        notes: i.notes || '',
      })),
    }
    await formulasStore.addFormula(copyData)
    ElMessage.success(t('formulaView.duplicateSuccess'))
  } catch (e) {
    ElMessage.error(e.message || t('formulaView.createFailed'))
  }
}

// ── 统计 ──
const totalCount = computed(() => formulasStore.activeFormulas.length)
const categoryCountEntries = computed(() => {
  const map = {}
  formulasStore.activeFormulas.forEach(f => {
    const c = f.category || ''
    map[c] = (map[c] || 0) + 1
  })
  return Object.entries(map).map(([value, count]) => ({
    value,
    count,
    label: getFormulaCategoryLabel(value),
  }))
})
</script>

<template>
  <div class="formula-view">
    <!-- 顶部统计 -->
    <div class="fv-stats">
      <div class="fv-stat-card main">
        <div class="fv-stat-num">{{ totalCount }}</div>
        <div class="fv-stat-label">{{ t('formulaView.totalCount') }}</div>
      </div>
      <div v-for="entry in categoryCountEntries" :key="entry.value || 'uncategorized'" class="fv-stat-card">
        <div class="fv-stat-num">{{ entry.count }}</div>
        <div class="fv-stat-label">{{ entry.label }}</div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="fv-toolbar">
      <div class="fv-toolbar-left">
        <el-input
          v-model="searchQuery"
          clearable
          :placeholder="t('formulaView.searchPlaceholder')"
          :prefix-icon="'Search'"
          style="width:300px"
        />
        <el-select v-model="filterCategory" :placeholder="t('formulaView.categoryPlaceholder')" style="width:130px; margin-left:8px" clearable>
          <el-option v-for="c in formulaCategoryOptions" :key="c.value || 'all'" :label="c.label" :value="c.value" />
        </el-select>
      </div>
      <el-button type="primary" @click="showAddPanel = !showAddPanel">
        <el-icon><Plus /></el-icon>
        {{ showAddPanel ? t('formulaView.collapse') : t('admin.addFormula') }}
      </el-button>
    </div>

    <!-- 新建方剂面板（页内展开） -->
    <transition name="fv-panel">
      <el-card v-if="showAddPanel" class="fv-add-panel" shadow="always">
        <template #header>
          <div class="fv-panel-header">
            <span class="fv-panel-title">{{ t('formulaView.newTemplateTitle') }}</span>
            <el-tag type="info" size="small">{{ t('formulaView.templateHint') }}</el-tag>
          </div>
        </template>
        <el-form :model="newFormula" label-width="80px" size="small">
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item :label="t('admin.formulaName')" required>
                <el-input v-model="newFormula.name" :placeholder="t('formulaView.namePlaceholder')" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item :label="t('admin.formulaCategory')">
                <el-select v-model="newFormula.category" :placeholder="t('formulaView.categoryPlaceholder')" filterable style="width:100%">
                  <el-option v-for="c in formulaCategoryOptions.slice(1)" :key="c.value" :label="c.label" :value="c.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item :label="t('admin.formulaSource')">
                <el-input v-model="newFormula.source" :placeholder="t('formulaView.sourcePlaceholder')" />
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item :label="t('admin.formulaEfficacy')">
                <el-input v-model="newFormula.description" type="textarea" :rows="2" :placeholder="t('formulaView.efficacyPlaceholder')" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-divider>{{ t('admin.formulaHerbs') }}</el-divider>
          <el-row :gutter="8" style="margin-bottom:8px">
            <el-col :span="8">
              <el-select
                v-model="newHerb.herbDictId"
                filterable
                :placeholder="t('inventory.selectHerbRequired')"
                size="small"
                style="width:100%"
                @change="syncDraftHerb(newHerb, $event)"
              >
                <el-option v-for="herb in herbOptions" :key="herb.id" :label="herb.name" :value="herb.id" />
              </el-select>
            </el-col>
            <el-col :span="5"><el-input-number v-model="newHerb.dosage" :min="0" :step="1" size="small" style="width:100%" /></el-col>
            <el-col :span="4"><el-input v-model="newHerb.unit" :placeholder="t('admin.formulaUnit')" size="small" /></el-col>
            <el-col :span="4"><el-input v-model="newHerb.notes" :placeholder="t('admin.formulaHerbNotes')" size="small" /></el-col>
            <el-col :span="3"><el-button size="small" type="primary" @click="addNewHerb">{{ t('consultation.addHerb') }}</el-button></el-col>
          </el-row>
          <el-table :data="newFormula.items" size="small" max-height="200" :empty-text="t('admin.formulaNoHerbsAdd')">
            <el-table-column prop="herbName" :label="t('admin.formulaHerbName')" min-width="100" />
            <el-table-column :label="t('admin.formulaDosage')" width="80"><template #default="{ row }">{{ row.dosage }}{{ row.unit }}</template></el-table-column>
            <el-table-column prop="notes" :label="t('admin.formulaHerbNotes')" width="100" />
            <el-table-column width="60"><template #default="{ $index }"><el-button size="small" text type="danger" @click="removeNewHerb($index)">{{ t('common.delete') }}</el-button></template></el-table-column>
          </el-table>
        </el-form>
        <div class="fv-panel-actions">
          <el-button @click="showAddPanel = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="handleAddFormula">{{ t('admin.addFormula') }}</el-button>
        </div>
      </el-card>
    </transition>

    <!-- 方剂列表 -->
    <div class="fv-list">
      <div v-for="formula in pagedFormulas" :key="formula.id" class="fv-card" :class="{ expanded: expandedId === formula.id }">
        <!-- 方剂卡头 -->
        <div class="fv-card-header" @click="toggleExpand(formula)">
          <div class="fv-card-left">
            <span class="fv-card-name">{{ formula.name }}</span>
            <el-tag v-if="formula.category" size="small" type="info" style="margin-left:8px">{{ getFormulaCategoryLabel(formula.category) }}</el-tag>
            <span class="fv-card-source" v-if="formula.source">{{ formula.source }}</span>
          </div>
          <div class="fv-card-right">
            <span class="fv-herb-count">{{ t('formulaView.herbCount', { count: (formula.items || []).length }) }}</span>
            <div class="fv-herb-tags">
              <el-tag v-for="(item, idx) in (formula.items || []).slice(0, 5)" :key="idx" size="small" effect="plain" style="margin: 1px 2px">
                {{ item.herbName }} {{ item.dosage }}{{ item.unit }}
              </el-tag>
              <el-tag v-if="(formula.items || []).length > 5" size="small" type="info">+{{ (formula.items || []).length - 5 }}</el-tag>
            </div>
            <el-icon class="fv-expand-icon"><ArrowDown /></el-icon>
          </div>
        </div>

        <!-- 展开面板 -->
        <transition name="fv-panel">
          <div v-if="expandedId === formula.id" class="fv-card-body">
            <!-- 查看模式 -->
            <template v-if="!editing">
              <div class="fv-detail-grid">
                <div class="fv-detail-left">
                  <div class="fv-section-title">
                    <span>{{ t('formulaView.infoTitle') }}</span>
                    <el-tag size="small" type="warning" effect="light">{{ t('formulaView.fixedTemplate') }}</el-tag>
                  </div>
                  <div v-if="formula.description" class="fv-desc">{{ formula.description }}</div>
                  <div v-if="formula.source" class="fv-meta">{{ t('formulaView.sourcePrefix') }}{{ formula.source }}</div>

                  <div class="fv-section-title" style="margin-top:16px">{{ t('admin.formulaHerbs') }}</div>
                  <el-table :data="formula.items || []" size="small" stripe>
                    <el-table-column prop="herbName" :label="t('admin.formulaHerbName')" min-width="100" />
                    <el-table-column :label="t('admin.formulaDosage')" width="90"><template #default="{ row }">{{ row.dosage }}{{ row.unit }}</template></el-table-column>
                    <el-table-column prop="notes" :label="t('admin.formulaHerbNotes')" min-width="100">
                      <template #default="{ row }"><span style="color:#888">{{ row.notes || '-' }}</span></template>
                    </el-table-column>
                  </el-table>
                </div>

                <!-- 换算预览 -->
                <div class="fv-detail-right">
                  <div class="fv-section-title">{{ t('formulaView.previewTitle') }}</div>
                  <el-form size="small" label-width="70px">
                    <el-form-item :label="t('formulaView.previewMode')">
                      <el-radio-group v-model="previewType" size="small">
                        <el-radio-button value="raw_herbs">{{ t('formulaView.modeRawHerbs') }}</el-radio-button>
                        <el-radio-button value="powder">{{ t('formulaView.modePowder') }}</el-radio-button>
                        <el-radio-button value="pills">{{ t('formulaView.modePills') }}</el-radio-button>
                        <el-radio-button value="none">{{ t('formulaView.modeNone') }}</el-radio-button>
                      </el-radio-group>
                    </el-form-item>
                    <el-form-item :label="t('formulaView.previewQuantity')">
                      <el-input-number v-model="previewQty" :min="1" :max="30" size="small" />
                    </el-form-item>
                  </el-form>
                  <el-table v-if="previewResult" :data="previewResult.items" size="small" max-height="250" stripe>
                    <el-table-column prop="name" :label="t('admin.formulaHerbName')" min-width="80" />
                    <el-table-column :label="t('formulaView.originalFormula')" width="70"><template #default="{ row }">{{ row.originalDosage }}g</template></el-table-column>
                    <el-table-column :label="t('formulaView.converted')" width="80">
                      <template #default="{ row }">
                        <span :style="{ color: row.stockSufficient === false ? '#e63946' : '#2d6a4f', fontWeight: 600 }">
                          {{ formatConvertedPreview(row) }}
                          <span v-if="formatConvertedSummary(row)" style="font-size:11px; color:#888; display:block">
                            {{ formatConvertedSummary(row) }}
                          </span>
                        </span>
                      </template>
                    </el-table-column>
                    <el-table-column :label="t('formulaView.supplier')" width="90">
                      <template #default="{ row }"><span style="font-size:12px; color:#888">{{ row.supplierName || '-' }}</span></template>
                    </el-table-column>
                    <el-table-column :label="t('formulaView.stock')" width="70">
                      <template #default="{ row }">
                        <el-tag v-if="row.inventoryId" :type="row.stockSufficient ? 'success' : 'danger'" size="small">
                          {{ row.inventoryStock }}
                        </el-tag>
                        <el-tag v-else type="info" size="small">{{ t('formulaView.noStock') }}</el-tag>
                      </template>
                    </el-table-column>
                  </el-table>
                  <div v-else-if="previewType === 'none'" style="color:#888; font-size:13px; padding:12px">
                    {{ t('formulaView.noneModeHint') }}
                  </div>
                </div>
              </div>

              <div class="fv-card-actions">
                <el-button size="small" type="primary" @click.stop="startEdit(formula)">
                  <el-icon><Edit /></el-icon> {{ t('formulaView.editFormula') }}
                </el-button>
                <el-button size="small" @click.stop="duplicateFormula(formula)">
                  <el-icon><CopyDocument /></el-icon> {{ t('formulaView.duplicateFormula') }}
                </el-button>
                <el-button size="small" type="danger" text @click.stop="deleteFormula(formula)">{{ t('common.delete') }}</el-button>
              </div>
            </template>

            <!-- 编辑模式 -->
            <template v-else>
              <div class="fv-edit-panel">
                <el-form :model="editForm" label-width="80px" size="small">
                  <el-row :gutter="16">
                    <el-col :span="8">
                      <el-form-item :label="t('admin.formulaName')" required>
                        <el-input v-model="editForm.name" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item :label="t('admin.formulaCategory')">
                        <el-select v-model="editForm.category" filterable style="width:100%">
                          <el-option v-for="c in formulaCategoryOptions.slice(1)" :key="c.value" :label="c.label" :value="c.value" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item :label="t('admin.formulaSource')">
                        <el-input v-model="editForm.source" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="24">
                      <el-form-item :label="t('admin.formulaEfficacy')">
                        <el-input v-model="editForm.description" type="textarea" :rows="2" />
                      </el-form-item>
                    </el-col>
                  </el-row>
                  <el-divider>{{ t('admin.formulaHerbs') }}</el-divider>
                  <el-row :gutter="8" style="margin-bottom:8px">
                    <el-col :span="8">
                      <el-select
                        v-model="editHerb.herbDictId"
                        filterable
                        :placeholder="t('inventory.selectHerbRequired')"
                        size="small"
                        style="width:100%"
                        @change="syncDraftHerb(editHerb, $event)"
                      >
                        <el-option v-for="herb in herbOptions" :key="herb.id" :label="herb.name" :value="herb.id" />
                      </el-select>
                    </el-col>
                    <el-col :span="5"><el-input-number v-model="editHerb.dosage" :min="0" :step="1" size="small" style="width:100%" /></el-col>
                    <el-col :span="4"><el-input v-model="editHerb.unit" :placeholder="t('admin.formulaUnit')" size="small" /></el-col>
                    <el-col :span="4"><el-input v-model="editHerb.notes" :placeholder="t('admin.formulaHerbNotes')" size="small" /></el-col>
                    <el-col :span="3"><el-button size="small" type="primary" @click="addEditHerb">{{ t('consultation.addHerb') }}</el-button></el-col>
                  </el-row>
                  <el-table :data="editForm.items" size="small" max-height="250" :empty-text="t('admin.formulaNoHerbsAdd')">
                    <el-table-column :label="t('admin.formulaHerbName')" min-width="180">
                      <template #default="{ row }">
                        <el-select
                          v-model="row.herbDictId"
                          filterable
                          :placeholder="row.herbName || t('inventory.selectHerbRequired')"
                          size="small"
                          style="width:100%"
                          @change="syncRowHerb(row, $event)"
                        >
                          <el-option v-for="herb in herbOptions" :key="herb.id" :label="herb.name" :value="herb.id" />
                        </el-select>
                      </template>
                    </el-table-column>
                    <el-table-column :label="t('admin.formulaDosage')" width="80"><template #default="{ row }">{{ row.dosage }}{{ row.unit }}</template></el-table-column>
                    <el-table-column prop="notes" :label="t('admin.formulaHerbNotes')" width="100" />
                    <el-table-column width="60"><template #default="{ $index }"><el-button size="small" text type="danger" @click="removeEditHerb($index)">{{ t('common.delete') }}</el-button></template></el-table-column>
                  </el-table>
                </el-form>
                <div class="fv-card-actions">
                  <el-button @click="cancelEdit">{{ t('common.cancel') }}</el-button>
                  <el-button type="primary" @click="saveEdit">{{ t('common.save') }}</el-button>
                </div>
              </div>
            </template>
          </div>
        </transition>
      </div>

      <el-empty v-if="filteredFormulas.length === 0" :description="t('formulaView.noMatch')" />
    </div>
    <div class="table-footer">
      <span>{{ t('formulaView.listCount', { count: filteredFormulas.length }) }}</span>
      <el-pagination
        v-model:current-page="currentPage"
        background
        small
        layout="prev, pager, next"
        :page-size="PAGE_SIZE"
        :total="filteredFormulas.length"
      />
    </div>
  </div>
</template>

<style scoped>
.formula-view {
  max-width: 100%;
}

/* ── 统计 ── */
.fv-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.fv-stat-card {
  background: #fff;
  border-radius: 10px;
  padding: 12px 18px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
  min-width: 80px;
}
.fv-stat-card.main {
  background: linear-gradient(135deg, #2d6a4f 0%, #52b788 100%);
  color: #fff;
}
.fv-stat-card.main .fv-stat-label { color: rgba(255,255,255,0.85); }
.fv-stat-num { font-size: 22px; font-weight: 700; }
.fv-stat-label { font-size: 12px; color: #888; margin-top: 2px; }

/* ── 工具栏 ── */
.fv-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}
.fv-toolbar-left {
  display: flex;
  align-items: center;
}

/* ── 新建面板 ── */
.fv-add-panel {
  margin-bottom: 16px;
  border-radius: 12px;
  border: 2px dashed #52b788;
}
.fv-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.fv-panel-title {
  font-size: 15px;
  font-weight: 700;
  color: #1b4332;
}
.fv-panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eee;
}

/* ── 方剂列表 ── */
.fv-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fv-card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  overflow: hidden;
  transition: box-shadow 0.2s;
}
.fv-card:hover { box-shadow: 0 3px 12px rgba(0,0,0,0.1); }
.fv-card.expanded { box-shadow: 0 4px 16px rgba(0,0,0,0.12); }

.fv-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  cursor: pointer;
  transition: background 0.15s;
}
.fv-card-header:hover { background: #f8faf9; }

.fv-card-left { display: flex; align-items: center; gap: 6px; }
.fv-card-name { font-size: 15px; font-weight: 700; color: #1b4332; }
.fv-card-source { font-size: 12px; color: #aaa; margin-left: 8px; }

.fv-card-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.fv-herb-count {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
}
.fv-herb-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  max-width: 400px;
}
.fv-expand-icon {
  transition: transform 0.25s ease;
  color: #bbb;
}
.fv-card.expanded .fv-expand-icon { transform: rotate(180deg); }

.table-footer {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  color: #888;
  font-size: 13px;
}

/* ── 展开体 ── */
.fv-card-body {
  padding: 0 20px 20px;
  border-top: 1px solid #f0f0f0;
}

.fv-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 16px;
}

.fv-section-title {
  font-size: 13px;
  font-weight: 700;
  color: #555;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.fv-desc {
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
  line-height: 1.6;
}
.fv-meta {
  font-size: 12px;
  color: #999;
  margin-bottom: 6px;
}

.fv-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.fv-edit-panel { margin-top: 16px; }

/* ── 过渡 ── */
.fv-panel-enter-active,
.fv-panel-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.fv-panel-enter-from,
.fv-panel-leave-to {
  opacity: 0;
  max-height: 0;
  margin-bottom: 0;
}
.fv-panel-enter-to,
.fv-panel-leave-from {
  opacity: 1;
  max-height: 1200px;
}

@media (max-width: 900px) {
  .fv-detail-grid { grid-template-columns: 1fr; }
  .fv-herb-tags { display: none; }
  .fv-toolbar { flex-direction: column; align-items: stretch; }
}
</style>
