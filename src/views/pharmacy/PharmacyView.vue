<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConsultationsStore } from '../../stores/consultations'
import { usePatientsStore } from '../../stores/patients'
import { useAuthStore } from '../../stores/auth'
import { useInventoryStore } from '../../stores/inventory'
import { useBranchesStore } from '../../stores/branches'
import { formatDate } from '../../utils/dateUtils'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()
const consultationsStore = useConsultationsStore()
const patientsStore = usePatientsStore()
const authStore = useAuthStore()
const inventoryStore = useInventoryStore()
const branchesStore = useBranchesStore()

const activeTab = ref('pending')


const pendingPrescriptions = computed(() => {
  const branchId = branchesStore.currentBranchId
  return consultationsStore.pendingPrescriptions
    .filter(c => !branchId || c.branchId === branchId || !c.branchId)
    .map((c) => ({
      ...c,
      patient: patientsStore.getPatient(c.patientId),
      practitioner: authStore.users.find((u) => u.id === c.practitionerId),
    }))
})

const completedPrescriptions = computed(() => {
  const branchId = branchesStore.currentBranchId
  return consultationsStore.consultations
    .filter((c) => c.dispensingCompleted && c.prescriptionType !== 'none' && (!branchId || c.branchId === branchId || !c.branchId))
    .map((c) => ({
      ...c,
      patient: patientsStore.getPatient(c.patientId),
      practitioner: authStore.users.find((u) => u.id === c.practitionerId),
    }))
    .slice(0, 30)
})

const selectedConsult = ref(null)
const showDetailDialog = ref(false)

function viewDetail(consult) {
  selectedConsult.value = consult
  showDetailDialog.value = true
}

async function markDispensed(consult) {
  await ElMessageBox.confirm(t('pharmacy.confirmDispenseMsg', { name: consult.patient?.name }), t('pharmacy.confirmDispenseTitle'), { type: 'success' })
  try {
    // 后端 markDispensingComplete 会自动扣减库存，前端无需额外调用 deductFromPrescription
    await consultationsStore.markDispensingComplete(consult.id)
    showDetailDialog.value = false
    ElMessage.success(t('pharmacy.dispensed'))
  } catch (e) {
    ElMessage.error(e.message || t('pharmacy.stockWarning'))
  }
}

// 根据处方类型匹配库存项（与后端 deductFromPrescription 逻辑一致）
const CATEGORY_MAP = { raw_herbs: 'raw_herbs', powder: 'powder', pills: 'pills' }

function matchInventory(herbName, prescriptionType) {
  if (!herbName) return null
  const category = CATEGORY_MAP[prescriptionType] || 'raw_herbs'
  const q = herbName.toLowerCase()
  // 先按分类精确匹配
  const byCategory = inventoryStore.items.filter(
    i => i.isActive && !i.deletedAt && i.name.toLowerCase().includes(q) && i.category === category
  )
  if (byCategory.length > 0) {
    // 按库存量降序，和后端一致
    return byCategory.sort((a, b) => (b.quantity || 0) - (a.quantity || 0))[0]
  }
  // 兜底：不限分类
  const all = inventoryStore.findByName(herbName)
  return all.length > 0 ? all[0] : null
}
</script>

<template>
  <div class="pharmacy-view">
    <div class="pharmacy-header">
      <h2>{{ t('pharmacy.title') }}</h2>
      <el-badge :value="pendingPrescriptions.length" :hidden="pendingPrescriptions.length === 0">
        <el-tag type="warning">{{ t('pharmacy.pendingPrescriptions') }}</el-tag>
      </el-badge>
    </div>

    <el-tabs v-model="activeTab">
      <el-tab-pane :label="t('pharmacy.pendingTab')" name="pending">
        <div v-if="pendingPrescriptions.length === 0" class="empty-state">
          <el-empty :description="t('pharmacy.noPending')" />
        </div>
        <div v-else class="prescription-list">
          <el-card
            v-for="c in pendingPrescriptions"
            :key="c.id"
            class="rx-card"
            @click="viewDetail(c)"
          >
            <div class="rx-card-header">
              <div class="rx-patient-info">
                <el-avatar :size="40" style="background: var(--color-primary)">
                  {{ c.patient?.name?.charAt(0) }}
                </el-avatar>
                <div>
                  <div class="rx-patient-name">{{ c.patient?.name }}</div>
                  <div class="rx-date">{{ formatDate(c.date) }} · {{ c.practitioner?.name }}</div>
                </div>
              </div>
              <div>
                <el-tag type="warning">{{ t('pharmacy.prescriptionType.' + (c.prescriptionType || 'raw_herbs')) }}</el-tag>
              </div>
            </div>

            <div class="rx-formula">
              <span class="rx-formula-name">{{ c.formulaName || t('common.customFormula') }}</span>
            </div>

            <div class="rx-herbs" v-if="c.herbals.length > 0">
              {{ c.herbals.map((h) => `${h.name} ${h.dosage}${h.unit}`).join('　') }}
            </div>

            <div class="rx-actions" @click.stop>
              <el-button type="success" size="small" @click="markDispensed(c)">
                <el-icon><Check /></el-icon> {{ t('pharmacy.confirmDispense') }}
              </el-button>
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('pharmacy.completedTab')" name="completed">
        <el-table :data="completedPrescriptions" stripe>
          <el-table-column :label="t('pharmacy.patient')" min-width="100">
            <template #default="{ row }">{{ row.patient?.name }}</template>
          </el-table-column>
          <el-table-column :label="t('pharmacy.date')" width="120">
            <template #default="{ row }">{{ formatDate(row.date) }}</template>
          </el-table-column>
          <el-table-column :label="t('pharmacy.formula')" min-width="120">
            <template #default="{ row }">{{ row.formulaName || t('common.customFormula') }}</template>
          </el-table-column>
          <el-table-column :label="t('pharmacy.type')" width="80">
            <template #default="{ row }">{{ t('pharmacy.prescriptionType.' + (row.prescriptionType || 'raw_herbs')) }}</template>
          </el-table-column>
          <el-table-column :label="t('pharmacy.practitioner')" min-width="80">
            <template #default="{ row }">{{ row.practitioner?.name }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 处方详情 -->
    <el-drawer v-model="showDetailDialog" :title="t('pharmacy.prescriptionDetail')" size="520px" direction="rtl">
      <div v-if="selectedConsult" class="rx-detail">
        <div class="rx-detail-header">
          <div>
            <strong>{{ selectedConsult.patient?.name }}</strong>
            <span style="color:#888; margin-left: 8px">{{ formatDate(selectedConsult.date) }}</span>
          </div>
          <el-tag type="warning">{{ t('pharmacy.prescriptionType.' + (selectedConsult.prescriptionType || 'raw_herbs')) }}</el-tag>
        </div>

        <div class="rx-detail-formula" v-if="selectedConsult.formulaName">
          <el-tag type="success">{{ selectedConsult.formulaName }}</el-tag>
        </div>

        <el-table :data="selectedConsult.herbals" size="small" style="margin-top: 12px">
          <el-table-column prop="name" :label="t('pharmacy.herb')" />
          <el-table-column :label="t('pharmacy.dosageCol')" width="140">
            <template #default="{ row }">
              <span>{{ row.dosage }} {{ row.unit }}</span>
              <span v-if="(selectedConsult.prescriptions?.[0]?.quantity || 1) > 1"
                    style="color:#888; font-size:12px">
                × {{ selectedConsult.prescriptions?.[0]?.quantity || 1 }}{{ t('pharmacy.doses') }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('pharmacy.stockStatus')" width="180">
            <template #default="{ row }">
              <span>
                <template v-if="matchInventory(row.name, selectedConsult.prescriptionType)">
                  <el-tag
                    :type="matchInventory(row.name, selectedConsult.prescriptionType).quantity >= row.dosage * (selectedConsult.prescriptions?.[0]?.quantity || 1) ? 'success' : 'danger'"
                    size="small"
                  >
                    {{ matchInventory(row.name, selectedConsult.prescriptionType).quantity }}{{ row.unit }}
                  </el-tag>
                  <div style="font-size:11px; color:#888; margin-top:2px">
                    {{ matchInventory(row.name, selectedConsult.prescriptionType).supplier ? matchInventory(row.name, selectedConsult.prescriptionType).supplier + ' · ' : '' }}{{ { raw_herbs: t('pharmacy.prescriptionType.raw_herbs'), powder: t('pharmacy.prescriptionType.powder'), pills: t('pharmacy.prescriptionType.pills') }[matchInventory(row.name, selectedConsult.prescriptionType).category] || '' }}
                  </div>
                  <div v-if="(selectedConsult.prescriptions?.[0]?.quantity || 1) > 1" style="font-size:11px; color:#888">
                    {{ t('pharmacy.totalNeed') }}{{ row.dosage * (selectedConsult.prescriptions?.[0]?.quantity || 1) }}{{ row.unit }}
                  </div>
                </template>
                <el-tag v-else type="info" size="small">{{ t('pharmacy.noStock') }}</el-tag>
              </span>
            </template>
          </el-table-column>
        </el-table>

        <div style="margin-top: 12px; font-size: 13px; color: #666">
          <strong>{{ t('pharmacy.diagnosis') }}</strong>{{ selectedConsult.differentiation }}
        </div>
      </div>
      <template #footer>
        <el-button @click="showDetailDialog = false">{{ t('common.close') }}</el-button>
        <el-button type="success" @click="markDispensed(selectedConsult)">{{ t('pharmacy.confirmDispense') }}</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.pharmacy-view { max-width: 900px; }

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
}

.rx-patient-info { display: flex; gap: 12px; align-items: center; }
.rx-patient-name { font-weight: 600; font-size: 15px; }
.rx-date { font-size: 12px; color: #888; }
.rx-formula { margin-bottom: 6px; }
.rx-formula-name { font-weight: 600; color: #2d6a4f; }

.rx-herbs {
  font-size: 13px;
  color: #555;
  line-height: 1.8;
  background: #f9f9f9;
  padding: 8px;
  border-radius: 6px;
  margin-bottom: 10px;
}

.rx-actions { text-align: right; }

.rx-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.rx-detail-formula { margin-bottom: 6px; }
</style>
