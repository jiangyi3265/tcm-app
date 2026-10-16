<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { smtpSettingsApi } from '../utils/api'

const { t, te } = useI18n()
const form = reactive({ host: 'smtp.resend.com', port: 465, username: 'resend', password: '', fromAddress: '', security: 'ssl' })
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const loaded = ref(false)
const configured = ref(false)
const source = ref('environment')
const savedFields = ref('')
const feedback = ref(null)
const fields = () => ({ host: form.host, port: form.port, username: form.username, fromAddress: form.fromAddress, security: form.security })
const dirty = computed(() => !!form.password || JSON.stringify(fields()) !== savedFields.value)
const busy = computed(() => loading.value || saving.value || testing.value)
const errorText = error => {
  const key = `smtpSettings.errors.${error?.message || error}`
  return te(key) ? t(key) : t('smtpSettings.failed')
}
function acceptStatus(data) {
  for (const key of Object.keys(fields())) if (data[key] !== undefined) form[key] = data[key]
  form.password = ''
  configured.value = !!data.passwordConfigured
  source.value = data.source || 'environment'
  savedFields.value = JSON.stringify(fields())
  loaded.value = true
}
async function load() {
  loading.value = true
  feedback.value = null
  try { acceptStatus(await smtpSettingsApi.get()) }
  catch (error) { feedback.value = { type: 'error', text: errorText(error) } }
  finally { loading.value = false }
}
async function save() {
  saving.value = true
  feedback.value = null
  try {
    acceptStatus(await smtpSettingsApi.update({ ...fields(), password: form.password }))
    feedback.value = { type: 'success', text: t('smtpSettings.saved') }
  } catch (error) { feedback.value = { type: 'error', text: errorText(error) } }
  finally { saving.value = false }
}
async function testConnection() {
  testing.value = true
  feedback.value = null
  try {
    const result = await smtpSettingsApi.test()
    feedback.value = result.success
      ? { type: 'success', text: t('smtpSettings.connected') }
      : { type: 'error', text: errorText(result.code) }
  } catch (error) { feedback.value = { type: 'error', text: errorText(error) } }
  finally { testing.value = false }
}
function useResend() { Object.assign(form, { host: 'smtp.resend.com', port: 465, username: 'resend', security: 'ssl' }) }
watch(form, () => { feedback.value = null }, { flush: 'sync' })
onMounted(load)
</script>

<template>
  <section class="smtp-settings" aria-labelledby="smtp-settings-title">
    <div class="smtp-heading">
      <h4 id="smtp-settings-title">{{ t('smtpSettings.title') }}</h4>
      <el-tag v-if="loaded" :type="configured ? 'success' : 'info'" effect="plain">{{ t(configured ? 'smtpSettings.configured' : 'smtpSettings.notConfigured') }}</el-tag>
    </div>
    <p class="settings-help">{{ t('smtpSettings.description') }}</p>
    <p v-if="loaded" class="settings-help">{{ t(source === 'admin' ? 'smtpSettings.adminSource' : 'smtpSettings.environmentSource') }}</p>
    <el-skeleton v-if="loading" :rows="4" animated />
    <el-form v-else-if="loaded" :model="form" label-position="top" @submit.prevent="save">
      <div class="smtp-fields">
        <el-form-item :label="t('smtpSettings.host')" for="smtp-host">
          <el-input id="smtp-host" v-model="form.host" :disabled="busy" maxlength="253" autocomplete="off" />
        </el-form-item>
        <el-form-item :label="t('smtpSettings.port')" for="smtp-port">
          <el-input-number id="smtp-port" v-model="form.port" :disabled="busy" :min="1" :max="65535" :precision="0" :controls="false" />
        </el-form-item>
        <el-form-item :label="t('smtpSettings.security')" for="smtp-security">
          <el-select id="smtp-security" v-model="form.security" :disabled="busy">
            <el-option value="ssl" label="SSL/TLS (465)" />
            <el-option value="starttls" label="STARTTLS (587)" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('smtpSettings.username')" for="smtp-username">
          <el-input id="smtp-username" v-model="form.username" :disabled="busy" maxlength="254" autocomplete="off" />
        </el-form-item>
      </div>
      <el-form-item :label="t('smtpSettings.password')" for="smtp-password">
        <el-input id="smtp-password" v-model="form.password" type="password" show-password :disabled="busy" maxlength="512" autocomplete="new-password" :placeholder="t(configured ? 'smtpSettings.keepPassword' : 'smtpSettings.enterPassword')" />
        <span class="smtp-hint">{{ t('smtpSettings.keyHelp') }} <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer">{{ t('smtpSettings.manageKeys') }}</a></span>
      </el-form-item>
      <el-form-item :label="t('smtpSettings.from')" for="smtp-from">
        <el-input id="smtp-from" v-model="form.fromAddress" :disabled="busy" maxlength="320" placeholder="Clinic &lt;booking@your-domain.com&gt;" autocomplete="off" />
        <span class="smtp-hint">{{ t('smtpSettings.fromHelp') }}</span>
      </el-form-item>
      <div class="smtp-actions">
        <el-button type="primary" :disabled="busy || !dirty" :loading="saving" @click="save">{{ t('smtpSettings.save') }}</el-button>
        <el-button :disabled="busy || dirty || !configured" :loading="testing" @click="testConnection">{{ t('smtpSettings.test') }}</el-button>
        <el-button text :disabled="busy" @click="useResend">{{ t('smtpSettings.resendPreset') }}</el-button>
      </div>
      <p class="smtp-hint">{{ t(dirty ? 'smtpSettings.saveBeforeTest' : 'smtpSettings.testHelp') }}</p>
    </el-form>
    <el-alert v-if="feedback" :title="feedback.text" :type="feedback.type" :closable="false" show-icon role="status" />
    <el-button v-if="!loading && !loaded" @click="load">{{ t('smtpSettings.retry') }}</el-button>
  </section>
</template>

<style scoped>
.smtp-settings { max-width: 720px; margin-block: 24px; }
.smtp-heading { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.smtp-heading h4 { margin: 0; }
.settings-help, .smtp-hint { color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.6; }
.smtp-hint { display: block; margin-top: 6px; }
.smtp-hint a { color: var(--el-color-primary); }
.smtp-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 20px; }
.smtp-fields :deep(.el-input-number), .smtp-fields :deep(.el-select) { width: 100%; }
.smtp-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.smtp-actions :deep(.el-button + .el-button) { margin-left: 0; }
.smtp-settings :deep(.el-alert) { margin-top: 14px; }
@media (max-width: 600px) {
  .smtp-fields { grid-template-columns: minmax(0, 1fr); }
  .smtp-settings :deep(input) { font-size: 16px; }
}
</style>
