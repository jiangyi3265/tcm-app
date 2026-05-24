export const EMAIL_TEMPLATE_REGISTRY = Object.freeze({
  appointmentConfirmation: {
    label: '预约确认',
    subject: '{{clinicName}}｜预约确认',
    body:
      '您好 {{patientName}}，您的预约已确认。\n\n'
      + '服务：{{serviceLabel}}\n'
      + '医师：{{practitionerName}}\n'
      + '时间：{{appointmentDate}} {{appointmentTime}}\n'
      + '地址：{{clinicAddress}}\n\n'
      + '预约管理：{{manageLink}}\n'
      + '就诊资料表：{{intakeLink}}\n'
      + '知情同意书：{{consentLink}}\n\n'
      + '如需管理或取消预约，请使用此链接：{{manageLink}}',
  },
  appointmentCancellation: {
    label: '预约取消',
    subject: '{{clinicName}}｜预约取消通知',
    body:
      '您好 {{patientName}}，您的预约已取消。\n\n'
      + '原预约时间：{{appointmentDate}} {{appointmentTime}}\n'
      + '服务：{{serviceLabel}}\n\n'
      + '如需重新预约，请联系诊所或使用预约管理链接：{{manageLink}}',
  },
  reminder: {
    label: '预约提醒',
    subject: '{{clinicName}}｜预约提醒',
    body:
      '您好 {{patientName}}，提醒您将在 {{appointmentDate}} {{appointmentTime}} 到诊。\n\n'
      + '服务：{{serviceLabel}}\n'
      + '医师：{{practitionerName}}\n'
      + '地址：{{clinicAddress}}\n\n'
      + '如需调整，请使用预约管理链接：{{manageLink}}',
  },
  consent: {
    label: '知情同意书',
    subject: '{{clinicName}}｜知情同意书签署',
    body:
      '您好 {{patientName}}，请在就诊前阅读并签署知情同意书：\n'
      + '{{consentLink}}\n\n'
      + '如有疑问，请联系 {{clinicName}}。',
  },
  intake: {
    label: '就诊资料表',
    subject: '{{clinicName}}｜就诊资料表',
    body:
      '您好 {{patientName}}，请在就诊前填写就诊资料表：\n'
      + '{{intakeLink}}\n\n'
      + '这会帮助医师提前了解您的情况。',
  },
  consultationRecord: {
    label: '问诊报告',
    subject: '{{clinicName}}｜问诊报告',
    body:
      '您好 {{patientName}}，您的问诊报告已生成。\n\n'
      + '问诊编号：{{consultationId}}\n'
      + '日期：{{consultationDate}}\n'
      + '主诉：{{chiefComplaint}}\n\n'
      + '报告链接：{{reportLink}}\n'
      + '如有疑问请联系诊所。',
  },
  invoice: {
    label: '发票',
    subject: '{{clinicName}}｜发票',
    body:
      '您好 {{patientName}}，您的发票已生成。\n\n'
      + '问诊编号：{{consultationId}}\n'
      + '日期：{{consultationDate}}\n'
      + '金额：{{amount}}\n'
      + '发票 PDF 已随邮件附件发送。\n\n'
      + '感谢您的到访。',
  },
  appointmentChange: {
    label: '预约变更',
    subject: '{{clinicName}}｜预约变动通知',
    body:
      '您好 {{patientName}}，您的预约信息已有变动，请以最新安排为准。\n\n'
      + '原安排：\n{{previousAppointmentSummary}}\n'
      + '最新安排：\n{{appointmentSummary}}\n'
      + '如新时间不方便，请联系诊所，或使用预约管理链接：{{manageLink}}',
  },
  aftercare: {
    label: '治疗后护理',
    subject: '{{clinicName}}｜治疗后护理提醒',
    body:
      '您好 {{patientName}}，感谢您今天到 {{clinicName}} 接受治疗。\n\n'
      + '为帮助身体恢复，请留意以下护理建议：\n'
      + '1. 今天请注意保暖，避免受凉、淋雨和二次损伤。\n'
      + '2. 针灸后 4 小时内尽量不要洗澡；24 小时内避免饮酒、熬夜和剧烈运动。\n'
      + '3. 如治疗部位出现轻微酸胀、发热或瘀痕，通常属于正常反应，请先休息观察。\n'
      + '4. 如果出现明显疼痛、肿胀、持续出血、头晕或其他异常，请尽快联系诊所。\n\n'
      + '地址：{{clinicAddress}}\n{{clinicName}}',
  },
  followUp: {
    label: '治疗后回访',
    subject: '{{clinicName}}｜治疗后回访',
    body:
      '您好 {{patientName}}，这是治疗后的回访邮件，想了解您这几天的恢复情况。\n\n'
      + '如果恢复顺利，请继续按护理建议休息和观察；如果仍有不适或出现异常，请及时联系诊所。\n\n'
      + '感谢您对 {{clinicName}} 的信任。',
  },
  internalBooking: {
    label: '内部新预约通知',
    subject: '{{clinicName}}｜新预约通知',
    body:
      '新预约通知\n\n'
      + '病人：{{patientName}}\n'
      + '电话：{{patientPhone}}\n'
      + '邮箱：{{patientEmail}}\n\n'
      + '预约信息：\n{{appointmentSummary}}\n'
      + '管理链接：{{manageLink}}',
  },
  internalAppointmentChange: {
    label: '内部预约变更通知',
    subject: '{{clinicName}}｜预约变动通知',
    body:
      '预约变动通知\n\n'
      + '病人：{{patientName}}\n'
      + '原安排：\n{{previousAppointmentSummary}}\n'
      + '新安排：\n{{appointmentSummary}}',
  },
  internalAppointmentCancellation: {
    label: '内部预约取消通知',
    subject: '{{clinicName}}｜预约取消通知',
    body:
      '预约取消通知\n\n'
      + '病人：{{patientName}}\n'
      + '预约信息：\n{{previousAppointmentSummary}}\n'
      + '取消来源：{{cancellationSource}}',
  },
})

export const EMAIL_TEMPLATE_KEYS = Object.freeze(Object.keys(EMAIL_TEMPLATE_REGISTRY))

export const EMAIL_TEMPLATE_VARIABLES = Object.freeze([
  { key: 'clinicName', label: '诊所名称' },
  { key: 'clinicAddress', label: '诊所地址' },
  { key: 'clinicPhone', label: '诊所电话' },
  { key: 'clinicEmail', label: '诊所邮箱' },
  { key: 'patientId', label: '病人ID' },
  { key: 'patientName', label: '病人姓名' },
  { key: 'patientEmail', label: '病人邮箱' },
  { key: 'patientPhone', label: '病人电话' },
  { key: 'serviceLabel', label: '服务名称' },
  { key: 'servicePrice', label: '服务价格' },
  { key: 'practitionerName', label: '中医师姓名' },
  { key: 'appointmentDate', label: '预约日期' },
  { key: 'appointmentTime', label: '预约时间' },
  { key: 'appointmentSummary', label: '预约摘要' },
  { key: 'previousAppointmentSummary', label: '原预约摘要' },
  { key: 'manageLink', label: '预约管理/取消链接' },
  { key: 'cancelLink', label: '取消链接' },
  { key: 'consentLink', label: '知情同意书链接' },
  { key: 'intakeLink', label: '就诊资料表链接' },
  { key: 'consultationId', label: '问诊编号' },
  { key: 'consultationDate', label: '问诊日期' },
  { key: 'chiefComplaint', label: '主诉' },
  { key: 'reportLink', label: '问诊报告链接' },
  { key: 'invoiceLink', label: '发票链接' },
  { key: 'amount', label: '金额' },
  { key: 'cancellationSource', label: '取消来源' },
])

export const EMAIL_TEMPLATE_ALIASES = Object.freeze({
  appointment_confirm: 'appointmentConfirmation',
  appointment_confirmation: 'appointmentConfirmation',
  appointmentConfirmationEmail: 'appointmentConfirmation',
  appointment_cancel: 'appointmentCancellation',
  appointment_cancellation: 'appointmentCancellation',
  appointmentCancellationEmail: 'appointmentCancellation',
  appointment_reminder: 'reminder',
  reminderEmail: 'reminder',
  consent_form: 'consent',
  consentEmail: 'consent',
  intake_form: 'intake',
  intakeEmail: 'intake',
  consultationReport: 'consultationRecord',
  consultation_report: 'consultationRecord',
  report: 'consultationRecord',
  reportEmail: 'consultationRecord',
  invoiceEmail: 'invoice',
  appointment_change: 'appointmentChange',
  appointmentChangeEmail: 'appointmentChange',
  appointment_aftercare: 'aftercare',
  aftercareEmail: 'aftercare',
  appointment_follow_up: 'followUp',
  follow_up: 'followUp',
  followUpEmail: 'followUp',
  appointment_internal_new: 'internalBooking',
  internalBookingEmail: 'internalBooking',
  appointment_change_internal: 'internalAppointmentChange',
  internalAppointmentChangeEmail: 'internalAppointmentChange',
  appointment_cancel_internal: 'internalAppointmentCancellation',
  internalAppointmentCancellationEmail: 'internalAppointmentCancellation',
})

export function canonicalEmailTemplateKey(key) {
  const text = String(key || '').trim()
  if (!text) return ''
  if (EMAIL_TEMPLATE_REGISTRY[text]) return text
  return EMAIL_TEMPLATE_ALIASES[text] || ''
}

export function cloneDefaultEmailTemplates() {
  return Object.fromEntries(
    EMAIL_TEMPLATE_KEYS.map((key) => {
      const template = EMAIL_TEMPLATE_REGISTRY[key]
      return [key, { subject: template.subject, body: template.body }]
    }),
  )
}

function parseTemplateSource(value) {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text) return {}
  if (!text.startsWith('{') && !text.startsWith('[')) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function cleanTemplateText(value, fallback) {
  if (typeof value !== 'string') return fallback
  const text = value.replace(/\r\n/g, '\n').trim()
  return text || fallback
}

function readTemplateFields(value, fallback) {
  if (typeof value === 'string') {
    return {
      subject: fallback.subject,
      body: cleanTemplateText(value, fallback.body),
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback }
  }
  return {
    subject: cleanTemplateText(value.subject ?? value.title ?? value.name, fallback.subject),
    body: cleanTemplateText(
      value.body ?? value.content ?? value.templateBody ?? value.text ?? value.html,
      fallback.body,
    ),
  }
}

function collectTemplateEntries(source) {
  if (Array.isArray(source)) {
    return source.map((item) => [
      item?.key ?? item?.templateKey ?? item?.type ?? item?.id ?? item?.name,
      item,
    ])
  }
  if (source && typeof source === 'object') {
    return Object.entries(source)
  }
  return []
}

export function normalizeEmailTemplates(value) {
  const normalized = cloneDefaultEmailTemplates()
  const source = parseTemplateSource(value)
  collectTemplateEntries(source).forEach(([rawKey, rawTemplate]) => {
    const key = canonicalEmailTemplateKey(rawKey)
    if (!key) return
    normalized[key] = readTemplateFields(rawTemplate, normalized[key])
  })
  return normalized
}

export function getEmailTemplate(templates, key) {
  const canonicalKey = canonicalEmailTemplateKey(key)
  if (!canonicalKey) return null
  return normalizeEmailTemplates(templates)[canonicalKey]
}

export function renderEmailTemplate(text = '', variables = {}) {
  return String(text || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const value = variables[String(key).trim()]
    return value === undefined || value === null ? '' : String(value)
  })
}

export function buildTemplatedEmail({ to, type, templateKey, templates, variables = {} }) {
  const canonicalKey = canonicalEmailTemplateKey(templateKey)
  const template = getEmailTemplate(templates, canonicalKey)
  if (!template) {
    return { to, subject: '', body: '', type, templateKey: canonicalKey, variables }
  }
  return {
    to,
    subject: renderEmailTemplate(template.subject, variables),
    body: renderEmailTemplate(template.body, variables),
    type,
    templateKey: canonicalKey,
    variables,
  }
}
