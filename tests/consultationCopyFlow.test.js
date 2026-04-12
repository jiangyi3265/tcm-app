import test from 'node:test'
import assert from 'node:assert/strict'
import { persistCopiedConsultationData } from '../src/utils/consultationCopyFlow.js'

test('已有诊疗记录且包含处方时，拷贝后应先保存整张诊疗单', async () => {
  const calls = []

  const result = await persistCopiedConsultationData({
    currentConsultationId: 'consult-1',
    prescriptions: [{ id: 'rx-1', items: [{ name: '黄芪' }] }],
    persistConsultationDraft: async (options) => {
      calls.push(['draft', options])
    },
    persistCopiedPrescriptions: async (prescriptions) => {
      calls.push(['prescriptions', prescriptions])
    },
  })

  assert.equal(result, 'draft')
  assert.deepEqual(calls, [['draft', { silent: true, syncRoute: false }]])
})

test('新建诊疗记录且包含处方时，拷贝后仍走逐处方同步', async () => {
  const calls = []
  const copiedPrescriptions = [{ id: 'rx-1', items: [{ name: '黄芪' }] }]

  const result = await persistCopiedConsultationData({
    currentConsultationId: '',
    prescriptions: copiedPrescriptions,
    persistConsultationDraft: async (options) => {
      calls.push(['draft', options])
    },
    persistCopiedPrescriptions: async (prescriptions, options) => {
      calls.push(['prescriptions', prescriptions, options])
    },
  })

  assert.equal(result, 'prescriptions')
  assert.deepEqual(calls, [['prescriptions', copiedPrescriptions, { syncRoute: false }]])
})

test('没有处方时，不触发额外持久化', async () => {
  const calls = []

  const result = await persistCopiedConsultationData({
    currentConsultationId: 'consult-1',
    prescriptions: [],
    persistConsultationDraft: async (options) => {
      calls.push(['draft', options])
    },
    persistCopiedPrescriptions: async (prescriptions) => {
      calls.push(['prescriptions', prescriptions])
    },
  })

  assert.equal(result, 'skipped')
  assert.deepEqual(calls, [])
})
