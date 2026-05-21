import { ref } from 'vue'
import { emailLogsApi } from './api'
import { readStoredJson, writeStoredJson } from './storage'
import { useSettingsStore } from '../stores/settings'
import { buildTemplatedEmail } from './emailTemplates'

const EMAIL_LOG_KEY = 'tcm_email_log'
const DEFAULT_CLINIC_NAME = 'TCM Clinic'

function loadEmailLog() {
  return readStoredJson(EMAIL_LOG_KEY, []) || []
}

function saveEmailLog(log) {
  writeStoredJson(EMAIL_LOG_KEY, log)
}

function resolveClinicName(clinicName) {
  return clinicName || DEFAULT_CLINIC_NAME
}

function resolvePatientEmail(patient) {
  return patient?.emails?.[0] || patient?.email || ''
}

function resolvePatientName(patient) {
  return patient?.name || 'Patient'
}

function formatDate(value) {
  return value ? String(value).split('T')[0] : ''
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}

function formatCurrency(value, currency = 'CAD') {
  const code = String(currency || 'CAD').toUpperCase()
  return `${code} ${formatMoney(value)}`
}

function toAbsoluteUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^(https?:|mailto:|tel:)/i.test(text)) return text
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : ''
  if (!origin) return text
  return text.startsWith('/') ? `${origin}${text}` : `${origin}/${text}`
}

function getCommonVariables({ patient, clinicName, clinicAddress, appointment, consultation, practitioner, serviceLabel, links = {} } = {}) {
  const start = appointment?.startTime || ''
  const [appointmentDate, appointmentTime = ''] = String(start).split(/[T ]/)
  const currency = consultation?.currency || 'CAD'
  const amount = consultation
    ? formatCurrency(consultation?.totalAmount ?? consultation?.outstandingAmount ?? 0, currency)
    : ''
  return {
    clinicName: resolveClinicName(clinicName || practitioner?.clinicName),
    clinicAddress: clinicAddress || '',
    patientName: resolvePatientName(patient),
    patientEmail: resolvePatientEmail(patient),
    practitionerName: practitioner?.name || practitioner?.nickName || '',
    serviceLabel: serviceLabel || appointment?.serviceLabel || appointment?.serviceType || '',
    appointmentDate: appointmentDate || formatDate(start),
    appointmentTime,
    appointmentStartTime: start,
    appointmentEndTime: appointment?.endTime || '',
    consultationId: consultation?.consultationId || consultation?.id || '',
    consultationDate: consultation?.date || '',
    chiefComplaint: consultation?.chiefComplaint || '',
    amount,
    totalAmount: amount,
    taxAmount: consultation ? formatCurrency(consultation?.taxAmount, currency) : '',
    consentLink: toAbsoluteUrl(links.consentLink),
    intakeLink: toAbsoluteUrl(links.intakeLink),
    reportLink: toAbsoluteUrl(links.reportLink || consultation?.reportPdfUrl || consultation?.reportUrl || ''),
    invoiceLink: toAbsoluteUrl(links.invoiceLink || consultation?.invoicePdfUrl || consultation?.invoiceUrl || ''),
    cancelLink: toAbsoluteUrl(links.cancelLink || links.manageLink || ''),
    manageLink: toAbsoluteUrl(links.manageLink || ''),
  }
}

export function useEmailSimulator() {
  const settingsStore = useSettingsStore()
  const showEmailDialog = ref(false)
  const emailData = ref({
    to: '',
    subject: '',
    body: '',
    type: '',
  })
  const emailLog = ref(loadEmailLog())

  function openEmailPreview(email) {
    emailData.value = { ...email }
    showEmailDialog.value = true
  }

  function sendEmail() {
    const entry = {
      id: `email-${Date.now()}`,
      ...emailData.value,
      sentAt: new Date().toISOString(),
    }
    emailLog.value.unshift(entry)
    if (emailLog.value.length > 100) {
      emailLog.value = emailLog.value.slice(0, 100)
    }
    saveEmailLog(emailLog.value)
    void emailLogsApi.create({
      ...entry,
      templateBody: entry.templateKey ? entry.body : undefined,
      variables: entry.variables,
    }).catch(() => {})
    showEmailDialog.value = false
    return entry
  }

  function sendEmailContent(email) {
    emailData.value = { ...email }
    return sendEmail()
  }

  async function getEmailLog() {
    try {
      emailLog.value = await emailLogsApi.list()
      saveEmailLog(emailLog.value)
      return emailLog.value
    } catch {
      emailLog.value = loadEmailLog()
      return emailLog.value
    }
  }

  function buildTemplateEmail(templateKey, type, to, variables) {
    return buildTemplatedEmail({
      to,
      type,
      templateKey,
      templates: settingsStore.emailTemplates,
      variables,
    })
  }

  function buildAppointmentConfirmEmail(patient, appointment, practitioner, serviceLabel) {
    const clinic = resolveClinicName(practitioner?.clinicName || settingsStore.clinicName)
    return buildTemplateEmail(
      'appointmentConfirmation',
      'appointment_confirm',
      resolvePatientEmail(patient),
      getCommonVariables({
        patient,
        appointment,
        practitioner,
        serviceLabel,
        clinicName: clinic,
        clinicAddress: settingsStore.clinicAddress,
      }),
    )
  }

  function buildAppointmentCancelEmail(patient, appointment, practitioner, serviceLabel) {
    const clinic = resolveClinicName(practitioner?.clinicName || settingsStore.clinicName)
    return buildTemplateEmail(
      'appointmentCancellation',
      'appointment_cancel',
      resolvePatientEmail(patient),
      getCommonVariables({
        patient,
        appointment,
        practitioner,
        serviceLabel,
        clinicName: clinic,
        clinicAddress: settingsStore.clinicAddress,
      }),
    )
  }

  function buildAppointmentReminderEmail(patient, appointment, practitioner, serviceLabel) {
    const clinic = resolveClinicName(practitioner?.clinicName || settingsStore.clinicName)
    return buildTemplateEmail(
      'reminder',
      'appointment_reminder',
      resolvePatientEmail(patient),
      getCommonVariables({
        patient,
        appointment,
        practitioner,
        serviceLabel,
        clinicName: clinic,
        clinicAddress: settingsStore.clinicAddress,
      }),
    )
  }

  function buildInvoiceEmail(patient, consultation, clinicName) {
    const clinic = resolveClinicName(clinicName)
    return buildTemplateEmail(
      'invoice',
      'invoice',
      resolvePatientEmail(patient),
      getCommonVariables({ patient, consultation, clinicName: clinic, clinicAddress: settingsStore.clinicAddress }),
    )
  }

  function buildConsultationReportEmail(patient, consultation, clinicName) {
    const clinic = resolveClinicName(clinicName)
    return buildTemplateEmail(
      'consultationRecord',
      'consultation_report',
      resolvePatientEmail(patient),
      getCommonVariables({ patient, consultation, clinicName: clinic, clinicAddress: settingsStore.clinicAddress }),
    )
  }

  function buildIntakeFormEmail(patient, appointment, token, clinicName) {
    const clinic = resolveClinicName(clinicName)
    const link = `${window.location.origin}/intake/${token}`
    return buildTemplateEmail(
      'intake',
      'intake_form',
      resolvePatientEmail(patient),
      getCommonVariables({
        patient,
        appointment,
        clinicName: clinic,
        clinicAddress: settingsStore.clinicAddress,
        links: { intakeLink: link },
      }),
    )
  }

  function buildConsentEmail(patient, token, clinicName) {
    const clinic = resolveClinicName(clinicName)
    const link = `${window.location.origin}/consent/${token}`
    return buildTemplateEmail(
      'consent',
      'consent',
      resolvePatientEmail(patient),
      getCommonVariables({
        patient,
        clinicName: clinic,
        clinicAddress: settingsStore.clinicAddress,
        links: { consentLink: link },
      }),
    )
  }

  return {
    showEmailDialog,
    emailData,
    emailLog,
    openEmailPreview,
    sendEmail,
    sendEmailContent,
    getEmailLog,
    buildAppointmentConfirmEmail,
    buildAppointmentCancelEmail,
    buildAppointmentReminderEmail,
    buildInvoiceEmail,
    buildConsultationReportEmail,
    buildIntakeFormEmail,
    buildConsentEmail,
  }
}
