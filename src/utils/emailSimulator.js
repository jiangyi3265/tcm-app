/**
 * 邮件模拟器 - 提供邮件预览弹窗 + 发送日志
 * 使用 composable 模式
 */
import { ref } from 'vue'
import { emailLogsApi } from './api'
import { readStoredJson, writeStoredJson } from './storage'

const EMAIL_LOG_KEY = 'tcm_email_log'

// 全局邮件日志
function loadEmailLog() {
  return readStoredJson(EMAIL_LOG_KEY, []) || []
}

function saveEmailLog(log) {
  writeStoredJson(EMAIL_LOG_KEY, log)
}

export function useEmailSimulator() {
  const showEmailDialog = ref(false)
  const emailData = ref({
    to: '',
    subject: '',
    body: '',
    type: '', // appointment_confirm, invoice, consultation_report
  })
  const emailLog = ref(loadEmailLog())

  function openEmailPreview({ to, subject, body, type }) {
    emailData.value = { to, subject, body, type }
    showEmailDialog.value = true
  }

function sendEmail() {
  const entry = {
    id: 'email-' + Date.now(),
    ...emailData.value,
    sentAt: new Date().toISOString(),
  }
  emailLog.value.unshift(entry)
  if (emailLog.value.length > 100) emailLog.value = emailLog.value.slice(0, 100)
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
      // fallback to local log
    }
    emailLog.value = loadEmailLog()
    return emailLog.value
  }

  // 预设邮件模板
  function buildAppointmentConfirmEmail(patient, appointment, practitioner, serviceLabel) {
    return {
      to: patient?.emails?.[0] || patient?.email || '',
      subject: `预约确认 - ${serviceLabel} (${appointment.startTime?.split('T')[0] || ''})`,
      body: `尊敬的 ${patient?.name || ''}：\n\n您的预约已确认，详情如下：\n\n` +
        `服务类型：${serviceLabel}\n` +
        `医师：${practitioner?.name || ''}\n` +
        `时间：${appointment.startTime}\n` +
        `${appointment.roomId ? '诊室：' + appointment.roomId + '\n' : ''}` +
        `\n如需取消或改期，请提前24小时联系我们。\n\n祝好！\n中医诊所`,
      type: 'appointment_confirm',
    }
  }

  function buildInvoiceEmail(patient, consultation, clinicName) {
    return {
      to: patient?.emails?.[0] || patient?.email || '',
      subject: `发票 - ${consultation.consultationId || ''} (¥${(consultation.totalAmount || 0).toFixed(2)})`,
      body: `尊敬的 ${patient?.name || ''}：\n\n感谢您的就诊。附件为您的发票，详情如下：\n\n` +
        `诊疗编号：${consultation.consultationId || '-'}\n` +
        `日期：${consultation.date || ''}\n` +
        `总计：¥${(consultation.totalAmount || 0).toFixed(2)}（含税 ¥${(consultation.taxAmount || 0).toFixed(2)}）\n` +
        `\n如有疑问，请联系我们。\n\n${clinicName || '中医诊所'}`,
      type: 'invoice',
    }
  }

  function buildConsultationReportEmail(patient, consultation, clinicName) {
    return {
      to: patient?.emails?.[0] || patient?.email || '',
      subject: `诊疗报告 - ${consultation.consultationId || ''} (${consultation.date || ''})`,
      body: `尊敬的 ${patient?.name || ''}：\n\n您的诊疗报告已生成，详情如下：\n\n` +
        `诊疗编号：${consultation.consultationId || '-'}\n` +
        `日期：${consultation.date || ''}\n` +
        `主诉：${consultation.chiefComplaint || '-'}\n` +
        `\n请在下次就诊时带来此报告以便参考。\n\n${clinicName || '中医诊所'}`,
      type: 'consultation_report',
    }
  }

  function buildIntakeFormEmail(patient, appointment, token, clinicName) {
    const link = `${window.location.origin}/intake/${token}`
    return {
      to: patient?.emails?.[0] || patient?.email || '',
      subject: `就诊问诊表 - ${appointment?.startTime?.split('T')[0] || ''} - ${clinicName || '中医诊所'}`,
      body: `尊敬的 ${patient?.name || ''}：\n\n` +
        `您的预约已确认。请在就诊前填写以下问诊表，以便医师提前了解您的情况：\n\n` +
        `填写链接：${link}\n\n` +
        `预约时间：${appointment?.startTime || ''}\n` +
        `请在就诊前完成填写。\n\n${clinicName || '中医诊所'}`,
      type: 'intake_form',
    }
  }

  function buildConsentEmail(patient, token, clinicName) {
    const link = `${window.location.origin}/consent/${token}`
    return {
      to: patient?.emails?.[0] || patient?.email || '',
      subject: `知情同意书签署 - ${clinicName || '中医诊所'}`,
      body: `尊敬的 ${patient?.name || ''}：\n\n` +
        `感谢您选择${clinicName || '中医诊所'}。在您首次就诊之前，请通过以下链接签署电子知情同意书：\n\n` +
        `签署链接：${link}\n\n` +
        `该链接有效期为7天。签署后将自动生成PDF并存入您的病历档案。\n\n` +
        `如有任何疑问，请联系我们。\n\n${clinicName || '中医诊所'}`,
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
