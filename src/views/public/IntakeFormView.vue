<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { intakePublicApi } from '../../utils/api'
import { TCM_OPTIONS, emptyDiff, normalizeDiff } from '../../utils/sampleData'

const { t, locale } = useI18n()
const route = useRoute()
const token = route.params.token

const loading = ref(true)
const error = ref('')
const appointmentInfo = ref(null)
const submitting = ref(false)
const submitted = ref(false)

function createIntakeForm() {
  return {
    chiefComplaint: '',
    chiefComplaintDuration: '',
    chiefComplaintDescription: '',
    progressOfDisease: '',
    allergies: '',
    currentMedications: '',
    pastMedicalHistory: '',
    familyHistory: '',
    lifestyle: '',
    additionalNotes: '',
    diff: emptyDiff(),
  }
}

function normalizeIntakeForm(input = {}) {
  return {
    ...createIntakeForm(),
    ...input,
    diff: normalizeDiff(input.diff || {}),
  }
}

const form = ref(normalizeIntakeForm())

function splitMixedText(text = '') {
  const value = String(text).trim()
  if (!value) return { zh: '', en: '' }

  const firstChineseIndex = value.search(/[\u3400-\u9fff]/)
  const firstLatinIndex = value.search(/[A-Za-z]/)

  if (firstChineseIndex === -1) {
    return { zh: value, en: value }
  }

  if (firstChineseIndex > 0 && (firstLatinIndex === -1 || firstLatinIndex < firstChineseIndex)) {
    return {
      zh: value.slice(firstChineseIndex).trim(),
      en: value.slice(0, firstChineseIndex).trim(),
    }
  }

  if (firstChineseIndex === 0 && firstLatinIndex > 0) {
    return {
      zh: value.slice(0, firstLatinIndex).trim(),
      en: value.slice(firstLatinIndex).trim(),
    }
  }

  return { zh: value, en: value }
}

function localizeMixedText(text = '') {
  const parts = splitMixedText(text)
  return locale.value === 'zh-CN' ? (parts.zh || text) : (parts.en || text)
}

function formatPublicDateTime(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value).replace('T', ' ').slice(0, 16)
  return parsed.toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US')
}

const visitSummaryFields = computed(() => [
  { key: 'allergies', label: t('publicIntake.summaryFields.allergiesLabel'), type: 'text', placeholder: t('publicIntake.summaryFields.allergiesPlaceholder') },
  { key: 'currentMedications', label: t('publicIntake.summaryFields.currentMedicationsLabel'), type: 'text', placeholder: t('publicIntake.summaryFields.currentMedicationsPlaceholder') },
  { key: 'pastMedicalHistory', label: t('publicIntake.summaryFields.pastMedicalHistoryLabel'), type: 'textarea', rows: 3, placeholder: t('publicIntake.summaryFields.pastMedicalHistoryPlaceholder') },
  { key: 'familyHistory', label: t('publicIntake.summaryFields.familyHistoryLabel'), type: 'textarea', rows: 3, placeholder: t('publicIntake.summaryFields.familyHistoryPlaceholder') },
  { key: 'lifestyle', label: t('publicIntake.summaryFields.lifestyleLabel'), type: 'textarea', rows: 3, placeholder: t('publicIntake.summaryFields.lifestylePlaceholder') },
  { key: 'additionalNotes', label: t('publicIntake.summaryFields.additionalNotesLabel'), type: 'textarea', rows: 3, placeholder: t('publicIntake.summaryFields.additionalNotesPlaceholder') },
])

const symptomSections = computed(() => [
  {
    key: 'exterior',
    title: t('publicIntake.sections.exteriorTitle'),
    open: true,
    groups: [
      { field: 'coldHeat', label: localizeMixedText('Cold/Heat 寒热'), options: TCM_OPTIONS.coldHeat },
      { field: 'sweat', label: localizeMixedText('Sweat 汗出'), options: TCM_OPTIONS.sweat },
      { field: 'headDiscomfort', label: localizeMixedText('Head Discomfort 头部不适'), options: TCM_OPTIONS.headDiscomfort },
      { field: 'headPosition', label: localizeMixedText('Head Position 位置'), options: TCM_OPTIONS.headPosition },
      { field: 'eye', label: localizeMixedText('Eye 眼睛'), options: TCM_OPTIONS.eye },
      { field: 'ear', label: localizeMixedText('Ears 耳朵'), options: TCM_OPTIONS.ear },
      { field: 'nose', label: localizeMixedText('Noses 鼻子'), options: TCM_OPTIONS.nose },
      { field: 'mouth', label: localizeMixedText('Mouth 口'), options: TCM_OPTIONS.mouth },
      { field: 'taste', label: localizeMixedText('Taste 味道'), options: TCM_OPTIONS.taste },
      { field: 'bodyDiscomforts', label: localizeMixedText('Body Discomforts 身体不适'), options: TCM_OPTIONS.bodyDiscomforts },
      { field: 'bodyDiscomfortsLocation', label: localizeMixedText('Body Discomforts Location 身体不适位置'), options: TCM_OPTIONS.bodyDiscomfortsLocation },
      { field: 'skinIssues', label: localizeMixedText('Skin Issues 皮肤'), options: TCM_OPTIONS.skinIssues },
    ],
    textareas: [
      { field: 'otherExterior', label: t('publicIntake.sections.otherExteriorLabel'), placeholder: t('publicIntake.sections.otherExteriorPlaceholder') },
    ],
  },
  {
    key: 'chest',
    title: t('publicIntake.sections.chestTitle'),
    groups: [
      { field: 'chest', label: localizeMixedText('Chest 心胸'), options: TCM_OPTIONS.chest },
      { field: 'hypochondriac', label: localizeMixedText('Hypochondriac 两胁'), options: TCM_OPTIONS.hypochondriac },
      { field: 'sleep', label: localizeMixedText('Sleep 睡觉'), options: TCM_OPTIONS.sleep },
    ],
    inputs: [
      { field: 'anxietyStress', label: t('publicIntake.sections.anxietyStressLabel'), min: 1, max: 10, step: 1 },
    ],
    textareas: [
      { field: 'otherChest', label: t('publicIntake.sections.otherChestLabel'), placeholder: t('publicIntake.sections.otherChestPlaceholder') },
    ],
  },
  {
    key: 'abdomen',
    title: t('publicIntake.sections.abdomenTitle'),
    groups: [
      { field: 'appetite', label: localizeMixedText('Appetite 胃口'), options: TCM_OPTIONS.appetite },
      { field: 'thirst', label: localizeMixedText('Thirst 口渴'), options: TCM_OPTIONS.thirst },
      { field: 'abdomen', label: localizeMixedText('Abdomen 腹部'), options: TCM_OPTIONS.abdomen },
    ],
    textareas: [
      { field: 'otherAbdomen', label: t('publicIntake.sections.otherAbdomenLabel'), placeholder: t('publicIntake.sections.otherAbdomenPlaceholder') },
    ],
  },
  {
    key: 'lower-abdomen',
    title: t('publicIntake.sections.lowerAbdomenTitle'),
    groups: [
      { field: 'bowelMovement', label: localizeMixedText('Bowel Movement 大便'), options: TCM_OPTIONS.bowelMovement },
      { field: 'urine', label: localizeMixedText('Urine 小便'), options: TCM_OPTIONS.urine },
    ],
    textareas: [
      { field: 'otherLowerAbdomen', label: t('publicIntake.sections.otherLowerAbdomenLabel'), placeholder: t('publicIntake.sections.otherLowerAbdomenPlaceholder') },
    ],
  },
  {
    key: 'female',
    title: t('publicIntake.sections.femaleTitle'),
    inputs: [
      { field: 'periodCircle', label: t('publicIntake.sections.periodCircleLabel'), min: 0, max: 180, step: 1 },
      { field: 'periodDuration', label: t('publicIntake.sections.periodDurationLabel'), min: 0, max: 30, step: 1 },
    ],
    groups: [
      { field: 'bloodQuality', label: localizeMixedText('Blood Quality 经血情况'), options: TCM_OPTIONS.bloodQuality },
      { field: 'pms', label: localizeMixedText('PMS 经期相关症状'), options: TCM_OPTIONS.pms },
    ],
    textareas: [
      { field: 'otherFemale', label: t('publicIntake.sections.otherFemaleLabel'), placeholder: t('publicIntake.sections.otherFemalePlaceholder') },
    ],
  },
  {
    key: 'tongue-pulse',
    title: t('publicIntake.sections.tonguePulseTitle'),
    groups: [
      { field: 'tongueColor', label: localizeMixedText('Tongue Color 舌色'), options: TCM_OPTIONS.tongueColor },
      { field: 'tongueBody', label: localizeMixedText('Tongue Body/Shape 舌体/形'), options: TCM_OPTIONS.tongueBody },
      { field: 'tongueCoating', label: localizeMixedText('Tongue Coating 舌苔'), options: TCM_OPTIONS.tongueCoating },
      { field: 'pulse', label: localizeMixedText('All Position 六部'), options: TCM_OPTIONS.pulse },
      { field: 'pulseRightHand', label: localizeMixedText('Right Hand 单右手脉'), options: TCM_OPTIONS.pulse },
      { field: 'pulseLeftHand', label: localizeMixedText('Left Hand 单左手脉'), options: TCM_OPTIONS.pulse },
      { field: 'pulseBothCun', label: localizeMixedText('Both Cun 双寸脉'), options: TCM_OPTIONS.pulse },
      { field: 'pulseBothGuan', label: localizeMixedText('Both Guan 双关脉'), options: TCM_OPTIONS.pulse },
      { field: 'pulseBothChi', label: localizeMixedText('Both Chi 双尺脉'), options: TCM_OPTIONS.pulse },
      { field: 'pathologicalChannel', label: localizeMixedText('Pathological Channel 病变经络'), options: TCM_OPTIONS.pathologicalChannel },
    ],
    textareas: [
      { field: 'otherTongue', label: t('publicIntake.sections.otherTongueLabel'), placeholder: t('publicIntake.sections.otherTonguePlaceholder') },
      { field: 'detailedPulse', label: t('publicIntake.sections.detailedPulseLabel'), placeholder: t('publicIntake.sections.detailedPulsePlaceholder') },
      { field: 'pathologicalChanges', label: t('publicIntake.sections.pathologicalChangesLabel'), placeholder: t('publicIntake.sections.pathologicalChangesPlaceholder') },
    ],
  },
])

const durationOptions = TCM_OPTIONS.chiefComplaintDuration

const scopeLabel = computed(() => {
  if (!appointmentInfo.value) return ''
  if (appointmentInfo.value.scope === 'appointment' && appointmentInfo.value.startTime) {
    return t('publicIntake.appointmentTime', { time: formatPublicDateTime(appointmentInfo.value.startTime) })
  }
  return t('publicIntake.intakeType')
})

onMounted(async () => {
  try {
    const info = await intakePublicApi.getInfo(token)
    appointmentInfo.value = info
    if (info.intakeSubmitted) {
      submitted.value = true
    }
  } catch (e) {
    error.value = e.message || t('publicIntake.loadFailed')
  } finally {
    loading.value = false
  }
})

function isSelected(field, option) {
  return Array.isArray(form.value.diff[field]) && form.value.diff[field].includes(option)
}

function toggleOption(field, option) {
  const current = Array.isArray(form.value.diff[field]) ? [...form.value.diff[field]] : []
  const index = current.indexOf(option)
  if (index >= 0) {
    current.splice(index, 1)
  } else {
    current.push(option)
  }
  form.value.diff[field] = current
}

async function handleSubmit() {
  if (!form.value.chiefComplaint.trim()) {
    error.value = t('publicIntake.chiefComplaintRequired')
    return
  }
  submitting.value = true
  error.value = ''
  try {
    await intakePublicApi.submit(token, form.value)
    submitted.value = true
  } catch (e) {
    error.value = e.message || t('publicIntake.submitFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="intake-page">
    <div class="intake-card">
      <div class="intake-header">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="#fff" stroke-width="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <line x1="9" y1="12" x2="15" y2="12"/>
            <line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
        </div>
        <h1>{{ t('publicIntake.pageTitle') }}</h1>
        <p class="subtitle">{{ t('publicIntake.pageSubtitle') }}</p>
      </div>

      <div v-if="loading" class="intake-status">
        <div class="spinner"></div>
        <p>{{ t('publicIntake.loading') }}</p>
      </div>

      <div v-else-if="error && !appointmentInfo" class="intake-status error">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#d64545" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <h2>{{ t('publicIntake.invalidRequest') }}</h2>
        <p>{{ error }}</p>
      </div>

      <div v-else-if="submitted" class="intake-status success">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#2d6a4f" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <h2>{{ t('publicIntake.submittedTitle') }}</h2>
        <p>{{ t('publicIntake.submittedDesc1') }}</p>
        <p>{{ t('publicIntake.submittedDesc2') }}</p>
      </div>

      <div v-else class="intake-form">
        <div class="appt-info" v-if="appointmentInfo">
          <span>{{ t('publicIntake.patientLabel') }}<strong>{{ appointmentInfo.patientName }}</strong></span>
          <span>{{ scopeLabel }}</span>
        </div>

        <div v-if="error" class="form-error">{{ error }}</div>

        <section class="hero-section">
          <div class="hero-copy">
            <h2>{{ t('publicIntake.overviewTitle') }}</h2>
            <p>{{ t('publicIntake.overviewDesc') }}</p>
          </div>
          <div class="hero-badge">{{ t('publicIntake.heroBadge') }}</div>
        </section>

        <div class="form-card">
          <div class="field-block full">
            <label>{{ t('publicIntake.chiefComplaintLabel') }}</label>
            <input v-model="form.chiefComplaint" type="text" :placeholder="t('publicIntake.chiefComplaintPlaceholder')" class="form-input" />
          </div>

          <div class="field-block full">
            <label>{{ t('publicIntake.durationLabel') }}</label>
            <div class="duration-grid">
              <label
                v-for="option in durationOptions"
                :key="option"
                class="duration-option"
                :class="{ active: form.chiefComplaintDuration === option }"
              >
                <input v-model="form.chiefComplaintDuration" type="radio" :value="option" />
                <span>{{ localizeMixedText(option) }}</span>
              </label>
            </div>
          </div>

          <div class="field-block full">
            <label>{{ t('publicIntake.descriptionLabel') }}</label>
            <textarea
              v-model="form.chiefComplaintDescription"
              rows="4"
              :placeholder="t('publicIntake.descriptionPlaceholder')"
              class="form-textarea"
            ></textarea>
          </div>

          <div class="field-block full">
            <label>{{ t('publicIntake.progressLabel') }}</label>
            <textarea
              v-model="form.progressOfDisease"
              rows="4"
              :placeholder="t('publicIntake.progressPlaceholder')"
              class="form-textarea"
            ></textarea>
          </div>
        </div>

        <details
          v-for="section in symptomSections"
          :key="section.key"
          class="symptom-section"
          :open="section.open"
        >
          <summary>
            <span>{{ section.title }}</span>
            <span class="summary-hint">{{ t('publicIntake.expandHint') }}</span>
          </summary>

          <div class="section-content">
            <div
              v-for="group in section.groups || []"
              :key="group.field"
              class="field-block full"
            >
              <label>{{ group.label }}</label>
              <div class="choice-grid">
                <button
                  v-for="option in group.options"
                  :key="option"
                  type="button"
                  class="choice-chip"
                  :class="{ active: isSelected(group.field, option) }"
                  @click="toggleOption(group.field, option)"
                >
                  {{ localizeMixedText(option) }}
                </button>
              </div>
            </div>

            <div
              v-for="input in section.inputs || []"
              :key="input.field"
              class="field-block"
            >
              <label>{{ input.label }}</label>
              <input
                v-model.number="form.diff[input.field]"
                type="number"
                class="form-input"
                :min="input.min"
                :max="input.max"
                :step="input.step"
              />
            </div>

            <div
              v-for="area in section.textareas || []"
              :key="area.field"
              class="field-block full"
            >
              <label>{{ area.label }}</label>
              <textarea
                v-model="form.diff[area.field]"
                rows="3"
                class="form-textarea"
                :placeholder="area.placeholder"
              ></textarea>
            </div>
          </div>
        </details>

        <section class="history-section">
          <h2>{{ t('publicIntake.historyTitle') }}</h2>
          <div class="history-grid">
            <div
              v-for="field in visitSummaryFields"
              :key="field.key"
              class="field-block"
              :class="{ full: field.type === 'textarea' }"
            >
              <label>{{ field.label }}</label>
              <input
                v-if="field.type === 'text'"
                v-model="form[field.key]"
                type="text"
                class="form-input"
                :placeholder="field.placeholder"
              />
              <textarea
                v-else
                v-model="form[field.key]"
                class="form-textarea"
                :rows="field.rows"
                :placeholder="field.placeholder"
              ></textarea>
            </div>
          </div>
        </section>

        <button class="submit-button" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? t('publicIntake.submitting') : t('publicIntake.submit') }}
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
    radial-gradient(circle at top left, rgba(202, 228, 214, 0.85), transparent 32%),
    radial-gradient(circle at top right, rgba(245, 220, 194, 0.8), transparent 28%),
    linear-gradient(180deg, #f4efe7 0%, #eef4f0 42%, #f8faf8 100%);
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
  color: #24352b;
}

.intake-card {
  max-width: 980px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(113, 142, 119, 0.16);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 18px 60px rgba(50, 74, 58, 0.12);
  backdrop-filter: blur(10px);
}

.intake-header {
  padding: 34px 32px 28px;
  color: #fff;
  text-align: center;
  background:
    linear-gradient(135deg, rgba(44, 78, 63, 0.96) 0%, rgba(87, 121, 94, 0.94) 58%, rgba(177, 116, 66, 0.92) 100%);
}

.logo-icon {
  width: 68px;
  height: 68px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.intake-header h1 {
  margin: 14px 0 6px;
  font-size: 28px;
  letter-spacing: 1px;
}

.subtitle {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.08em;
  opacity: 0.86;
  text-transform: uppercase;
}

.intake-form {
  padding: 24px 28px 32px;
}

.intake-status {
  padding: 56px 28px;
  text-align: center;
}

.intake-status h2 {
  margin: 16px 0 10px;
}

.intake-status p {
  margin: 5px 0;
  color: #5c6f63;
}

.intake-status.error h2,
.intake-status.error p,
.form-error {
  color: #c54242;
}

.intake-status.success h2 {
  color: #2d6a4f;
}

.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 18px;
  border-radius: 50%;
  border: 3px solid rgba(76, 120, 94, 0.16);
  border-top-color: #4e7a60;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.appt-info {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(236, 243, 237, 0.95), rgba(247, 241, 233, 0.92));
  border: 1px solid rgba(116, 144, 122, 0.18);
  font-size: 14px;
  color: #4d6555;
}

.form-error {
  margin-bottom: 18px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(248, 224, 224, 0.95);
  border: 1px solid rgba(214, 102, 102, 0.18);
}

.hero-section {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 18px;
  padding: 18px 20px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(247, 243, 235, 0.95), rgba(239, 247, 241, 0.94));
  border: 1px solid rgba(122, 148, 128, 0.16);
}

.hero-copy h2,
.history-section h2 {
  margin: 0 0 8px;
  font-size: 18px;
}

.hero-copy p {
  margin: 0;
  color: #567060;
  line-height: 1.6;
}

.hero-badge {
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 999px;
  background: #fff;
  color: #7a5f3d;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid rgba(180, 133, 84, 0.18);
}

.form-card,
.history-section {
  margin-bottom: 18px;
  padding: 18px;
  border-radius: 20px;
  background: #fff;
  border: 1px solid rgba(121, 145, 128, 0.14);
}

.history-grid,
.section-content,
.form-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-block.full {
  grid-column: 1 / -1;
}

.field-block label {
  font-size: 14px;
  font-weight: 600;
  color: #30473a;
}

.form-input,
.form-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid #d9e4db;
  background: #fbfcfb;
  color: #24352b;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  font-family: inherit;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #7ba184;
  box-shadow: 0 0 0 3px rgba(113, 154, 128, 0.14);
  background: #fff;
}

.form-textarea {
  resize: vertical;
}

.duration-grid,
.choice-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.duration-option {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid #d7e0d6;
  background: #f9fbf9;
  transition: all 0.2s;
  color: #53685b;
  font-size: 13px;
}

.duration-option.active {
  border-color: #6d8d76;
  background: #edf5ef;
  color: #30503d;
  font-weight: 600;
}

.duration-option input {
  display: none;
}

.symptom-section {
  margin-bottom: 16px;
  border-radius: 20px;
  border: 1px solid rgba(119, 146, 127, 0.14);
  background: rgba(255, 255, 255, 0.94);
  overflow: hidden;
}

.symptom-section summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  cursor: pointer;
  list-style: none;
  font-weight: 700;
  color: #2d4437;
  background: linear-gradient(135deg, rgba(244, 248, 244, 0.98), rgba(249, 245, 238, 0.94));
}

.symptom-section summary::-webkit-details-marker {
  display: none;
}

.summary-hint {
  color: #7d9185;
  font-size: 12px;
  font-weight: 500;
}

.section-content {
  padding: 18px;
}

.choice-chip {
  border: 1px solid #d5dfd5;
  background: #f9fbf8;
  color: #40594a;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.35;
  cursor: pointer;
  transition: all 0.18s ease;
}

.choice-chip:hover {
  border-color: #9ab39f;
  background: #f2f7f3;
}

.choice-chip.active {
  border-color: #4d7558;
  background: linear-gradient(135deg, #5f896a, #6f9878);
  color: #fff;
  box-shadow: 0 8px 18px rgba(84, 122, 94, 0.2);
}

.submit-button {
  width: 100%;
  margin-top: 8px;
  padding: 15px 18px;
  border: none;
  border-radius: 16px;
  background: linear-gradient(135deg, #3f6a4e, #7b5e3b);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  box-shadow: 0 16px 26px rgba(82, 97, 69, 0.18);
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.submit-button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
  transform: none;
}

@media (max-width: 768px) {
  .intake-page {
    padding: 14px;
  }

  .intake-header {
    padding: 28px 20px 24px;
  }

  .intake-header h1 {
    font-size: 24px;
  }

  .intake-form {
    padding: 18px 16px 24px;
  }

  .hero-section,
  .appt-info,
  .history-grid,
  .section-content,
  .form-card {
    grid-template-columns: 1fr;
    display: grid;
  }

  .hero-section {
    gap: 12px;
  }

  .hero-badge {
    width: fit-content;
  }

  .symptom-section summary {
    padding: 16px;
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
