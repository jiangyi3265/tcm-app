import { ref } from 'vue'
import { emailLogsApi } from './api'
import { readStoredJson, writeStoredJson } from './storage'
import { useSettingsStore } from '../stores/settings'

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

function renderTemplate(text = '', variables = {}) {
  return String(text || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const value = variables[String(key).trim()]
    return value === undefined || value === null ? '' : String(value)
  })
}

function getTemplate(templates, key) {
  return templates?.[key] || null
}

function applyTemplate(fallback, templates, key, variables = {}) {
  const template = getTemplate(templates, key)
  if (!template) return fallback
  return {
    ...fallback,
    subject: template.subject ? renderTemplate(template.subject, variables) : fallback.subject,
    body: template.body ? renderTemplate(template.body, variables) : fallback.body,
    templateKey: key,
    variables,
  }
}

function getCommonVariables({ patient, clinicName, appointment, consultation, practitioner, serviceLabel, links = {} } = {}) {
  const start = appointment?.startTime || ''
  const [appointmentDate, appointmentTime = ''] = String(start).split(/[T ]/)
  const amount = consultation
    ? formatMoney(consultation?.totalAmount ?? consultation?.outstandingAmount ?? 0)
    : ''
  return {
    clinicName: resolveClinicName(clinicName || practitioner?.clinicName),
    clinicAddress: '',
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
    taxAmount: consultation ? formatMoney(consultation?.taxAmount) : '',
    consentLink: links.consentLink || '',
    intakeLink: links.intakeLink || '',
    cancelLink: links.cancelLink || links.manageLink || '',
    manageLink: links.manageLink || '',
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

  function openEmailPreview({ to, subject, body, type }) {
    emailData.value = { to, subject, body, type }
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

  function buildAppointmentConfirmEmail(patient, appointment, practitioner, serviceLabel) {
    const clinic = resolveClinicName(practitioner?.clinicName)
    const roomLine = appointment?.roomId ? `Room: ${appointment.roomId}\n` : ''
    const fallback = {
      to: resolvePatientEmail(patient),
      subject: `Appointment Confirmation - ${serviceLabel || 'Consultation'} (${formatDate(appointment?.startTime)})`,
      body:
        `Dear ${resolvePatientName(patient)},\n\n`
        + `Your appointment has been scheduled successfully.\n\n`
        + `Service: ${serviceLabel || 'Consultation'}\n`
        + `Practitioner: ${practitioner?.name || '-'}\n`
        + `Time: ${appointment?.startTime || ''}\n`
        + roomLine
        + `\nIf you need to make changes, please contact ${clinic}.`,
      type: 'appointment_confirm',
    }
    return applyTemplate(
      fallback,
      settingsStore.emailTemplates,
      'appointmentConfirmation',
      getCommonVariables({ patient, appointment, practitioner, serviceLabel, clinicName: clinic }),
    )
  }

  function buildInvoiceEmail(patient, consultation, clinicName) {
    const clinic = resolveClinicName(clinicName)
    const fallback = {
      to: resolvePatientEmail(patient),
      subject: `Invoice - ${consultation?.consultationId || ''} (${formatMoney(consultation?.totalAmount)})`,
      body:
        `Dear ${resolvePatientName(patient)},\n\n`
        + `Please find your invoice summary below.\n\n`
        + `Consultation ID: ${consultation?.consultationId || '-'}\n`
        + `Date: ${consultation?.date || ''}\n`
        + `Total Amount: ${formatMoney(consultation?.totalAmount)}\n`
        + `Tax Amount: ${formatMoney(consultation?.taxAmount)}\n`
        + `\nThank you for visiting ${clinic}.`,
      type: 'invoice',
    }
    return applyTemplate(
      fallback,
      settingsStore.emailTemplates,
      'invoice',
      getCommonVariables({ patient, consultation, clinicName: clinic }),
    )
  }

  function buildConsultationReportEmail(patient, consultation, clinicName) {
    const clinic = resolveClinicName(clinicName)
    const fallback = {
      to: resolvePatientEmail(patient),
      subject: `Consultation Report - ${consultation?.consultationId || ''} (${consultation?.date || ''})`,
      body:
        `Dear ${resolvePatientName(patient)},\n\n`
        + `Your consultation report is ready.\n\n`
        + `Consultation ID: ${consultation?.consultationId || '-'}\n`
        + `Date: ${consultation?.date || ''}\n`
        + `Chief Complaint: ${consultation?.chiefComplaint || '-'}\n`
        + `\nPlease bring this report to your next visit if needed.\n\n`
        + `${clinic}`,
      type: 'consultation_report',
    }
    return applyTemplate(
      fallback,
      settingsStore.emailTemplates,
      'consultationRecord',
      getCommonVariables({ patient, consultation, clinicName: clinic }),
    )
  }

  function buildIntakeFormEmail(patient, appointment, token, clinicName) {
    const clinic = resolveClinicName(clinicName)
    const link = `${window.location.origin}/intake/${token}`
    const fallback = {
      to: resolvePatientEmail(patient),
      subject: `Intake Form - ${formatDate(appointment?.startTime)} - ${clinic}`,
      body:
        `Dear ${resolvePatientName(patient)},\n\n`
        + `Please complete your intake form before the appointment.\n\n`
        + `Intake Form Link: ${link}\n\n`
        + `Appointment Time: ${appointment?.startTime || ''}\n`
        + `\nThank you,\n${clinic}`,
      type: 'intake_form',
    }
    return applyTemplate(
      fallback,
      settingsStore.emailTemplates,
      'intake',
      getCommonVariables({ patient, appointment, clinicName: clinic, links: { intakeLink: link } }),
    )
  }

  function buildConsentEmail(patient, token, clinicName) {
    const clinic = resolveClinicName(clinicName)
    const link = `${window.location.origin}/consent/${token}`
    const fallback = {
      to: resolvePatientEmail(patient),
      subject: `Consent Form Signature - ${clinic}`,
      body:
        `Dear ${resolvePatientName(patient)},\n\n`
        + `Thank you for choosing ${clinic}. Before your first visit, please sign the electronic consent form using the link below.\n\n`
        + `Consent Form Link: ${link}\n\n`
        + `If you have any questions, please contact us.\n\n`
        + `${clinic}`,
      type: 'consent',
    }
    return applyTemplate(
      fallback,
      settingsStore.emailTemplates,
      'consent',
      getCommonVariables({ patient, clinicName: clinic, links: { consentLink: link } }),
    )
  }

  return {
    showEmailDialog,
    emailData,
    emailLog,
    openEmailPreview,
    sendEmail,
    getEmailLog,
    buildAppointmentConfirmEmail,
    buildInvoiceEmail,
    buildConsultationReportEmail,
    buildIntakeFormEmail,
    buildConsentEmail,
  }
}
