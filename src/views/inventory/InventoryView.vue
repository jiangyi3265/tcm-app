<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useInventoryStore } from '../../stores/inventory'
import { useAuthStore } from '../../stores/auth'
import { useBranchesStore } from '../../stores/branches'
import { useSuppliersStore } from '../../stores/suppliers'
import { useHerbDictStore } from '../../stores/herbDict'
import { useSettingsStore } from '../../stores/settings'
import { hasPermission } from '../../utils/permissions'
import { bindHerbSelection, getInventoryHerbMeta } from '../../utils/herbBinding'
import { parseCsvText, rowsToObjects, toNumber } from '../../utils/csvImport'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t, te, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const inventoryStore = useInventoryStore()
const authStore = useAuthStore()
const branchesStore = useBranchesStore()
const suppliersStore = useSuppliersStore()
const herbDictStore = useHerbDictStore()
const settingsStore = useSettingsStore()

const roles = computed(() => authStore.roles)
const canEdit = computed(() => hasPermission(roles.value, 'inventory.edit'))

const activeTab = ref('powder')
const lowStockFilter = ref(false)
const searchQuery = ref('')
const showAddDialog = ref(false)
const showAdjustDialog = ref(false)
const showDetailDialog = ref(false)
const showBatchImportDialog = ref(false)
const showHistoryDialog = ref(false)
const selectedInventoryRows = ref([])
const batchImportText = ref('')
const batchImporting = ref(false)
const adjustmentHistory = ref([])
const historyLoading = ref(false)
const historyItemName = ref('')
const detailItem = ref(null)
const adjustItem = ref(null)
const adjustDelta = ref(0)
const adjustReason = ref('')

const CATEGORY_CONFIG = computed(() => ({
  powder: { label: t('inventory.powder'), unit: 'bag', defaultUnit: 'bag' },
  raw_herbs: { label: t('inventory.rawHerbs'), unit: 'g', defaultUnit: 'g' },
  pills: { label: t('inventory.pillsMed'), unit: '盒', defaultUnit: '盒' },
}))

const herbById = computed(() => new Map(herbDictStore.activeHerbs.map((herb) => [herb.id, herb])))

const herbOptions = computed(() =>
  herbDictStore.activeHerbs.map((herb) => ({
    value: herb.id,
    label: herb.pinyin ? `${herb.name} (${herb.pinyin})` : herb.name,
  })),
)
const patentMedicineOptions = computed(() =>
  (settingsStore.patentMedicines || []).map((name) => ({ value: name, label: name })),
)
const itemNameOptions = computed(() => activeTab.value === 'pills' ? patentMedicineOptions.value : herbOptions.value)
const currencyLabel = computed(() => settingsStore.currency || 'CAD')

function localizeInventoryValue(group, value) {
  if (!value) return value
  const key = `inventory.${group}.${value}`
  return te(key) ? t(key) : value
}

function getUnitLabel(unit) {
  if (isBagUnit(unit)) return 'bag(包)'
  return localizeInventoryValue('unitLabels', unit)
}

function priceLabel(key) {
  return String(t(key)).replace(/\([^)]*\)|（[^）]*）/g, `(${currencyLabel.value})`)
}

function isBagUnit(unit) {
  const text = String(unit || '').trim().toLowerCase().replace(/\s+/g, '')
  return text === '包' || text === 'bag' || text === 'bag(包)'
}

function normalizeInventoryUnit(unit) {
  if (isBagUnit(unit)) return 'bag'
  return String(unit || '').trim() || 'g'
}

const INVENTORY_IMPORT_ALIASES = {
  name: ['name', '名称', '库存名'],
  category: ['category', '分类'],
  quantity: ['quantity', 'qty', '数量', '库存'],
  unit: ['unit', '单位'],
  quantityPerMainUnit: [
    'quantitypermainunit',
    'quantity per main unit',
    'gramsperpacket',
    'grams per packet',
    'gramsperbag',
    'grams per bag',
    '每包克数',
    '每主单位数量',
  ],
  pricePerUnit: ['priceperunit', 'price per unit', 'price', '单价', '成本'],
  supplier: ['supplier', '供应商'],
  supplierId: ['supplierid', 'supplier id', '供应商id'],
  minStockLevel: ['minstocklevel', 'min stock level', '最低库存'],
  branchId: ['branchid', 'branch id', '分店id'],
}

const INVENTORY_IMPORT_HEADERS = [
  'name',
  'category',
  'quantity',
  'unit',
  'quantityPerMainUnit',
  'pricePerUnit',
  'supplier',
  'minStockLevel',
  'branchId',
]
const LEGACY_INVENTORY_IMPORT_HEADERS = [
  'name',
  'category',
  'unit',
  'quantity',
  'pricePerUnit',
  'supplier',
  'minStockLevel',
  'branchId',
]

function looksLikeLegacyInventoryRow(row = []) {
  const third = String(row[2] || '').trim()
  const fourth = String(row[3] || '').trim()
  return third && !Number.isFinite(Number(third)) && Number.isFinite(Number(fourth))
}

function buildInventoryImportItem(item) {
  const quantityPerMainUnit = toNumber(item.quantityPerMainUnit || item.gramsPerPacket, null)
  return {
    ...item,
    name: String(item.name || '').trim(),
    category: String(item.category || activeTab.value || 'raw_herbs').trim(),
    quantity: toNumber(item.quantity),
    unit: normalizeInventoryUnit(item.unit),
    pricePerUnit: toNumber(item.pricePerUnit),
    supplier: String(item.supplier || '').trim(),
    supplierId: String(item.supplierId || '').trim() || null,
    minStockLevel: toNumber(item.minStockLevel, 10),
    quantityPerMainUnit,
    gramsPerPacket: quantityPerMainUnit,
    branchId: String(item.branchId || branchesStore.currentBranchId || '').trim() || null,
  }
}

function getToxicityTagType(value) {
  if (value === '无毒') return ''
  if (value === '小毒') return 'warning'
  return 'danger'
}

function formatHistoryTime(value) {
  if (!value) return '-'
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US')
}

function getHerbMeta(item) {
  return getInventoryHerbMeta(item, herbById)
}

function getItemToxicity(item) {
  return getHerbMeta(item).toxicity || '无毒'
}

function formatUsageAmount(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return '0'
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
}

function syncHerbBinding(target, herbId) {
  const herb = herbById.value.get(herbId) || herbById.value.get(String(herbId)) || null
  return bindHerbSelection(target, herb)
}

function handlePatentMedicineSelection(target, name) {
  target.herbDictId = null
  target.name = name || ''
  target.aliases = ''
  target.taste = []
  target.guijing = []
  return target
}

function syncInventoryNameBinding(target, value) {
  if (activeTab.value === 'pills') {
    return handlePatentMedicineSelection(target, value)
  }
  return syncHerbBinding(target, value)
}

function buildInventoryPayload(source, category = activeTab.value) {
  const {
    toxicity,
    last30DaysUsage,
    ...payload
  } = source
  if (category === 'pills') {
    payload.herbDictId = null
  }
  return payload
}

const newItem = ref({
  name: '',
  herbDictId: null,
  aliases: '',
  unit: 'bag',
  quantity: 0,
  purchasePrice: 0, // 购买价格(进价)
  pricePerUnit: 0,   // 售价(自动计算或手动)
  supplierId: '',
  supplier: '',
  gramsPerPacket: null,
  minStockLevel: 10,
})

function syncNewItemDefaults() {
  newItem.value.unit = CATEGORY_CONFIG.value[activeTab.value]?.defaultUnit || newItem.value.unit
  if (activeTab.value !== 'powder') {
    newItem.value.gramsPerPacket = null
  }
}

watch(activeTab, () => {
  syncNewItemDefaults()
  if (newItem.value.herbDictId) {
    newItem.value = syncInventoryNameBinding(newItem.value, newItem.value.herbDictId)
  }
  selectedInventoryRows.value = []
}, { immediate: true })

// 自动计算售价：进价 × (1 + 利润比例)
function autoCalcSellingPrice(item) {
  if (item.purchasePrice > 0 && settingsStore.profitRatio > 0) {
    item.pricePerUnit = +(item.purchasePrice * (1 + settingsStore.profitRatio)).toFixed(4)
  }
}

// 供应商名称解析（兼容旧文本字段）
const normalizeArray = (val) => {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed
    } catch (e) {
      return val.split(',').map(s => s.trim()).filter(Boolean)
    }
  }
  return []
}

function getSupplierName(item) {
  if (item.supplierId) {
    const s = suppliersStore.getSupplier(item.supplierId)
    if (s) return s.name
  }
  return item.supplier || '-'
}

function getCategoryItems(category) {
  const branchId = branchesStore.currentBranchId
  let items = inventoryStore.itemsByCategory[category] || []
  if (branchId) {
    items = items.filter(i => i.branchId === branchId || !i.branchId)
  }
  if (lowStockFilter.value) {
    items = items.filter(i => i.quantity <= i.minStockLevel)
  }
  if (!searchQuery.value) return items
  const q = searchQuery.value.toLowerCase()
  return items.filter((i) => i.name.toLowerCase().includes(q) || i.supplier?.toLowerCase().includes(q))
}

const allLowStockItems = computed(() => {
  const branchId = branchesStore.currentBranchId
  let items = inventoryStore.lowStockItems
  if (branchId) {
    items = items.filter(i => i.branchId === branchId || !i.branchId)
  }
  if (!searchQuery.value) return items
  const q = searchQuery.value.toLowerCase()
  return items.filter((i) => i.name.toLowerCase().includes(q) || i.supplier?.toLowerCase().includes(q))
})

onMounted(() => {
  if (route.query.filter === 'low_stock') {
    lowStockFilter.value = true
  }
})

function toggleLowStockFilter() {
  lowStockFilter.value = !lowStockFilter.value
  router.replace({ query: lowStockFilter.value ? { filter: 'low_stock' } : {} })
}

function getStockStatus(item) {
  if (item.quantity === 0) return { type: 'danger', label: t('inventory.outOfStock') }
  if (item.quantity <= item.minStockLevel) return { type: 'warning', label: t('inventory.lowStock') }
  return { type: 'success', label: t('inventory.normal') }
}

async function handleAddItem() {
  newItem.value = syncInventoryNameBinding(newItem.value, newItem.value.herbDictId)
  if (activeTab.value === 'pills' ? !newItem.value.name : !newItem.value.herbDictId) {
    return ElMessage.warning(t('inventory.selectHerbRequired'))
  }
  try {
    const payload = buildInventoryPayload(newItem.value, activeTab.value)
    await inventoryStore.addItem({ ...payload, category: activeTab.value, branchId: branchesStore.currentBranchId || null })
    ElMessage.success(t('inventory.added'))
    showAddDialog.value = false
    resetNewItem()
  } catch (e) {
    ElMessage.error(e.message || t('inventory.saveFailed'))
  }
}

function resetNewItem() {
  newItem.value = {
    name: '', herbDictId: null, aliases: '', unit: CATEGORY_CONFIG.value[activeTab.value]?.defaultUnit || 'bag', quantity: 0, purchasePrice: 0,
    pricePerUnit: 0, supplierId: '', supplier: '', gramsPerPacket: null, minStockLevel: 10,
  }
}

function openDetail(item) {
  detailItem.value = item
  showDetailDialog.value = true
}

function openAdjust(item) {
  adjustItem.value = item
  adjustDelta.value = 0
  adjustReason.value = ''
  showAdjustDialog.value = true
}

async function handleAdjust() {
  if (adjustDelta.value === 0) return ElMessage.warning(t('inventory.fillAdjustQty'))
  try {
    const success = await inventoryStore.adjustStock(adjustItem.value.id, adjustDelta.value, adjustReason.value)
    if (success) {
      ElMessage.success(t('inventory.adjusted', { delta: Math.abs(adjustDelta.value), unit: getUnitLabel(adjustItem.value.unit) }))
      showAdjustDialog.value = false
    } else {
      ElMessage.error(t('inventory.cannotBeNegative'))
    }
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function deleteItem(item) {
  await ElMessageBox.confirm(t('inventory.confirmDisable', { name: item.name }), t('common.confirm'), { type: 'warning' })
  await inventoryStore.deleteItem(item.id)
  ElMessage.success(t('inventory.disabled'))
}

function handleInventorySelectionChange(category, rows) {
  if (category === activeTab.value) {
    selectedInventoryRows.value = rows || []
  }
}

async function batchDeleteInventoryItems() {
  const rows = selectedInventoryRows.value || []
  if (!rows.length) return ElMessage.warning('请选择要删除的库存条目')
  await ElMessageBox.confirm(`确认删除 ${rows.length} 条库存记录？`, t('common.confirm'), { type: 'warning' })
  for (const row of rows) {
    await inventoryStore.deleteItem(row.id)
  }
  selectedInventoryRows.value = []
  ElMessage.success(`已删除 ${rows.length} 条库存记录`)
}

// 编辑
const editingId = ref(null)
const editForm = ref({})

function startEdit(item) {
  editingId.value = item.id

    editForm.value = {
      ...item,
    herbDictId: item.category === 'pills' ? (item.name || '') : (item.herbDictId || null),
    taste: normalizeArray(item.taste),
    guijing: normalizeArray(item.guijing),
  }
}

async function saveEdit(id) {
  try {
    editForm.value = syncInventoryNameBinding(editForm.value, editForm.value.herbDictId)
    if (editForm.value.category === 'pills' ? !editForm.value.name : !editForm.value.herbDictId) {
      return ElMessage.warning(t('inventory.selectHerbRequired'))
    }
    const payload = buildInventoryPayload(editForm.value, editForm.value.category)
    await inventoryStore.updateItem(id, payload)
    editingId.value = null
    ElMessage.success(t('inventory.saved'))
  } catch (e) {
    ElMessage.error(e.message || t('inventory.saveFailed'))
  }
}

function handleNewHerbChange(herbId) {
  syncNewItemDefaults()
  newItem.value = syncInventoryNameBinding(newItem.value, herbId)
}

function handleEditHerbChange(herbId) {
  editForm.value = syncInventoryNameBinding(editForm.value, herbId)
}

async function handleBatchImport() {
  if (!batchImportText.value.trim()) return ElMessage.warning(t('inventory.batchImportEmpty'))
  try {
    batchImporting.value = true
    const rows = parseCsvText(batchImportText.value)
    const fallbackHeaders = looksLikeLegacyInventoryRow(rows[0])
      ? LEGACY_INVENTORY_IMPORT_HEADERS
      : INVENTORY_IMPORT_HEADERS
    const items = rowsToObjects(rows, INVENTORY_IMPORT_ALIASES, fallbackHeaders)
      .map(buildInventoryImportItem)
      .filter((item) => item.name)
    const result = await inventoryStore.batchImport(items)
    ElMessage.success(t('inventory.batchImportSuccess', {
      created: Number(result.created || 0),
      updated: Number(result.updated || 0),
    }))
    if (result.errors?.length) {
      ElMessage.warning(result.errors.join('\n'))
    }
    showBatchImportDialog.value = false
    batchImportText.value = ''
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    batchImporting.value = false
  }
}

async function openAdjustmentHistory(item) {
  historyItemName.value = item ? item.name : ''
  historyLoading.value = true
  showHistoryDialog.value = true
  try {
    adjustmentHistory.value = await inventoryStore.getAdjustmentHistory(item?.id || null)
  } catch (e) {
    adjustmentHistory.value = []
  } finally {
    historyLoading.value = false
  }
}
</script>

<template>
  <div class="inventory-view">
    <!-- 库存概览 -->
    <div class="inventory-stats">
      <div class="inv-stat-card">
        <div class="inv-stat-label">{{ t('inventory.powderTypes') }}</div>
        <div class="inv-stat-num">{{ inventoryStore.itemsByCategory.powder.length }}</div>
      </div>
      <div class="inv-stat-card">
        <div class="inv-stat-label">{{ t('inventory.rawHerbTypes') }}</div>
        <div class="inv-stat-num">{{ inventoryStore.itemsByCategory.raw_herbs.length }}</div>
      </div>
      <div class="inv-stat-card">
        <div class="inv-stat-label">{{ t('inventory.pillsTypes') }}</div>
        <div class="inv-stat-num">{{ inventoryStore.itemsByCategory.pills.length }}</div>
      </div>
      <div class="inv-stat-card warning" style="cursor:pointer" @click="toggleLowStockFilter">
        <div class="inv-stat-label">{{ t('inventory.lowStockAlert') }}</div>
        <div class="inv-stat-num">{{ inventoryStore.lowStockItems.length }}</div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="page-toolbar">
      <div style="display:flex;gap:8px;align-items:center">
        <el-input v-model="searchQuery" :placeholder="t('inventory.searchPlaceholder')" clearable style="width: 280px" :prefix-icon="'Search'" />
        <el-button :type="lowStockFilter ? 'danger' : ''" plain @click="toggleLowStockFilter">
          <el-icon><Warning /></el-icon> {{ t('inventory.lowStockAlert') }}{{ lowStockFilter ? ' ✓' : '' }}
        </el-button>
      </div>
      <div style="display:flex;gap:8px">
        <el-button
          v-if="canEdit"
          type="danger"
          plain
          :disabled="!selectedInventoryRows.length"
          @click="batchDeleteInventoryItems"
        >
          批量删除
        </el-button>
        <el-button v-if="canEdit" @click="showBatchImportDialog = true">
          <el-icon><Upload /></el-icon> {{ t('inventory.batchImport') }}
        </el-button>
        <el-button @click="openAdjustmentHistory(null)">
          <el-icon><Document /></el-icon> {{ t('inventory.adjustHistory') }}
        </el-button>
        <el-button v-if="canEdit" type="primary" @click="showAddDialog = true">
          <el-icon><Plus /></el-icon> {{ t('inventory.addItem') }}
        </el-button>
      </div>
    </div>

    <!-- 分类标签页 -->
    <el-card class="inventory-card">
      <el-tabs v-model="activeTab">
        <el-tab-pane v-for="(config, key) in CATEGORY_CONFIG" :key="key" :label="config.label" :name="key">
          <el-table :data="getCategoryItems(key)" stripe @selection-change="rows => handleInventorySelectionChange(key, rows)">
            <el-table-column v-if="canEdit" type="selection" width="46" />
            <el-table-column :label="t('inventory.itemName')" min-width="180">
              <template #default="{ row }">
                <div v-if="editingId === row.id">
                  <el-select
                    v-model="editForm.herbDictId"
                    filterable
                    clearable
                    size="small"
                    style="width: 100%"
                    :placeholder="editForm.name || t('inventory.selectHerbRequired')"
                    @change="handleEditHerbChange"
                  >
                    <el-option v-for="item in itemNameOptions" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
                </div>
                <div v-else>
                  <div>
                    <span style="font-weight: 600">{{ row.name }}</span>
                    <el-tag v-if="getStockStatus(row).type !== 'success'" :type="getStockStatus(row).type" size="small" style="margin-left: 6px">
                      {{ getStockStatus(row).label }}
                    </el-tag>
                  </div>
                  <div v-if="getHerbMeta(row).alias" style="font-size: 11px; color: #aaa; margin-top: 2px">{{ t('inventory.aliases') }}：{{ getHerbMeta(row).alias }}</div>
                </div>
              </template>
            </el-table-column>
          <el-table-column :label="t('inventory.natureTasteChannel')" min-width="180">
              <template #default="{ row }">
                <div v-if="editingId === row.id">
                  <div style="font-size: 12px">
                    <span v-if="getHerbMeta(editForm).nature" class="tcm-badge nature">{{ localizeInventoryValue('natureOptions', getHerbMeta(editForm).nature) }}</span>
                    <span v-for="taste in getHerbMeta(editForm).taste" :key="taste" class="tcm-badge taste">{{ localizeInventoryValue('tasteOptions', taste) }}</span>
                  </div>
                  <div v-if="getHerbMeta(editForm).guijing.length" style="font-size: 11px; color: #888; margin-top: 2px">
                    {{ t('inventory.channelShort') }}：{{ getHerbMeta(editForm).guijing.map((item) => localizeInventoryValue('channelOptions', item)).join(locale === 'zh-CN' ? '、' : ', ') }}
                  </div>
                </div>
                <div v-else>
                  <div style="font-size: 12px">
                    <span v-if="getHerbMeta(row).nature" class="tcm-badge nature">{{ localizeInventoryValue('natureOptions', getHerbMeta(row).nature) }}</span>
                    <span v-for="taste in getHerbMeta(row).taste" :key="taste" class="tcm-badge taste">{{ localizeInventoryValue('tasteOptions', taste) }}</span>
                  </div>
                  <div v-if="getHerbMeta(row).guijing.length" style="font-size: 11px; color: #888; margin-top: 2px">
                    {{ t('inventory.channelShort') }}：{{ getHerbMeta(row).guijing.map((item) => localizeInventoryValue('channelOptions', item)).join(locale === 'zh-CN' ? '、' : ', ') }}
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column :label="t('inventory.currentStock')" min-width="130">
              <template #default="{ row }">
                <div v-if="editingId === row.id">
                  <el-input-number v-model="editForm.quantity" :min="0" :step="1" size="small" controls-position="right" style="width: 100%" />
                </div>
                <span v-else :class="{ 'low-stock': row.quantity <= row.minStockLevel && row.quantity > 0, 'out-of-stock': row.quantity === 0 }">
                  {{ row.quantity }} {{ getUnitLabel(row.unit) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column :label="t('inventory.last30DaysUsage')" min-width="130">
              <template #default="{ row }">
                <div v-if="editingId === row.id">
                  <div style="font-size: 13px; color: #555; margin-bottom: 6px">{{ formatUsageAmount(row.last30DaysUsage) }} {{ getUnitLabel(row.unit) }}</div>
                  <el-input-number v-model="editForm.minStockLevel" :min="0" size="small" controls-position="right" style="width: 100%" />
                  <div style="font-size: 11px; color: #888; margin-top: 4px">{{ t('inventory.alertShort') }}：{{ editForm.minStockLevel }} {{ getUnitLabel(row.unit) }}</div>
                </div>
                <span v-else style="font-size: 13px; color: #888">{{ formatUsageAmount(row.last30DaysUsage) }} {{ getUnitLabel(row.unit) }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('inventory.unitPrice')" min-width="120">
              <template #default="{ row }">
                <div v-if="editingId === row.id">
                  <el-input-number v-model="editForm.pricePerUnit" :min="0" :step="0.1" size="small" controls-position="right" style="width: 100%" />
                </div>
                <span v-else>{{ currencyLabel }} {{ row.pricePerUnit }}/{{ getUnitLabel(row.unit) }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('inventory.supplier')" min-width="160">
              <template #default="{ row }">
                <div v-if="editingId === row.id">
                  <el-select v-model="editForm.supplierId" size="small" filterable clearable :placeholder="t('inventory.selectSupplier')" style="width: 100%"
                    @change="val => { editForm.supplier = suppliersStore.getSupplier(val)?.name || '' }">
                    <el-option v-for="s in suppliersStore.activeSuppliers" :key="s.id" :label="s.name" :value="s.id" />
                  </el-select>
                </div>
                <span v-else style="color: #888; font-size: 13px">{{ getSupplierName(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column v-if="key === 'powder'" :label="t('inventory.gramsPerBag')" min-width="100">
              <template #default="{ row }">
                <div v-if="editingId === row.id">
                  <el-input-number v-model="editForm.gramsPerPacket" :min="1" size="small" controls-position="right" style="width: 100%" />
                </div>
                <span v-else>{{ row.gramsPerPacket ? row.gramsPerPacket + 'g' : '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('inventory.toxicity')" min-width="100">
              <template #default="{ row }">
                <el-tag
                  :type="getToxicityTagType(getItemToxicity(editingId === row.id ? editForm : row))"
                  size="small"
                >
                  {{ localizeInventoryValue('toxicityOptions', getItemToxicity(editingId === row.id ? editForm : row)) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.operation')" width="190" fixed="right">
              <template #default="{ row }">
                <div v-if="editingId === row.id">
                  <el-button size="small" type="primary" text @click="saveEdit(row.id)">{{ t('common.save') }}</el-button>
                  <el-button size="small" text @click="editingId = null">{{ t('common.cancel') }}</el-button>
                </div>
                <div v-else>
                  <el-button size="small" text @click="openDetail(row)">{{ t('inventory.detail') }}</el-button>
                  <el-button v-if="canEdit" size="small" text @click="openAdjust(row)">{{ t('inventory.adjustStock') }}</el-button>
                  <el-button v-if="canEdit" size="small" text type="primary" @click="startEdit(row)">{{ t('common.edit') }}</el-button>
                  <el-button v-if="canEdit" size="small" text type="danger" @click="deleteItem(row)">{{ t('inventory.disableItem') }}</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 添加药材对话框 -->
    <el-drawer v-model="showAddDialog" :title="t('inventory.addItem')" size="600px" direction="rtl" :close-on-press-escape="true">
      <el-form :model="newItem" label-width="90px" size="small">
        <div class="inv-form-title">{{ t('inventory.basicInfo') }}</div>
        <el-row :gutter="12">
          <el-col :span="14">
            <el-form-item :label="t('inventory.herbNameLabel')" required>
              <el-select
                v-model="newItem.herbDictId"
                filterable
                clearable
                style="width:100%"
                :placeholder="t('inventory.selectHerbRequired')"
                @change="handleNewHerbChange"
              >
                <el-option v-for="item in itemNameOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('inventory.categoryLabel')">
              <el-input :model-value="CATEGORY_CONFIG[activeTab]?.label || activeTab" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('inventory.unitLabel')">
              <el-input v-model="newItem.unit" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('inventory.initialStock')">
              <el-input-number v-model="newItem.quantity" :min="0" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('inventory.minStock')">
              <el-input-number v-model="newItem.minStockLevel" :min="0" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="priceLabel('inventory.purchasePriceLabel')">
              <el-input-number v-model="newItem.purchasePrice" :min="0" :step="0.01" :precision="4" style="width:100%"
                @change="autoCalcSellingPrice(newItem)" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="priceLabel('inventory.sellingPriceLabel')">
              <el-input-number v-model="newItem.pricePerUnit" :min="0" :step="0.01" :precision="4" style="width:100%" />
              <div style="font-size:11px; color:#888; margin-top:2px" v-if="newItem.purchasePrice > 0">
                {{ t('inventory.sellingPriceHint', { ratio: settingsStore.profitRatio, multiplier: (1 + settingsStore.profitRatio).toFixed(2) }) }}
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('inventory.supplier')">
              <el-select v-model="newItem.supplierId" filterable clearable :placeholder="t('inventory.selectSupplier')" style="width:100%"
                @change="val => { newItem.supplier = suppliersStore.getSupplier(val)?.name || '' }">
                <el-option v-for="s in suppliersStore.activeSuppliers" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="activeTab === 'powder'" :span="12">
            <el-form-item :label="t('inventory.gramsPerBag')">
              <el-input-number v-model="newItem.gramsPerPacket" :min="1" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>


      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false; resetNewItem()">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddItem">{{ t('common.add') }}</el-button>
      </template>
    </el-drawer>

    <!-- 药材详情对话框 -->
    <el-drawer v-model="showDetailDialog" :title="detailItem?.name" size="500px" direction="rtl">
        <el-descriptions v-if="detailItem" :column="2" border size="small">
          <el-descriptions-item :label="t('inventory.aliases')" :span="2">{{ getHerbMeta(detailItem).alias || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="t('inventory.categoryLabel')">{{ CATEGORY_CONFIG[detailItem.category]?.label || detailItem.category }}</el-descriptions-item>
          <el-descriptions-item :label="t('inventory.toxicity')">
          <el-tag :type="getToxicityTagType(getItemToxicity(detailItem))" size="small">
            {{ localizeInventoryValue('toxicityOptions', getItemToxicity(detailItem)) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('inventory.nature')">{{ getHerbMeta(detailItem).nature ? localizeInventoryValue('natureOptions', getHerbMeta(detailItem).nature) : '-' }}</el-descriptions-item>
        <el-descriptions-item :label="t('inventory.taste')">{{ getHerbMeta(detailItem).taste.map((item) => localizeInventoryValue('tasteOptions', item)).join(locale === 'zh-CN' ? '、' : ', ') || '-' }}</el-descriptions-item>
        <el-descriptions-item :label="t('inventory.channel')" :span="2">{{ getHerbMeta(detailItem).guijing.map((item) => localizeInventoryValue('channelOptions', item)).join(locale === 'zh-CN' ? '、' : ', ') || '-' }}</el-descriptions-item>
        <el-descriptions-item :label="t('inventory.currentStock')" :span="2">
          <span :class="{ 'low-stock': detailItem.quantity <= detailItem.minStockLevel, 'out-of-stock': detailItem.quantity === 0 }">
            {{ detailItem.quantity }} {{ getUnitLabel(detailItem.unit) }}
          </span>
          &nbsp;（{{ t('inventory.alertShort') }}：{{ detailItem.minStockLevel }} {{ getUnitLabel(detailItem.unit) }}）
        </el-descriptions-item>
        <el-descriptions-item :label="t('inventory.unitPrice')" :span="2">{{ currencyLabel }} {{ detailItem.pricePerUnit }}/{{ getUnitLabel(detailItem.unit) }}</el-descriptions-item>
        <el-descriptions-item :label="t('inventory.supplier')" :span="2">{{ getSupplierName(detailItem) }}</el-descriptions-item>
        <el-descriptions-item v-if="detailItem.category === 'powder'" :label="t('inventory.gramsPerBag')" :span="2">
          {{ detailItem.gramsPerPacket ? detailItem.gramsPerPacket + 'g' : '-' }}
        </el-descriptions-item>
        <el-descriptions-item v-if="detailItem.functionsAndIndications" :label="t('inventory.functions')" :span="2">
          {{ detailItem.functionsAndIndications }}
        </el-descriptions-item>
        <el-descriptions-item v-if="detailItem.contraindications" :label="t('inventory.contraindications')" :span="2">
          {{ detailItem.contraindications }}
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="showDetailDialog = false">{{ t('common.close') }}</el-button>
        <el-button v-if="canEdit" type="primary" @click="showDetailDialog = false; startEdit(detailItem)">
          {{ t('common.edit') }}
        </el-button>
      </template>
    </el-drawer>

    <!-- 调整库存对话框 -->
    <el-dialog v-model="showAdjustDialog" :title="t('inventory.adjustStockTitle', { name: adjustItem?.name })" width="360px">
      <el-form label-width="90px">
        <el-form-item :label="t('inventory.currentStock')">
          <span style="font-weight: 600">{{ adjustItem?.quantity }} {{ getUnitLabel(adjustItem?.unit) }}</span>
        </el-form-item>
        <el-form-item :label="t('inventory.adjustQty')">
          <el-input-number v-model="adjustDelta" :step="1" />
          <span style="margin-left: 8px; font-size: 12px; color: #888">{{ t('inventory.adjustHint') }}</span>
        </el-form-item>
        <el-form-item :label="t('inventory.afterAdjust')">
          <span style="font-weight: 600" :class="{ 'low-stock': (adjustItem?.quantity + adjustDelta) <= adjustItem?.minStockLevel }">
            {{ (adjustItem?.quantity || 0) + adjustDelta }} {{ getUnitLabel(adjustItem?.unit) }}
          </span>
        </el-form-item>
        <el-form-item :label="t('inventory.reason')">
          <el-input v-model="adjustReason" :placeholder="t('inventory.reasonPh')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdjustDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAdjust">{{ t('inventory.confirmAdjust') }}</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入对话框 -->
    <el-drawer v-model="showBatchImportDialog" :title="t('inventory.batchImport')" size="600px" direction="rtl" :close-on-press-escape="true">
      <p style="font-size:13px;color:#888;margin-bottom:12px">{{ t('inventory.batchImportHint') }}</p>
      <el-input
        v-model="batchImportText"
        type="textarea"
        :rows="10"
        :placeholder="t('inventory.batchImportPlaceholder')"
      />
      <template #footer>
        <el-button @click="showBatchImportDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="batchImporting" @click="handleBatchImport">{{ t('inventory.importBtn') }}</el-button>
      </template>
    </el-drawer>

    <!-- 调整历史对话框 -->
    <el-drawer v-model="showHistoryDialog" :title="t('inventory.adjustHistory') + (historyItemName ? ' - ' + historyItemName : '')" size="700px" direction="rtl">
      <el-table :data="adjustmentHistory" v-loading="historyLoading" stripe max-height="400">
        <el-table-column prop="createdAt" :label="t('inventory.historyTime')" width="180">
          <template #default="{ row }">{{ formatHistoryTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="targetName" :label="t('inventory.historyItem')" width="120" />
        <el-table-column prop="userName" :label="t('inventory.historyOperator')" width="100" />
        <el-table-column prop="details" :label="t('inventory.historyDetails')" min-width="200" />
      </el-table>
      <template #footer>
        <el-button @click="showHistoryDialog = false">{{ t('common.close') }}</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.inventory-view { max-width: 100%; }

.inventory-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.inv-stat-card {
  background: #fff;
  border-radius: 10px;
  padding: 16px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}

.inv-stat-card.warning { border-top: 3px solid #e9c46a; }

.inv-stat-label { font-size: 13px; color: #888; margin-bottom: 6px; }
.inv-stat-num { font-size: 28px; font-weight: 700; color: #1b4332; }

.page-toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
}

.inventory-card { border-radius: 12px; }

.low-stock { color: #e9a000; font-weight: 600; }
.out-of-stock { color: #e63946; font-weight: 600; }

.tcm-badge {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11px;
  margin-right: 2px;
  margin-bottom: 2px;
}
.tcm-badge.nature { background: #e8f4fd; color: #1a6fa3; }
.tcm-badge.taste { background: #f0faf4; color: #2d6a4f; }

.inv-form-title {
  font-size: 12px;
  font-weight: 700;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 10px 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #eee;
}

@media (max-width: 768px) {
  .inventory-stats { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .page-toolbar { flex-direction: column; align-items: stretch; }
  .page-toolbar > div { justify-content: flex-end; }
  .inv-stat-num { font-size: 22px; }
  .inventory-card { border-radius: 8px; }
}
</style>
