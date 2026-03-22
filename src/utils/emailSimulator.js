import { ref } from 'vue'
import { emailLogsApi } from './api'
import { readStoredJson, writeStoredJson } from './storage'

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

export function useEmailSimulator() {
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
    void emailLogsApi.create(entry).catch(() => {})
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
    return {
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
  }

  function buildInvoiceEmail(patient, consultation, clinicName) {
    const clinic = resolveClinicName(clinicName)
    return {
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
  }

  function buildConsultationReportEmail(patient, consultation, clinicName) {
    const clinic = resolveClinicName(clinicName)
    return {
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
  }

  function buildIntakeFormEmail(patient, appointment, token, clinicName) {
    const clinic = resolveClinicName(clinicName)
    const link = `${window.location.origin}/intake/${token}`
    return {
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
  }

  function buildConsentEmail(patient, token, clinicName) {
    const clinic = resolveClinicName(clinicName)
    const link = `${window.location.origin}/consent/${token}`
    return {
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