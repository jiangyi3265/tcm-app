<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { intakePublicApi } from '../../utils/api'

const route = useRoute()
const { locale } = useI18n()
const token = route.params.token

const loading = ref(true)
const pageError = ref('')
const submitError = ref('')
const appointmentInfo = ref(null)
const submitting = ref(false)
const submitted = ref(false)
const cancelling = ref(false)
const cancelled = ref(false)

const isZh = computed(() => locale.value === 'zh-CN')

const copy = computed(() => (isZh.value
  ? {
      pageTitle: '首诊情况问询',
      pageSubtitle: '请填写基础健康资料，勾选项只记录已选内容',
      loading: '正在加载表单...',
      invalidTitle: '无法处理请求',
      submittedTitle: '表单已提交',
      submittedDesc: '谢谢，系统已保存您的首诊资料，诊所会在就诊前查看。',
      cancelledTitle: '预约已取消',
      cancelledDesc: '本次预约已经取消，后续提醒和回访邮件将不再发送。',
      patientLabel: '病人',
      appointmentLabel: '预约时间',
      chiefComplaint: '主要症状 / 就诊原因 *',
      chiefComplaintPh: '请填写本次来诊最主要的症状或诉求',
      duration: '症状持续时间',
      description: '症状描述',
      descriptionPh: '请描述何时开始、何时加重、什么情况下缓解',
      progress: '病情发展 / 初始疾病情况',
      progressPh: '请补充症状变化、诱因和目前状态',
      implants: '金属植入',
      history: '主要基础病史',
      historyMore: '其他病史补充',
      historyMorePh: '请注明其他疾病或手术史...',
      currentMeds: '目前用药情况',
      medicationDetails: '药品名称及剂量（请列明）',
      allergies: '过敏史',
      lifestyle: '生活方式',
      familyHistory: '家族病史 / Family history',
      familyHistoryPh: '请补充直系亲属的重要病史（如有）',
      femaleOnly: '女性专项',
      declaration: '知情声明',
      declarationText: '本人声明以上信息真实准确，并理解：针灸治疗可能存在轻微酸胀感、淤青、晕针等风险；医师将根据本表信息制定最安全的治疗方案。',
      signature: '患者签名 Patient Signature',
      signaturePh: '签名处 / Signature here',
      signedDate: '日期 Date',
      additionalNotes: '其他补充说明',
      additionalNotesPh: '其他希望医师提前了解的情况...',
      submit: '提交首诊表',
      submitting: '提交中...',
      cancel: '取消这次预约',
      cancelling: '取消中...',
      signPreview: '签名预览',
      fillChiefComplaint: '请先填写主要症状 / 就诊原因',
      loadFailed: '无法加载问诊表信息',
      submitFailed: '提交失败',
      cancelFailed: '取消预约失败',
    }
  : {
      pageTitle: 'Initial Intake Questionnaire',
      pageSubtitle: 'Please complete your baseline health information before the visit',
      loading: 'Loading form...',
      invalidTitle: 'Unable to process this request',
      submittedTitle: 'Form submitted',
      submittedDesc: 'Thank you. Your intake information has been saved for the clinic to review before your visit.',
      cancelledTitle: 'Appointment cancelled',
      cancelledDesc: 'This appointment has been cancelled and follow-up emails will stop automatically.',
      patientLabel: 'Patient',
      appointmentLabel: 'Appointment',
      chiefComplaint: 'Chief complaint / reason for visit *',
      chiefComplaintPh: 'Describe the main issue you want help with',
      duration: 'Duration',
      description: 'Symptom details',
      descriptionPh: 'When did it start, what makes it worse, and what relieves it?',
      progress: 'Progress / onset of illness',
      progressPh: 'Describe the course of the condition, triggers, and current status',
      implants: 'Metal implants',
      history: 'Medical history',
      historyMore: 'Additional medical history',
      historyMorePh: 'Please add other illnesses or surgeries...',
      currentMeds: 'Current medications',
      medicationDetails: 'Medication names and dosages',
      allergies: 'Allergies',
      lifestyle: 'Lifestyle',
      familyHistory: 'Family history',
      familyHistoryPh: 'Add important family medical history if applicable',
      femaleOnly: 'Female patients only',
      declaration: 'Informed declaration',
      declarationText: 'I declare the above information is accurate. I understand acupuncture may involve minor risks such as soreness, bruising, or needle fainting.',
      signature: 'Patient signature',
      signaturePh: 'Type your name here',
      signedDate: 'Date',
      additionalNotes: 'Additional notes',
      additionalNotesPh: 'Anything else the practitioner should know...',
      submit: 'Submit intake form',
      submitting: 'Submitting...',
      cancel: 'Cancel this appointment',
      cancelling: 'Cancelling...',
      signPreview: 'Signature preview',
      fillChiefComplaint: 'Please fill in the chief complaint first',
      loadFailed: 'Unable to load the intake form',
      submitFailed: 'Failed to submit the intake form',
      cancelFailed: 'Failed to cancel the appointment',
    }))

function bilingualHeading(label, english) {
  const text = String(label || '').trim()
  const englishText = String(english || '').trim()
  if (!text) return englishText
  if (!englishText || text.toLowerCase() === englishText.toLowerCase()) return text
  return `${text} ${englishText}`
}

const MEDICAL_HISTORY_OPTIONS = [
  '高血压 Hypertension',
  '糖尿病 Diabetes',
  '冠心病 Coronary Artery Disease',
  '心律不齐 Arrhythmia',
  '心力衰竭 Heart Failure',
  '脑卒中史 Stroke History',
  '哮喘 / 慢阻肺 Asthma / COPD',
  '肾脏病 Kidney Disease',
  '肝脏病 Liver Disease',
  '自身免疫疾病 Autoimmune Disease',
  '恶性肿瘤 Cancer / Malignancy',
  '凝血功能障碍 Coagulation Disorder',
  '甲状腺疾病 Thyroid Disease',
  '骨质疏松 Osteoporosis',
  '皮肤病 Skin Condition',
  '精神 / 心理疾病 Psychiatric Condition',
  '神经系统疾病 Neurological Disease',
  '其他 Other',
]

const CURRENT_MEDICATION_OPTIONS = [
  '抗凝血药（华法林、阿司匹林等） Anticoagulants',
  '降压药 Antihypertensives',
  '降糖药 / 胰岛素 Diabetes Medications',
  '抗抑郁 / 精神类药物 Psychiatric Medications',
  '类固醇 / 免疫抑制剂 Steroids / Immunosuppressants',
  '中草药 / 中成药 Chinese Herbal Medicine',
  '保健品 / 维生素 Supplements / Vitamins',
  '其他处方药 Other Prescription Drugs',
]

function createIntakeForm() {
  return {
    chiefComplaint: '',
    chiefComplaintDuration: '',
    chiefComplaintDescription: '',
    progressOfDisease: '',
    metalImplantsLocation: '',
    implantType: '',
    medicalHistorySelections: [],
    otherMedicalHistory: '',
    currentMedicationSelections: [],
    medicationDetails: '',
    drugAllergies: '',
    otherAllergies: '',
    familyHistory: '',
    smokingStatus: '',
    alcoholStatus: '',
    exerciseStatus: '',
    lifestyleNotes: '',
    currentlyPregnant: '',
    breastfeeding: '',
    additionalNotes: '',
    signatureName: '',
    signedDate: new Date().toISOString().slice(0, 10),
  }
}

const form = ref(createIntakeForm())
const chiefComplaintField = ref(null)

const chiefComplaintError = computed(() => (
  form.value.chiefComplaint.trim() ? '' : copy.value.fillChiefComplaint
))
const displayedSubmitError = computed(() => submitError.value || chiefComplaintError.value)

const formattedStartTime = computed(() => {
  const value = appointmentInfo.value?.startTime
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value).replace('T', ' ').slice(0, 16)
  return parsed.toLocaleString(isZh.value ? 'zh-CN' : 'en-US')
})

onMounted(async () => {
  try {
    const info = await intakePublicApi.getInfo(token)
    appointmentInfo.value = info
    if (info.intakeSubmitted) {
      submitted.value = true
    }
  } catch (e) {
    pageError.value = e.message || copy.value.loadFailed
  } finally {
    loading.value = false
  }
})

function toggleMulti(field, option) {
  const current = Array.isArray(form.value[field]) ? [...form.value[field]] : []
  const index = current.indexOf(option)
  if (index >= 0) current.splice(index, 1)
  else current.push(option)
  form.value[field] = current
}

function isChecked(field, option) {
  return Array.isArray(form.value[field]) && form.value[field].includes(option)
}

async function handleSubmit() {
  if (chiefComplaintError.value) {
    submitError.value = chiefComplaintError.value
    await nextTick()
    chiefComplaintField.value?.focus()
    return
  }
  submitting.value = true
  submitError.value = ''
  try {
    await intakePublicApi.submit(token, form.value)
    submitted.value = true
  } catch (e) {
    submitError.value = e.message || copy.value.submitFailed
  } finally {
    submitting.value = false
  }
}

async function handleCancelAppointment() {
  cancelling.value = true
  submitError.value = ''
  try {
    await intakePublicApi.cancel(token)
    cancelled.value = true
  } catch (e) {
    submitError.value = e.message || copy.value.cancelFailed
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <div class="intake-page">
    <div class="intake-card">
      <div class="intake-header">
        <div class="header-badge">{{ appointmentInfo?.clinicName || 'OTCM' }}</div>
        <h1>{{ copy.pageTitle }}</h1>
        <p>{{ copy.pageSubtitle }}</p>
        <p v-if="appointmentInfo?.clinicAddress || appointmentInfo?.clinicPhone" class="clinic-contact">
          <span v-if="appointmentInfo?.clinicAddress">{{ appointmentInfo.clinicAddress }}</span>
          <span v-if="appointmentInfo?.clinicAddress && appointmentInfo?.clinicPhone"> · </span>
          <span v-if="appointmentInfo?.clinicPhone">{{ appointmentInfo.clinicPhone }}</span>
        </p>
      </div>

      <div v-if="loading" class="state-box">
        <div class="spinner"></div>
        <p>{{ copy.loading }}</p>
      </div>

      <div v-else-if="pageError && !submitted && !cancelled" class="state-box error">
        <h2>{{ copy.invalidTitle }}</h2>
        <p>{{ pageError }}</p>
      </div>

      <div v-else-if="submitted" class="state-box success">
        <h2>{{ copy.submittedTitle }}</h2>
        <p>{{ copy.submittedDesc }}</p>
      </div>

      <div v-else-if="cancelled" class="state-box success">
        <h2>{{ copy.cancelledTitle }}</h2>
        <p>{{ copy.cancelledDesc }}</p>
      </div>

      <div v-else class="intake-body">
        <div class="meta-card">
          <div>
            <span class="meta-label">{{ copy.patientLabel }}</span>
            <strong>{{ appointmentInfo?.patientName || '-' }}</strong>
          </div>
          <div v-if="formattedStartTime">
            <span class="meta-label">{{ copy.appointmentLabel }}</span>
            <strong>{{ formattedStartTime }}</strong>
          </div>
        </div>

        <section class="section-card">
          <h2>{{ copy.chiefComplaint }}</h2>
          <div class="grid two">
            <label class="field-block full">
              <span>{{ copy.chiefComplaint }}</span>
              <textarea
                ref="chiefComplaintField"
                v-model="form.chiefComplaint"
                class="form-textarea"
                rows="3"
                :placeholder="copy.chiefComplaintPh"
                :aria-invalid="Boolean(chiefComplaintError)"
                required
                @input="submitError = ''"
              ></textarea>
            </label>
            <label class="field-block">
              <span>{{ copy.duration }}</span>
              <input v-model="form.chiefComplaintDuration" class="form-input" type="text" placeholder="例如：3 天 / 2 weeks" />
            </label>
            <label class="field-block full">
              <span>{{ copy.description }}</span>
              <textarea v-model="form.chiefComplaintDescription" class="form-textarea" rows="3" :placeholder="copy.descriptionPh"></textarea>
            </label>
            <label class="field-block full">
              <span>{{ copy.progress }}</span>
              <textarea v-model="form.progressOfDisease" class="form-textarea" rows="3" :placeholder="copy.progressPh"></textarea>
            </label>
          </div>
        </section>

        <section class="section-card">
          <h2>{{ copy.implants }}</h2>
          <div class="grid two">
            <label class="field-block">
              <span>金属植入物部位（如有） Location of metal implants</span>
              <input v-model="form.metalImplantsLocation" class="form-input" type="text" placeholder="请注明部位" />
            </label>
            <label class="field-block">
              <span>植入物类型 Type of implant</span>
              <input v-model="form.implantType" class="form-input" type="text" placeholder="如：钛合金螺钉、关节假体等" />
            </label>
          </div>
        </section>

        <section class="section-card dark">
          <h2>{{ bilingualHeading(copy.history, 'MEDICAL HISTORY') }}</h2>
          <div class="option-grid three">
            <label v-for="option in MEDICAL_HISTORY_OPTIONS" :key="option" class="check-option">
              <input :checked="isChecked('medicalHistorySelections', option)" type="checkbox" @change="toggleMulti('medicalHistorySelections', option)" />
              <span>{{ option }}</span>
            </label>
          </div>
          <label class="field-block full">
            <span>{{ copy.historyMore }} Additional history</span>
            <textarea v-model="form.otherMedicalHistory" class="form-textarea" rows="3" :placeholder="copy.historyMorePh"></textarea>
          </label>
          <label class="field-block full">
            <span>{{ copy.familyHistory }}</span>
            <textarea v-model="form.familyHistory" class="form-textarea" rows="3" :placeholder="copy.familyHistoryPh"></textarea>
          </label>
        </section>

        <section class="section-card dark">
          <h2>{{ bilingualHeading(copy.currentMeds, 'CURRENT MEDICATIONS') }}</h2>
          <div class="option-grid two">
            <label v-for="option in CURRENT_MEDICATION_OPTIONS" :key="option" class="check-option">
              <input :checked="isChecked('currentMedicationSelections', option)" type="checkbox" @change="toggleMulti('currentMedicationSelections', option)" />
              <span>{{ option }}</span>
            </label>
          </div>
          <label class="field-block full">
            <span>{{ copy.medicationDetails }}</span>
            <textarea v-model="form.medicationDetails" class="form-textarea" rows="4" placeholder="药名 / Name\n剂量 / Dose"></textarea>
          </label>
        </section>

        <section class="section-card dark">
          <h2>{{ bilingualHeading(copy.allergies, 'ALLERGIES') }}</h2>
          <div class="grid two">
            <label class="field-block">
              <span>药物过敏 Drug Allergies</span>
              <input v-model="form.drugAllergies" class="form-input" type="text" placeholder="如：青霉素、磺胺类..." />
            </label>
            <label class="field-block">
              <span>其他过敏 Other Allergies</span>
              <input v-model="form.otherAllergies" class="form-input" type="text" placeholder="如：乳胶、金属、食物..." />
            </label>
          </div>
        </section>

        <section class="section-card dark">
          <h2>{{ bilingualHeading(copy.lifestyle, 'LIFESTYLE') }}</h2>
          <div class="grid two">
            <div class="field-block">
              <span>吸烟 Smoking</span>
              <div class="radio-group">
                <label><input v-model="form.smokingStatus" type="radio" value="无 None" /> <span>无 None</span></label>
                <label><input v-model="form.smokingStatus" type="radio" value="有 Yes" /> <span>有 Yes</span></label>
                <label><input v-model="form.smokingStatus" type="radio" value="已戒 Quit" /> <span>已戒 Quit</span></label>
              </div>
            </div>
            <div class="field-block">
              <span>饮酒 Alcohol</span>
              <div class="radio-group">
                <label><input v-model="form.alcoholStatus" type="radio" value="无 None" /> <span>无 None</span></label>
                <label><input v-model="form.alcoholStatus" type="radio" value="偶尔 Occasionally" /> <span>偶尔 Occasionally</span></label>
                <label><input v-model="form.alcoholStatus" type="radio" value="经常 Frequently" /> <span>经常 Frequently</span></label>
              </div>
            </div>
            <div class="field-block">
              <span>运动习惯 Exercise</span>
              <div class="radio-group">
                <label><input v-model="form.exerciseStatus" type="radio" value="无 None" /> <span>无 None</span></label>
                <label><input v-model="form.exerciseStatus" type="radio" value="偶尔 Occasionally" /> <span>偶尔 Occasionally</span></label>
                <label><input v-model="form.exerciseStatus" type="radio" value="规律 Regularly" /> <span>规律 Regularly</span></label>
              </div>
            </div>
            <label class="field-block">
              <span>生活方式补充 Lifestyle notes</span>
              <input v-model="form.lifestyleNotes" class="form-input" type="text" placeholder="如：夜班、久坐、饮食不规律..." />
            </label>
          </div>
        </section>

        <section class="section-card dark">
          <h2>{{ bilingualHeading(copy.femaleOnly, 'FEMALE PATIENTS ONLY') }}</h2>
          <div class="grid three">
            <div class="field-block">
              <span>是否妊娠 Currently Pregnant</span>
              <div class="radio-group">
                <label><input v-model="form.currentlyPregnant" type="radio" value="否 No" /> <span>否 No</span></label>
                <label><input v-model="form.currentlyPregnant" type="radio" value="是 Yes" /> <span>是 Yes</span></label>
                <label><input v-model="form.currentlyPregnant" type="radio" value="不确定 Not sure" /> <span>不确定 Not sure</span></label>
              </div>
            </div>
            <div class="field-block">
              <span>是否哺乳 Breastfeeding</span>
              <div class="radio-group">
                <label><input v-model="form.breastfeeding" type="radio" value="否 No" /> <span>否 No</span></label>
                <label><input v-model="form.breastfeeding" type="radio" value="是 Yes" /> <span>是 Yes</span></label>
              </div>
            </div>
          </div>
        </section>

        <section class="section-card dark">
          <h2>{{ copy.additionalNotes }}</h2>
          <label class="field-block full">
            <span>{{ copy.additionalNotes }}</span>
            <textarea v-model="form.additionalNotes" class="form-textarea" rows="4" :placeholder="copy.additionalNotesPh"></textarea>
          </label>
        </section>

        <section class="section-card dark">
          <h2>{{ bilingualHeading(copy.declaration, 'INFORMED CONSENT STATEMENT') }}</h2>
          <p class="declaration-text">{{ copy.declarationText }}</p>
          <div class="grid two">
            <label class="field-block">
              <span>{{ copy.signature }}</span>
              <input v-model="form.signatureName" class="form-input signature-input" type="text" :placeholder="copy.signaturePh" />
            </label>
            <label class="field-block">
              <span>{{ copy.signedDate }}</span>
              <input v-model="form.signedDate" class="form-input" type="date" />
            </label>
          </div>
          <div class="signature-preview-card">
            <span class="meta-label">{{ copy.signPreview }}</span>
            <div class="signature-preview">{{ form.signatureName || '—' }}</div>
          </div>
        </section>

        <div v-if="displayedSubmitError" class="submit-error" role="alert">{{ displayedSubmitError }}</div>

        <button class="submit-button" :disabled="submitting || Boolean(chiefComplaintError)" @click="handleSubmit">
          {{ submitting ? copy.submitting : copy.submit }}
        </button>
        <button
          v-if="appointmentInfo?.scope === 'appointment'"
          class="cancel-button"
          :disabled="cancelling"
          @click="handleCancelAppointment"
        >
          {{ cancelling ? copy.cancelling : copy.cancel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.intake-page {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(199, 225, 212, 0.82), transparent 34%),
    linear-gradient(180deg, #f4efe7 0%, #edf4ef 100%);
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

.intake-card {
  width: min(1040px, 100%);
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 24px;
  border: 1px solid rgba(96, 123, 107, 0.14);
  box-shadow: 0 22px 64px rgba(51, 74, 59, 0.14);
  overflow: hidden;
}

.intake-header {
  padding: 32px 28px;
  text-align: center;
  color: #fff;
  background: linear-gradient(135deg, rgba(40, 70, 57, 0.96), rgba(94, 121, 96, 0.94), rgba(172, 116, 71, 0.92));
}

.header-badge {
  width: 70px;
  height: 70px;
  margin: 0 auto 14px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 800;
}

.intake-header h1 {
  margin: 0 0 8px;
  font-size: 30px;
}

.intake-header p {
  margin: 0;
  opacity: 0.92;
}

.clinic-contact {
  font-size: 12px;
  opacity: 0.8;
  margin-top: 4px !important;
}

.state-box {
  padding: 56px 28px;
  text-align: center;
}

.state-box.success h2 {
  color: #2d6a4f;
}

.state-box.error h2,
.state-box.error p,
.submit-error {
  color: #c04242;
}

.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 18px;
  border-radius: 50%;
  border: 3px solid rgba(76, 120, 94, 0.18);
  border-top-color: #4e7a60;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.intake-body {
  padding: 26px 28px 34px;
}

.meta-card {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 24px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(100, 129, 111, 0.16);
  background: linear-gradient(135deg, #f8fbf8, #fcf7ef);
  margin-bottom: 18px;
}

.meta-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: #708376;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.section-card {
  margin-bottom: 18px;
  padding: 18px 20px;
  border-radius: 20px;
  border: 1px solid rgba(100, 129, 111, 0.14);
  background: linear-gradient(135deg, #f8fbf8, #fcf7ef);
}

.section-card.dark {
  color: #f4f4f4;
  background: #2f2f2f;
  border-color: rgba(255, 255, 255, 0.06);
}

.section-card h2 {
  margin: 0 0 16px;
  color: inherit;
}

.grid {
  display: grid;
  gap: 14px 16px;
}

.grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.option-grid {
  display: grid;
  gap: 10px 16px;
  margin-bottom: 16px;
}

.option-grid.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.option-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-block.full {
  grid-column: 1 / -1;
}

.field-block span {
  font-weight: 600;
  line-height: 1.45;
}

.form-input,
.form-textarea,
.form-select {
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(119, 138, 126, 0.2);
  background: rgba(255, 255, 255, 0.96);
  color: #20362a;
  padding: 12px 14px;
  box-sizing: border-box;
  font-size: 14px;
}

.section-card.dark .form-input,
.section-card.dark .form-textarea,
.section-card.dark .form-select {
  background: #414141;
  color: #fff;
  border-color: rgba(255, 255, 255, 0.08);
}

.form-textarea {
  resize: vertical;
}

.form-textarea[aria-invalid='true'] {
  border-color: #c04242;
  box-shadow: 0 0 0 2px rgba(192, 66, 66, 0.08);
}

.check-option,
.radio-group label {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  line-height: 1.55;
}

.check-option input,
.radio-group input {
  margin-top: 2px;
  accent-color: #6ca8ff;
}

.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
}

.declaration-text {
  margin: 0 0 14px;
  line-height: 1.75;
  color: inherit;
}

.signature-preview-card {
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px dashed rgba(255, 255, 255, 0.18);
}

.signature-preview {
  margin-top: 8px;
  min-height: 42px;
  display: flex;
  align-items: center;
  font-size: 30px;
  color: #fff;
  font-family: 'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'KaiTi', 'STKaiti', cursive;
}

.section-card:not(.dark) .signature-preview-card {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(93, 117, 101, 0.24);
}

.section-card:not(.dark) .signature-preview {
  color: #244131;
}

.submit-button,
.cancel-button {
  width: 100%;
  padding: 15px 18px;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.submit-button {
  margin-top: 10px;
  background: #2d6a4f;
  color: #fff;
}

.cancel-button {
  margin-top: 12px;
  background: #6d3d3d;
  color: #fff;
}

.submit-button:disabled,
.cancel-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.submit-error {
  margin-top: 6px;
}

@media (max-width: 900px) {
  .grid.two,
  .grid.three,
  .option-grid.two,
  .option-grid.three {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .intake-page {
    padding: 14px;
  }

  .intake-header h1 {
    font-size: 24px;
  }

  .intake-body {
    padding: 20px 18px 24px;
  }
}
</style>
