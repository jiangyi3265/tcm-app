import { ref } from 'vue'
import { emailLogsApi } from './api'
import { readStoredJson, writeStoredJson } from './storage'
import { useSettingsStore } from '../stores/settings'
import { buildTemplatedEmail } from './emailTemplates'
import { formatPatientFirstName } from './patientName'
import { resolveClinicName } from './clinicName'

const EMAIL_LOG_KEY = 'tcm_email_log'

function loadEmailLog() {
  return readStoredJson(EMAIL_LOG_KEY, []) || []
}

function saveEmailLog(log) {
  writeStoredJson(EMAIL_LOG_KEY, log)
}

function resolvePatientEmail(patient) {
  return patient?.emails?.[0] || patient?.email || ''
}

function resolvePatientName(patient) {
  return formatPatientFirstName(patient, 'Patient')
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

function resolveServicePrice({ appointment, consultation, currency = 'CAD', settingsStore } = {}) {
  const appointmentPrice = appointment?.servicePrice
    ?? appointment?.price
    ?? appointment?.defaultPrice
    ?? appointment?.serviceDefaultPrice
  if (appointmentPrice !== undefined && appointmentPrice !== null && appointmentPrice !== '') {
    return formatCurrency(appointmentPrice, appointment?.currency || currency)
  }

  const serviceKey = appointment?.serviceType || appointment?.serviceKey
  const service = serviceKey ? settingsStore?.serviceTypes?.[serviceKey] : null
  if (service?.defaultPrice !== undefined && service?.defaultPrice !== null && service.defaultPrice !== '') {
    return formatCurrency(service.defaultPrice, settingsStore?.currency || currency)
  }

  const consultationTotal = consultation?.totalAmount ?? consultation?.outstandingAmount
  if (consultationTotal !== undefined && consultationTotal !== null && consultationTotal !== '') {
    return formatCurrency(consultationTotal, consultation?.currency || currency)
  }
  return ''
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

function safeFileToken(value) {
  return String(value || 'consultation')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'consultation'
}

function buildInvoicePdfAttachment(consultation, pdfResult = {}) {
  const resource = pdfResult?.resource
    || pdfResult?.filePath
    || consultation?.invoicePdfPath
    || consultation?.invoicePath
    || ''
  if (!resource) return null
  const consultationNo = consultation?.consultationId || consultation?.id
  return {
    resource,
    fileName: `invoice-${safeFileToken(consultationNo)}.pdf`,
    contentType: 'application/pdf',
  }
}

function buildReportPdfAttachment(consultation, pdfResult = {}) {
  const resource = pdfResult?.resource
    || pdfResult?.filePath
    || consultation?.reportPdfPath
    || consultation?.consultationPdfPath
    || consultation?.reportPath
    || ''
  if (!resource) return null
  const consultationNo = consultation?.consultationId || consultation?.id
  return {
    resource,
    fileName: `consultation-report-${safeFileToken(consultationNo)}.pdf`,
    contentType: 'application/pdf',
  }
}

function getCommonVariables({ patient, clinicName, clinicAddress, appointment, consultation, practitioner, serviceLabel, links = {}, settingsStore: providedSettingsStore } = {}) {
  const templateSettingsStore = providedSettingsStore || useSettingsStore()
  const start = appointment?.startTime || consultation?.appointmentStartTime || consultation?.startTime || ''
  const [appointmentDate, appointmentTime = ''] = String(start).split(/[T ]/)
  const fallbackAppointmentDate = consultation?.appointmentDate || consultation?.date || consultation?.consultDate || consultation?.consultationDate || ''
  const currency = consultation?.currency || 'CAD'
  const amount = consultation
    ? formatCurrency(consultation?.totalAmount ?? consultation?.outstandingAmount ?? 0, currency)
    : ''
  return {
    clinicName: resolveClinicName(clinicName || practitioner?.clinicName),
    clinicAddress: clinicAddress || '',
    patientId: patient?.id || '',
    patientName: resolvePatientName(patient),
    patientEmail: resolvePatientEmail(patient),
    practitionerName: practitioner?.name || practitioner?.nickName || '',
    serviceLabel: serviceLabel || appointment?.serviceLabel || appointment?.serviceType || '',
    servicePrice: resolveServicePrice({ appointment, consultation, currency, settingsStore: templateSettingsStore }),
    appointmentDate: appointmentDate || formatDate(start) || formatDate(fallbackAppointmentDate),
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

  async function sendEmail() {
    const entry = {
      id: `email-${Date.now()}`,
      ...emailData.value,
      sentAt: new Date().toISOString(),
    }
    const response = await emailLogsApi.create({
      ...entry,
      templateBody: entry.templateKey ? entry.body : undefined,
      variables: entry.variables,
      attachments: entry.attachments,
      useTemplate: entry.useTemplate,
    })
    if (response?.success === false) {
      throw new Error('邮件未发送，请检查 SMTP 设置或发票 PDF 附件。')
    }
    entry.serverResult = response
    emailLog.value.unshift(entry)
    if (emailLog.value.length > 100) {
      emailLog.value = emailLog.value.slice(0, 100)
    }
    saveEmailLog(emailLog.value)
    showEmailDialog.value = false
    return entry
  }

  async function sendEmailContent(email) {
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

  function buildInvoiceEmail(patient, consultation, clinicName, options = {}) {
    const clinic = resolveClinicName(clinicName)
    const variables = getCommonVariables({
      patient,
      consultation,
      clinicName: clinic,
      clinicAddress: settingsStore.clinicAddress,
    })
    const attachment = buildInvoicePdfAttachment(consultation, options.pdfResult || options.invoicePdf)
    const templateVariables = attachment ? { ...variables, invoiceLink: '' } : variables
    const email = buildTemplateEmail(
      'invoice',
      'invoice',
      resolvePatientEmail(patient),
      templateVariables,
    )
    if (attachment) {
      email.attachments = [attachment]
    }
    return email
  }

  function buildConsultationReportEmail(patient, consultation, clinicName, options = {}) {
    const clinic = resolveClinicName(clinicName)
    const variables = getCommonVariables({
      patient,
      consultation,
      clinicName: clinic,
      clinicAddress: settingsStore.clinicAddress,
    })
    const attachment = buildReportPdfAttachment(consultation, options.pdfResult || options.reportPdf)
    const templateVariables = attachment ? { ...variables, reportLink: '' } : variables
    const email = buildTemplateEmail(
      'consultationRecord',
      'consultation_report',
      resolvePatientEmail(patient),
      templateVariables,
    )
    if (attachment) {
      email.attachments = [attachment]
    }
    return email
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
