<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormulasStore } from '../../stores/formulas'
import { useInventoryStore } from '../../stores/inventory'
import { useSuppliersStore } from '../../stores/suppliers'
import { calculatePrescription } from '../../utils/prescriptionCalc'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()
const formulasStore = useFormulasStore()
const inventoryStore = useInventoryStore()
const suppliersStore = useSuppliersStore()

const searchQuery = ref('')
const filterCategory = ref('')

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

// ── 分类选项 ──
const FORMULA_CATEGORIES = [
  { value: '', label: '全部分类' },
  { value: '调和剂', label: '调和剂' },
  { value: '清热剂', label: '清热剂' },
  { value: '温里剂', label: '温里剂' },
  { value: '补益剂', label: '补益剂' },
  { value: '理气剂', label: '理气剂' },
  { value: '理血剂', label: '理血剂' },
  { value: '祛湿剂', label: '祛湿剂' },
  { value: '祛风剂', label: '祛风剂' },
  { value: '固涩剂', label: '固涩剂' },
  { value: '安神剂', label: '安神剂' },
  { value: '解表剂', label: '解表剂' },
  { value: '消食剂', label: '消食剂' },
  { value: '其他', label: '其他' },
]

// ── 展开面板 ──
const expandedId = ref(null)
const editing = ref(false)
const editForm = ref({})
const editHerb = ref({ herbName: '', dosage: 0, unit: 'g', notes: '' })

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
  editHerb.value = { herbName: '', dosage: 0, unit: 'g', notes: '' }
}

function cancelEdit() {
  editing.value = false
}

function addEditHerb() {
  if (!editHerb.value.herbName) return ElMessage.warning('请输入药材名')
  editForm.value.items.push({
    ...editHerb.value,
    sortOrder: editForm.value.items.length + 1,
  })
  editHerb.value = { herbName: '', dosage: 0, unit: 'g', notes: '' }
}

function removeEditHerb(idx) {
  editForm.value.items.splice(idx, 1)
}

async function saveEdit() {
  if (!editForm.value.name) return ElMessage.warning('请输入方剂名称')
  try {
    await formulasStore.updateFormula(expandedId.value, editForm.value)
    ElMessage.success('方剂已保存')
    editing.value = false
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}

// ── 新建方剂 ──
const showAddPanel = ref(false)
const newFormula = ref({
  name: '', category: '', source: '', description: '', items: [],
})
const newHerb = ref({ herbName: '', dosage: 0, unit: 'g', notes: '' })

function addNewHerb() {
  if (!newHerb.value.herbName) return ElMessage.warning('请输入药材名')
  newFormula.value.items.push({
    ...newHerb.value,
    sortOrder: newFormula.value.items.length + 1,
  })
  newHerb.value = { herbName: '', dosage: 0, unit: 'g', notes: '' }
}

function removeNewHerb(idx) {
  newFormula.value.items.splice(idx, 1)
}

async function handleAddFormula() {
  if (!newFormula.value.name) return ElMessage.warning('请输入方剂名称')
  try {
    await formulasStore.addFormula({ ...newFormula.value })
    ElMessage.success('方剂已创建')
    showAddPanel.value = false
    newFormula.value = { name: '', category: '', source: '', description: '', items: [] }
  } catch (e) {
    ElMessage.error(e.message || '创建失败')
  }
}

// ── 删除 ──
async function deleteFormula(formula) {
  try {
    await ElMessageBox.confirm(`确定删除方剂「${formula.name}」？`, '确认删除', { type: 'warning' })
    await formulasStore.deleteFormula(formula.id)
    if (expandedId.value === formula.id) expandedId.value = null
    ElMessage.success('方剂已删除')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

// ── 统计 ──
const totalCount = computed(() => formulasStore.activeFormulas.length)
const categoryCount = computed(() => {
  const map = {}
  formulasStore.activeFormulas.forEach(f => {
    const c = f.category || '未分类'
    map[c] = (map[c] || 0) + 1
  })
  return map
})
</script>

<template>
  <div class="formula-view">
    <!-- 顶部统计 -->
    <div class="fv-stats">
      <div class="fv-stat-card main">
        <div class="fv-stat-num">{{ totalCount }}</div>
        <div class="fv-stat-label">方剂总数</div>
      </div>
      <div v-for="(count, cat) in categoryCount" :key="cat" class="fv-stat-card">
        <div class="fv-stat-num">{{ count }}</div>
        <div class="fv-stat-label">{{ cat }}</div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="fv-toolbar">
      <div class="fv-toolbar-left">
        <el-input
          v-model="searchQuery"
          clearable
          placeholder="搜索方剂名、功效、药材..."
          :prefix-icon="'Search'"
          style="width:300px"
        />
        <el-select v-model="filterCategory" placeholder="分类" style="width:130px; margin-left:8px" clearable>
          <el-option v-for="c in FORMULA_CATEGORIES" :key="c.value" :label="c.label" :value="c.value" />
        </el-select>
      </div>
      <el-button type="primary" @click="showAddPanel = !showAddPanel">
        <el-icon><Plus /></el-icon>
        {{ showAddPanel ? '收起' : '新建方剂' }}
      </el-button>
    </div>

    <!-- 新建方剂面板（页内展开） -->
    <transition name="fv-panel">
      <el-card v-if="showAddPanel" class="fv-add-panel" shadow="always">
        <template #header>
          <div class="fv-panel-header">
            <span class="fv-panel-title">📋 新建方剂模板</span>
            <el-tag type="info" size="small">方剂 = 固定模板，不可直接用于开方</el-tag>
          </div>
        </template>
        <el-form :model="newFormula" label-width="80px" size="small">
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="方剂名" required>
                <el-input v-model="newFormula.name" placeholder="如：小柴胡汤" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="分类">
                <el-select v-model="newFormula.category" placeholder="选择分类" filterable allow-create style="width:100%">
                  <el-option v-for="c in FORMULA_CATEGORIES.slice(1)" :key="c.value" :label="c.label" :value="c.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="出处">
                <el-input v-model="newFormula.source" placeholder="如：《伤寒论》" />
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item label="功效">
                <el-input v-model="newFormula.description" type="textarea" :rows="2" placeholder="功效与主治..." />
              </el-form-item>
            </el-col>
          </el-row>
          <el-divider>药材组成</el-divider>
          <el-row :gutter="8" style="margin-bottom:8px">
            <el-col :span="8"><el-input v-model="newHerb.herbName" placeholder="药材名" size="small" /></el-col>
            <el-col :span="5"><el-input-number v-model="newHerb.dosage" :min="0" :step="1" size="small" style="width:100%" /></el-col>
            <el-col :span="4"><el-input v-model="newHerb.unit" placeholder="单位" size="small" /></el-col>
            <el-col :span="4"><el-input v-model="newHerb.notes" placeholder="备注" size="small" /></el-col>
            <el-col :span="3"><el-button size="small" type="primary" @click="addNewHerb">添加</el-button></el-col>
          </el-row>
          <el-table :data="newFormula.items" size="small" max-height="200" empty-text="请添加药材">
            <el-table-column prop="herbName" label="药材" min-width="100" />
            <el-table-column label="剂量" width="80"><template #default="{ row }">{{ row.dosage }}{{ row.unit }}</template></el-table-column>
            <el-table-column prop="notes" label="备注" width="100" />
            <el-table-column width="60"><template #default="{ $index }"><el-button size="small" text type="danger" @click="removeNewHerb($index)">删除</el-button></template></el-table-column>
          </el-table>
        </el-form>
        <div class="fv-panel-actions">
          <el-button @click="showAddPanel = false">取消</el-button>
          <el-button type="primary" @click="handleAddFormula">创建方剂</el-button>
        </div>
      </el-card>
    </transition>

    <!-- 方剂列表 -->
    <div class="fv-list">
      <div v-for="formula in filteredFormulas" :key="formula.id" class="fv-card" :class="{ expanded: expandedId === formula.id }">
        <!-- 方剂卡头 -->
        <div class="fv-card-header" @click="toggleExpand(formula)">
          <div class="fv-card-left">
            <span class="fv-card-name">{{ formula.name }}</span>
            <el-tag v-if="formula.category" size="small" type="info" style="margin-left:8px">{{ formula.category }}</el-tag>
            <span class="fv-card-source" v-if="formula.source">{{ formula.source }}</span>
          </div>
          <div class="fv-card-right">
            <span class="fv-herb-count">{{ (formula.items || []).length }} 味</span>
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
                    <span>📌 方剂信息</span>
                    <el-tag size="small" type="warning" effect="light">方剂 = 固定模板</el-tag>
                  </div>
                  <div v-if="formula.description" class="fv-desc">{{ formula.description }}</div>
                  <div v-if="formula.source" class="fv-meta">出处：{{ formula.source }}</div>

                  <div class="fv-section-title" style="margin-top:16px">🌿 药材组成</div>
                  <el-table :data="formula.items || []" size="small" stripe>
                    <el-table-column prop="herbName" label="药材" min-width="100" />
                    <el-table-column label="剂量" width="90"><template #default="{ row }">{{ row.dosage }}{{ row.unit }}</template></el-table-column>
                    <el-table-column prop="notes" label="备注" min-width="100">
                      <template #default="{ row }"><span style="color:#888">{{ row.notes || '-' }}</span></template>
                    </el-table-column>
                  </el-table>
                </div>

                <!-- 换算预览 -->
                <div class="fv-detail-right">
                  <div class="fv-section-title">🔄 换算预览（导入处方时的效果）</div>
                  <el-form size="small" label-width="70px">
                    <el-form-item label="类型">
                      <el-radio-group v-model="previewType" size="small">
                        <el-radio-button value="raw_herbs">草药</el-radio-button>
                        <el-radio-button value="powder">粉剂</el-radio-button>
                        <el-radio-button value="pills">成药</el-radio-button>
                        <el-radio-button value="none">仅方</el-radio-button>
                      </el-radio-group>
                    </el-form-item>
                    <el-form-item label="剂数">
                      <el-input-number v-model="previewQty" :min="1" :max="30" size="small" />
                    </el-form-item>
                  </el-form>
                  <el-table v-if="previewResult" :data="previewResult.items" size="small" max-height="250" stripe>
                    <el-table-column prop="name" label="药材" min-width="80" />
                    <el-table-column label="原方" width="70"><template #default="{ row }">{{ row.originalDosage }}g</template></el-table-column>
                    <el-table-column label="换算" width="80">
                      <template #default="{ row }">
                        <span :style="{ color: row.stockSufficient === false ? '#e63946' : '#2d6a4f', fontWeight: 600 }">
                          {{ row.convertedQty }}{{ row.convertedUnit }}
                        </span>
                      </template>
                    </el-table-column>
                    <el-table-column label="供应商" width="90">
                      <template #default="{ row }"><span style="font-size:12px; color:#888">{{ row.supplierName || '-' }}</span></template>
                    </el-table-column>
                    <el-table-column label="库存" width="70">
                      <template #default="{ row }">
                        <el-tag v-if="row.inventoryId" :type="row.stockSufficient ? 'success' : 'danger'" size="small">
                          {{ row.inventoryStock }}
                        </el-tag>
                        <el-tag v-else type="info" size="small">无</el-tag>
                      </template>
                    </el-table-column>
                  </el-table>
                  <div v-else-if="previewType === 'none'" style="color:#888; font-size:13px; padding:12px">
                    「仅方」模式不进行换算，导入处方后直接显示原方剂量。
                  </div>
                </div>
              </div>

              <div class="fv-card-actions">
                <el-button size="small" type="primary" @click.stop="startEdit(formula)">
                  <el-icon><Edit /></el-icon> 编辑方剂
                </el-button>
                <el-button size="small" type="danger" text @click.stop="deleteFormula(formula)">删除</el-button>
              </div>
            </template>

            <!-- 编辑模式 -->
            <template v-else>
              <div class="fv-edit-panel">
                <el-form :model="editForm" label-width="80px" size="small">
                  <el-row :gutter="16">
                    <el-col :span="8">
                      <el-form-item label="方剂名" required>
                        <el-input v-model="editForm.name" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item label="分类">
                        <el-select v-model="editForm.category" filterable allow-create style="width:100%">
                          <el-option v-for="c in FORMULA_CATEGORIES.slice(1)" :key="c.value" :label="c.label" :value="c.value" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item label="出处">
                        <el-input v-model="editForm.source" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="24">
                      <el-form-item label="功效">
                        <el-input v-model="editForm.description" type="textarea" :rows="2" />
                      </el-form-item>
                    </el-col>
                  </el-row>
                  <el-divider>药材组成</el-divider>
                  <el-row :gutter="8" style="margin-bottom:8px">
                    <el-col :span="8"><el-input v-model="editHerb.herbName" placeholder="药材名" size="small" /></el-col>
                    <el-col :span="5"><el-input-number v-model="editHerb.dosage" :min="0" :step="1" size="small" style="width:100%" /></el-col>
                    <el-col :span="4"><el-input v-model="editHerb.unit" placeholder="单位" size="small" /></el-col>
                    <el-col :span="4"><el-input v-model="editHerb.notes" placeholder="备注" size="small" /></el-col>
                    <el-col :span="3"><el-button size="small" type="primary" @click="addEditHerb">添加</el-button></el-col>
                  </el-row>
                  <el-table :data="editForm.items" size="small" max-height="250" empty-text="请添加药材">
                    <el-table-column prop="herbName" label="药材" min-width="100" />
                    <el-table-column label="剂量" width="80"><template #default="{ row }">{{ row.dosage }}{{ row.unit }}</template></el-table-column>
                    <el-table-column prop="notes" label="备注" width="100" />
                    <el-table-column width="60"><template #default="{ $index }"><el-button size="small" text type="danger" @click="removeEditHerb($index)">删除</el-button></template></el-table-column>
                  </el-table>
                </el-form>
                <div class="fv-card-actions">
                  <el-button @click="cancelEdit">取消</el-button>
                  <el-button type="primary" @click="saveEdit">保存</el-button>
                </div>
              </div>
            </template>
          </div>
        </transition>
      </div>

      <el-empty v-if="filteredFormulas.length === 0" description="没有找到匹配的方剂" />
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
