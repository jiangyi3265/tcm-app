import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMAIL_TEMPLATE_KEYS,
  buildTemplatedEmail,
  normalizeEmailTemplates,
  renderEmailTemplate,
} from '../src/utils/emailTemplates.js'

test('邮件模板读取时过滤坏 key 并补齐默认模板', () => {
  const templates = normalizeEmailTemplates({
    0: { subject: '', body: '' },
    1: {},
    invoice: { subject: 'Paid {{patientName}}', body: '' },
    report: { body: 'Report {{patientName}}' },
  })

  assert.equal(Object.keys(templates).length, EMAIL_TEMPLATE_KEYS.length)
  assert.equal(templates[0], undefined)
  assert.equal(templates.invoice.subject, 'Paid {{patientName}}')
  assert.match(templates.invoice.body, /发票/)
  assert.doesNotMatch(templates.invoice.body, /invoiceLink/)
  assert.equal(templates.consultationRecord.body, 'Report {{patientName}}')
})

test('邮件模板保存前清洗字符串和数组坏数据', () => {
  const templates = normalizeEmailTemplates([
    { key: 'appointment_confirm', subject: '  Hi {{patientName}}  ', body: '  Confirmed  ' },
    { key: '2', subject: 'Bad', body: 'Bad' },
  ])

  assert.equal(templates.appointmentConfirmation.subject, 'Hi {{patientName}}')
  assert.equal(templates.appointmentConfirmation.body, 'Confirmed')
  assert.equal(templates[2], undefined)
})

test('模板变量支持带空格的双大括号', () => {
  assert.equal(renderEmailTemplate('Hi {{ patientName }}', { patientName: 'Ada' }), 'Hi Ada')
})

test('default invoice subject includes appointmentDate placeholder', () => {
  const templates = normalizeEmailTemplates()
  assert.match(templates.invoice.subject, /\{\{appointmentDate\}\}/)
})

test('构建外发邮件时保留 templateKey 和 variables', () => {
  const email = buildTemplatedEmail({
    to: 'patient@example.com',
    type: 'invoice',
    templateKey: 'invoice',
    templates: {
      invoice: {
        subject: 'Invoice {{patientName}}',
        body: 'Amount {{ amount }}',
      },
    },
    variables: { patientName: 'Ada', amount: '88.00' },
  })

  assert.equal(email.to, 'patient@example.com')
  assert.equal(email.subject, 'Invoice Ada')
  assert.equal(email.body, 'Amount 88.00')
  assert.equal(email.templateKey, 'invoice')
  assert.deepEqual(email.variables, { patientName: 'Ada', amount: '88.00' })
})
