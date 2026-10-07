<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useHerbDictStore } from '../stores/herbDict'
import { useInventoryStore } from '../stores/inventory'
import { inventoryApi } from '../utils/api'
import { exactInvoiceHerb, invoiceHerbSuggestions } from '../utils/invoiceHerbMatch'

const props = defineProps({ category: String, branchId: String, currency: String })
const emit = defineEmits(['close'])
const { t } = useI18n()
const herbs = useHerbDictStore()
const inventory = useInventoryStore()
const preview = ref(null)
const rows = ref([])
const busy = ref(false)
const imported = ref(false)
const error = ref('')
const invoiceCurrency = ref(props.currency)
const canImport = computed(() => rows.value.length > 0 && rows.value.every((row) => row.herbDictId
  && row.unit?.trim() && row.quantity != null && Number(row.quantity) > 0 && row.purchasePrice != null && Number(row.purchasePrice) >= 0))

function targets(row) {
  return inventory.activeItems.filter((item) => item.herbDictId === row.herbDictId && item.category === row.category
    && (!props.branchId || !item.branchId || item.branchId === props.branchId))
}
function options(row) {
  const suggestions = invoiceHerbSuggestions(row.invoiceName, herbs.activeHerbs).map((item) => item.herb)
  const ids = new Set(suggestions.map((herb) => herb.id))
  return [...suggestions, ...herbs.activeHerbs.filter((herb) => !ids.has(herb.id))]
}
function chooseInventory(row, id) {
  row.inventoryId = id
  const item = inventory.getItem(id)
  if (item && row.unit && row.unit !== item.unit) {
    row.quantity = null
    row.purchasePrice = null
    ElMessage.warning(t('invoiceImport.unitChanged'))
  }
  row.unit = item?.unit || row.unit || (row.category === 'powder' ? 'bag' : 'g')
  if (item && row.gramsPerPacket == null) row.gramsPerPacket = item.gramsPerPacket
}
function chooseHerb(row) {
  const matches = targets(row).filter((item) => item.unit === row.unit)
  chooseInventory(row, matches.length === 1 ? matches[0].id : '')
}
async function recognize(upload) {
  const file = upload.raw
  if (!file || file.size > 10 * 1024 * 1024) return ElMessage.error(t('invoiceImport.fileLimit'))
  busy.value = true; error.value = ''; imported.value = false; preview.value = null; rows.value = []
  try {
    await herbs.refreshFromApi()
    preview.value = await inventoryApi.recognizeInvoice(file)
    invoiceCurrency.value = preview.value.currency || props.currency
    rows.value = preview.value.items.map((line) => {
      const herb = exactInvoiceHerb(line.invoiceName, herbs.activeHerbs)
      const row = { invoiceName: line.invoiceName, herbDictId: herb?.id || '', inventoryId: '',
        category: props.category === 'raw_herbs' ? 'raw_herbs' : 'powder', quantity: line.quantity,
        purchasePrice: line.unitPriceBeforeDiscount, gramsPerPacket: line.gramsPerPacket,
        supplier: preview.value.supplier || '', branchId: props.branchId || null, unit: line.unit }
      chooseHerb(row)
      return row
    })
  } catch (failure) { error.value = failure.message }
  finally { busy.value = false }
}
async function confirm() {
  if (!canImport.value) return
  busy.value = true; error.value = ''
  try {
    await inventoryApi.confirmInvoice({ invoiceId: preview.value.invoiceId, currency: invoiceCurrency.value, items: rows.value })
    imported.value = true
    await inventory.refreshFromApi()
    ElMessage.success(t('invoiceImport.success'))
  } catch (failure) { error.value = failure.message }
  finally { busy.value = false }
}
</script>

<template>
  <section class="invoice-import" :aria-label="t('invoiceImport.title')">
    <div class="invoice-import-heading">
      <div><h3>{{ t('invoiceImport.title') }}</h3><p>{{ t('invoiceImport.description') }}</p></div>
      <el-button text :disabled="busy" @click="emit('close')">{{ t('common.close') }}</el-button>
    </div>
    <div class="invoice-import-actions">
      <el-upload accept=".pdf,.png,.jpg,.jpeg,.webp" :auto-upload="false" :show-file-list="false" :disabled="busy" :on-change="recognize">
        <el-button :loading="busy" :disabled="busy">{{ t('invoiceImport.chooseFile') }}</el-button>
      </el-upload>
      <span v-if="preview">{{ preview.supplier }} {{ preview.invoiceNumber }}</span>
      <el-select v-if="preview" v-model="invoiceCurrency" :disabled="busy || imported" style="width:100px" aria-label="Currency">
        <el-option value="CAD" label="CAD" /><el-option value="USD" label="USD" />
      </el-select>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-table v-if="rows.length" :data="rows" size="small" :class="{ 'is-imported': imported }">
      <el-table-column prop="invoiceName" :label="t('invoiceImport.invoiceName')" min-width="150" />
      <el-table-column :label="t('invoiceImport.dictionaryHerb')" min-width="230"><template #default="{row}">
        <el-select v-model="row.herbDictId" filterable :disabled="busy || imported" :placeholder="t('inventory.selectHerbRequired')" @change="chooseHerb(row)">
          <el-option v-for="herb in options(row)" :key="herb.id" :value="herb.id" :label="[herb.name, herb.pinyin].filter(Boolean).join(' / ')" />
        </el-select>
      </template></el-table-column>
      <el-table-column :label="t('invoiceImport.target')" min-width="180"><template #default="{row}">
        <el-select :model-value="row.inventoryId" :disabled="busy || imported" @change="chooseInventory(row, $event)">
          <el-option value="" :label="t('invoiceImport.newInventory')" />
          <el-option v-for="item in targets(row)" :key="item.id" :value="item.id" :label="`${item.supplier || item.name} (${item.quantity} ${item.unit})`" />
        </el-select>
      </template></el-table-column>
      <el-table-column :label="t('invoiceImport.quantity')" min-width="110"><template #default="{row}"><el-input-number v-model="row.quantity" :min="0" :disabled="busy || imported" :controls="false" style="width:90px" /></template></el-table-column>
      <el-table-column :label="t('invoiceImport.unit')" min-width="100"><template #default="{row}"><el-input v-model="row.unit" :maxlength="16" :disabled="busy || imported || !!row.inventoryId" /></template></el-table-column>
      <el-table-column :label="t('invoiceImport.purchasePrice')" min-width="140"><template #default="{row}"><el-input-number v-model="row.purchasePrice" :min="0" :precision="4" :controls="false" :disabled="busy || imported" style="width:110px" /></template></el-table-column>
      <el-table-column :label="t('invoiceImport.sellingPrice')" width="110"><template #default="{row}">{{ row.purchasePrice == null ? '—' : (row.purchasePrice * 2).toFixed(4) }}</template></el-table-column>
      <el-table-column :label="t('invoiceImport.gramsPerPacket')" min-width="130"><template #default="{row}"><el-input-number v-model="row.gramsPerPacket" :min="0" :controls="false" :disabled="busy || imported" style="width:95px" /></template></el-table-column>
      <el-table-column width="85"><template #default="{$index}"><el-button text type="danger" :disabled="busy || imported" @click="rows.splice($index, 1)">{{ t('common.delete') }}</el-button></template></el-table-column>
    </el-table>
    <div v-if="preview" class="invoice-import-actions">
      <el-button type="primary" :disabled="!canImport || busy || imported || invoiceCurrency !== currency" :loading="busy" @click="confirm">{{ imported ? t('invoiceImport.success') : t('invoiceImport.confirm') }}</el-button>
      <span>{{ t('invoiceImport.reviewHint') }}</span>
    </div>
  </section>
</template>

<style scoped>
.invoice-import { padding: 20px; margin-bottom: 20px; border: 1px solid var(--el-border-color); border-radius: 8px; background: var(--el-bg-color); }
.invoice-import-heading { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
.invoice-import-heading h3 { font-size: 16px; margin-bottom: 6px; }
.invoice-import-heading p, .invoice-import-actions span { font-size: 13px; color: var(--el-text-color-secondary); }
.invoice-import-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 16px 0; }
.invoice-import :deep(.el-select) { width: 100%; }
.invoice-import :deep(.el-alert) { margin-bottom: 12px; }
@media (max-width: 600px) { .invoice-import { padding: 12px; } }
</style>
