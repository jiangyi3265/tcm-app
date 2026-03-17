<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePatientsStore } from '../../stores/patients'
import { useAuthStore } from '../../stores/auth'
import { hasPermission } from '../../utils/permissions'
import { formatDate } from '../../utils/dateUtils'
import { ElMessage, ElMessageBox } from 'element-plus'

const { t } = useI18n()

const router = useRouter()
const patientsStore = usePatientsStore()
const authStore = useAuthStore()

const searchQuery = ref('')
const showAddDialog = ref(false)
const showMergeDialog = ref(false)

const roles = computed(() => authStore.roles)
const canCreate = computed(() => hasPermission(roles.value, 'patient.create'))
const canMerge = computed(() => hasPermission(roles.value, 'patient.merge'))

const filteredPatients = computed(() => patientsStore.searchPatients(searchQuery.value))

// 新增表单
const newPatient = ref({
  firstName: '',
  lastName: '',
  middleName: '',
  jobTitle: '',
  accountName: '',
  emails: [''],
  email2: '',
  mobilePhone: '',
  businessPhone: '',
  fax: '',
  preferredContact: 'Any',
  dateOfBirth: '',
  gender: '',
  addressStreet: '',
  addressCity: '',
  addressState: '',
  addressPostal: '',
  diseaseName: '',
  historyAndMedication: '',
  notes: '',
  practitionerId: '',
})

const PREFERRED_CONTACT_OPTIONS = ['Any', 'Email', 'Mobile Phone', 'Business Phone', 'Fax']
const PROVINCE_OPTIONS = ['BC', 'AB', 'ON', 'QC', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'YT', 'NU']

function addEmail() { newPatient.value.emails.push('') }
function removeEmail(idx) { newPatient.value.emails.splice(idx, 1) }

const practitioners = computed(() => authStore.getPractitioners())

async function handleAddPatient() {
  if (!newPatient.value.lastName && !newPatient.value.firstName) {
    return ElMessage.warning(t('patients.nameRequired'))
  }
  const validEmails = newPatient.value.emails.filter((e) => e.trim())
  if (!validEmails.length) return ElMessage.warning(t('patients.emailRequired'))

  await patientsStore.addPatient({
    ...newPatient.value,
    emails: validEmails,
    phone: newPatient.value.mobilePhone,
  })
  ElMessage.success(t('patients.patientCreated'))
  showAddDialog.value = false
  resetForm()
}

function resetForm() {
  newPatient.value = {
    firstName: '', lastName: '', middleName: '', jobTitle: '', accountName: '',
    emails: [''], email2: '', mobilePhone: '', businessPhone: '', fax: '',
    preferredContact: 'Any', dateOfBirth: '', gender: '',
    addressStreet: '', addressCity: '', addressState: '', addressPostal: '',
    diseaseName: '', historyAndMedication: '', notes: '', practitionerId: '',
  }
}

// 合并档案
const mergeFrom = ref('')
const mergeTo = ref('')

async function handleMerge() {
  if (!mergeFrom.value || !mergeTo.value) return ElMessage.warning(t('patients.selectMerge'))
  if (mergeFrom.value === mergeTo.value) return ElMessage.warning(t('patients.cannotMergeSame'))
  await ElMessageBox.confirm(
    t('patients.mergeConfirmMsg'),
    t('patients.mergeConfirmTitle'),
    { type: 'warning' },
  )
  const result = await patientsStore.mergePatients(mergeTo.value, mergeFrom.value)
  if (result) {
    ElMessage.success(t('patients.mergeSuccess'))
    showMergeDialog.value = false
    mergeFrom.value = ''
    mergeTo.value = ''
  }
}

function goToPatient(patient) {
  router.push(`/patients/${patient.id}`)
}

const GENDER_MAP = { 男: 'success', 女: 'danger' }
</script>

<template>
  <div class="patient-list">
    <!-- 顶部操作栏 -->
    <div class="page-toolbar">
      <el-input
        v-model="searchQuery"
        :placeholder="t('patients.searchPlaceholder')"
        clearable
        style="width: 300px"
        :prefix-icon="'Search'"
      />
      <div class="toolbar-actions">
        <el-button v-if="canMerge" @click="showMergeDialog = true">
          <el-icon><Merge /></el-icon> {{ t('patients.mergeRecords') }}
        </el-button>
        <el-button v-if="canCreate" type="primary" @click="showAddDialog = true">
          <el-icon><Plus /></el-icon> {{ t('patients.newPatient') }}
        </el-button>
      </div>
    </div>

    <!-- 病人列表 -->
    <el-card class="list-card">
      <el-table
        :data="filteredPatients"
        row-key="id"
        stripe
        @row-click="goToPatient"
        style="cursor: pointer"
      >
        <el-table-column :label="t('patients.name')" min-width="100">
          <template #default="{ row }">
            <div class="patient-name-cell">
              <el-avatar :size="32" style="background: var(--color-primary); flex-shrink:0">
                {{ (row.name || '?').charAt(0) }}
              </el-avatar>
              <div>
                <div style="font-weight: 600">{{ row.name }}</div>
                <div style="font-size: 12px; color: #888">{{ row.emails?.[0] }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('patients.gender')" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.gender" :type="GENDER_MAP[row.gender]" size="small">{{ row.gender }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="phone" :label="t('patients.phone')" width="130" />
        <el-table-column :label="t('patients.dateOfBirth')" width="120">
          <template #default="{ row }">{{ row.dateOfBirth || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('patients.consent')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.consentSigned ? 'success' : 'danger'" size="small">
              {{ row.consentSigned ? t('patients.consentSigned') : t('patients.consentUnsigned') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('patients.createdDate')" width="120">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('patients.operation')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click.stop="goToPatient(row)">
              {{ t('patients.view') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-footer">{{ t('patients.totalCount', { count: filteredPatients.length }) }}</div>
    </el-card>

    <!-- 新建病人对话框 -->
    <el-drawer v-model="showAddDialog" :title="t('patients.newPatientDialog')" size="680px" direction="rtl" :close-on-press-escape="true">
      <el-form :model="newPatient" label-width="100px" size="small">
        <div class="form-section-title">{{ t('patients.basicInfo') }}</div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item :label="t('patients.lastName')" required>
              <el-input v-model="newPatient.lastName" placeholder="Last Name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('patients.firstName')" required>
              <el-input v-model="newPatient.firstName" placeholder="First Name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('patients.middleName')">
              <el-input v-model="newPatient.middleName" placeholder="Middle Name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('patients.gender')">
              <el-radio-group v-model="newPatient.gender">
                <el-radio value="男">{{ t('patients.male') }}</el-radio>
                <el-radio value="女">{{ t('patients.female') }}</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('patients.dateOfBirth')">
              <el-date-picker
                v-model="newPatient.dateOfBirth"
                type="date"
                :placeholder="t('patients.selectDate')"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('patients.jobTitle')">
              <el-input v-model="newPatient.jobTitle" placeholder="Job Title" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('patients.accountName')">
              <el-input v-model="newPatient.accountName" :placeholder="t('patients.accountNamePh')" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-section-title">{{ t('patients.contactInfo') }}</div>
        <el-row :gutter="12">
          <el-col :span="24">
            <el-form-item :label="t('patients.email1')" required>
              <div class="email-list">
                <div v-for="(email, idx) in newPatient.emails" :key="idx" class="email-row">
                  <el-input v-model="newPatient.emails[idx]" :placeholder="t('patients.emailN', { n: idx + 1 })" />
                  <el-button
                    v-if="newPatient.emails.length > 1"
                    type="danger"
                    text
                    :icon="'Delete'"
                    @click="removeEmail(idx)"
                  />
                </div>
                <el-button size="small" text @click="addEmail">{{ t('patients.addEmail') }}</el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('patients.email2')">
              <el-input v-model="newPatient.email2" :placeholder="t('patients.secondEmail')" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('patients.mobilePhone')">
              <el-input v-model="newPatient.mobilePhone" placeholder="Mobile Phone" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('patients.businessPhone')">
              <el-input v-model="newPatient.businessPhone" placeholder="Business Phone" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('patients.fax')">
              <el-input v-model="newPatient.fax" placeholder="Fax" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('patients.preferredContact')">
              <el-select v-model="newPatient.preferredContact" style="width:100%">
                <el-option v-for="opt in PREFERRED_CONTACT_OPTIONS" :key="opt" :label="opt" :value="opt" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-section-title">{{ t('patients.addressSection') }}</div>
        <el-row :gutter="12">
          <el-col :span="24">
            <el-form-item :label="t('patients.streetAddress')">
              <el-input v-model="newPatient.addressStreet" placeholder="Street Address" />
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item :label="t('patients.city')">
              <el-input v-model="newPatient.addressCity" placeholder="City" />
            </el-form-item>
          </el-col>
          <el-col :span="7">
            <el-form-item :label="t('patients.province')">
              <el-select v-model="newPatient.addressState" style="width:100%">
                <el-option v-for="p in PROVINCE_OPTIONS" :key="p" :label="p" :value="p" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="7">
            <el-form-item :label="t('patients.postalCode')">
              <el-input v-model="newPatient.addressPostal" placeholder="Postal Code" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="form-section-title">{{ t('patients.medicalInfo') }}</div>
        <el-row :gutter="12">
          <el-col :span="24">
            <el-form-item :label="t('patients.diseaseName')">
              <el-input v-model="newPatient.diseaseName" :placeholder="t('patients.diseaseNamePh')" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('patients.historyAndMedication')">
              <el-input
                v-model="newPatient.historyAndMedication"
                type="textarea"
                :rows="3"
                :placeholder="t('patients.historyPlaceholder')"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('patients.primaryPractitioner')">
              <el-select v-model="newPatient.practitionerId" :placeholder="t('patients.selectPractitioner')" style="width: 100%">
                <el-option
                  v-for="p in practitioners"
                  :key="p.id"
                  :label="p.name"
                  :value="p.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('common.notes')">
              <el-input v-model="newPatient.notes" :placeholder="t('patients.notesPlaceholder')" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false; resetForm()">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleAddPatient">{{ t('patients.createRecord') }}</el-button>
      </template>
    </el-drawer>

    <!-- 合并档案对话框 -->
    <el-drawer v-model="showMergeDialog" :title="t('patients.mergeDialog')" size="500px" direction="rtl">
      <el-alert type="warning" show-icon :closable="false" style="margin-bottom: 16px">
        {{ t('patients.mergeWarning') }}
      </el-alert>
      <el-form label-width="90px">
        <el-form-item :label="t('patients.keepRecord')">
          <el-select v-model="mergeTo" filterable :placeholder="t('patients.selectKeep')" style="width: 100%">
            <el-option v-for="p in patientsStore.activePatients" :key="p.id" :label="p.name + ' (' + (p.emails?.[0] || '') + ')'" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('patients.mergeSource')">
          <el-select v-model="mergeFrom" filterable :placeholder="t('patients.selectDeactivate')" style="width: 100%">
            <el-option v-for="p in patientsStore.activePatients" :key="p.id" :label="p.name + ' (' + (p.emails?.[0] || '') + ')'" :value="p.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showMergeDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="danger" @click="handleMerge">{{ t('patients.confirmMerge') }}</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.patient-list { max-width: 1100px; }

.page-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.list-card { border-radius: 12px; }

.patient-name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.table-footer {
  margin-top: 12px;
  font-size: 13px;
  color: #888;
  text-align: right;
}

.email-list { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.email-row { display: flex; gap: 6px; align-items: center; }

.form-section-title {
  font-size: 12px;
  font-weight: 700;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 12px 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #eee;
}
</style>
