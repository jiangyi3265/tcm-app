# 处方付款回退与付款前保存 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 legacy 已付款记录的前端付款回退，并在 Invoice 付款前先保存草稿、基于保存后的数据重新计算付款金额。

**Architecture:** 在 `prescriptionWorkflow` 内新增 legacy 已付款判断与合成付款记录回退，保证支付状态与金额计算一致；在 `ConsultationView` 付款流程中引入最小 helper 先保存草稿并基于保存后的 consultation 计算 outstanding，再决定是否继续付款。

**Tech Stack:** Vue 3（SFC）、Node.js test runner（node:test）、纯 JS 工具函数。

---

## 文件结构与职责
- 修改: `src/utils/prescriptionWorkflow.js` — 增加 legacy 已付款回退与支付状态判定。
- 新建: `tests/prescriptionWorkflow.test.js` — 覆盖 legacy 回退与真实付款记录不被覆盖。
- 新建: `src/utils/invoicePaymentFlow.js` — 封装“保存草稿并返回 outstanding”的最小 helper。
- 修改: `src/views/consultations/ConsultationView.vue` — 付款前调用 helper，基于保存后数据决定付款与金额。
- 新建: `tests/invoicePaymentFlow.test.js` — 覆盖 helper 调用参数与 outstanding 计算。

---

### Task 1: 处方付款 legacy 回退（TDD）

**Files:**
- Create: `tests/prescriptionWorkflow.test.js`
- Modify: `src/utils/prescriptionWorkflow.js`

- [ ] **Step 1: 编写失败测试（legacy 已付款回退 + 真实记录不覆盖）**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPaymentRecords,
  getPaidAmount,
  getOutstandingAmount,
  getPaymentStatus,
} from '../src/utils/prescriptionWorkflow.js'

test('legacy 已付款但无 paymentRecords 时生成合成记录', () => {
  const consultation = {
    id: 'c-legacy',
    status: 'paid',
    totalAmount: 150,
    paidAt: '2024-01-02T10:00:00Z',
    lockedAt: '2024-01-01T10:00:00Z',
    date: '2024-01-01',
  }
  const records = getPaymentRecords(consultation)
  assert.equal(records.length, 1)
  assert.equal(records[0].amount, 150)
  assert.equal(records[0].date, '2024-01-02T10:00:00Z')
  assert.equal(records[0].method, '')
  assert.equal(getPaidAmount(consultation), 150)
  assert.equal(getOutstandingAmount(consultation), 0)
  assert.equal(getPaymentStatus(consultation), 'paid')
})

test('已有真实 paymentRecords 时不使用 legacy 回退', () => {
  const consultation = {
    id: 'c-real',
    status: 'paid',
    totalAmount: 200,
    paymentRecords: [
      { amount: 80, date: '2024-02-01T08:00:00Z', method: 'cash' },
    ],
  }
  const records = getPaymentRecords(consultation)
  assert.equal(records.length, 1)
  assert.equal(records[0].amount, 80)
  assert.equal(getPaidAmount(consultation), 80)
  assert.equal(getOutstandingAmount(consultation), 120)
  assert.equal(getPaymentStatus(consultation), 'partial')
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --test tests/prescriptionWorkflow.test.js`

Expected: FAIL（legacy 回退尚未实现）

- [ ] **Step 3: 实现 legacy 已付款回退与支付状态判定**

```js
function normalizePaymentFlag(value) {
  return String(value || '').trim().toLowerCase()
}

function hasRealPaymentRecords(consultation) {
  return Array.isArray(consultation?.paymentRecords) && consultation.paymentRecords.length > 0
}

function isLegacyPaidConsultation(consultation) {
  const status = normalizePaymentFlag(consultation?.status)
  const paymentStatus = normalizePaymentFlag(consultation?.paymentStatus)
  return status === 'paid' || paymentStatus === 'paid'
}

function shouldUseLegacyPaidFallback(consultation) {
  return !hasRealPaymentRecords(consultation) && isLegacyPaidConsultation(consultation)
}

function buildLegacyPaymentRecord(consultation) {
  const fallbackDate = consultation?.paidAt || consultation?.lockedAt || consultation?.date || ''
  const totalAmount = toNumber(consultation?.totalAmount)
  const amount = totalAmount || toNumber(consultation?.paidAmount)
  return {
    amount,
    date: fallbackDate,
    method: '',
  }
}

export function getPaymentRecords(consultation) {
  if (hasRealPaymentRecords(consultation)) {
    return consultation.paymentRecords
      .map((item) => ({ ...item }))
      .sort((a, b) => new Date(b?.date || 0) - new Date(a?.date || 0))
  }
  if (shouldUseLegacyPaidFallback(consultation)) {
    return [buildLegacyPaymentRecord(consultation)]
  }
  return []
}

export function getPaymentStatus(consultation) {
  if (consultation?.paymentStatus) return consultation.paymentStatus
  if (shouldUseLegacyPaidFallback(consultation)) return 'paid'
  const paidAmount = getPaidAmount(consultation)
  const outstanding = getOutstandingAmount(consultation)
  if (paidAmount <= 0) return 'unpaid'
  return outstanding > 0 ? 'partial' : 'paid'
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `node --test tests/prescriptionWorkflow.test.js`

Expected: PASS

- [ ] **Step 5: 跳过提交（按要求不提交 git commit）**

---

### Task 2: 付款前保存草稿 + 重新计算 outstanding（TDD）

**Files:**
- Create: `tests/invoicePaymentFlow.test.js`
- Create: `src/utils/invoicePaymentFlow.js`
- Modify: `src/views/consultations/ConsultationView.vue`

- [ ] **Step 1: 编写 helper 失败测试（保存参数与 outstanding 计算）**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveInvoicePaymentAfterSave } from '../src/utils/invoicePaymentFlow.js'

test('resolveInvoicePaymentAfterSave 以 silent+不跳转保存并返回 outstanding', async () => {
  const calls = []
  const persist = async (options) => {
    calls.push(options)
    return { id: 'c1', totalAmount: 120 }
  }
  const result = await resolveInvoicePaymentAfterSave(persist)
  assert.deepEqual(calls, [{ silent: true, syncRoute: false }])
  assert.equal(result.savedConsultation.id, 'c1')
  assert.equal(result.outstandingAmount, 120)
})

test('resolveInvoicePaymentAfterSave 返回 saved outstandingAmount', async () => {
  const persist = async () => ({ id: 'c2', outstandingAmount: 0, totalAmount: 80 })
  const result = await resolveInvoicePaymentAfterSave(persist)
  assert.equal(result.outstandingAmount, 0)
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --test tests/invoicePaymentFlow.test.js`

Expected: FAIL（helper 未实现）

- [ ] **Step 3: 新增最小 helper**

```js
import { getOutstandingAmount } from './prescriptionWorkflow'

export async function resolveInvoicePaymentAfterSave(persistConsultationDraft) {
  const savedConsultation = await persistConsultationDraft({ silent: true, syncRoute: false })
  return {
    savedConsultation,
    outstandingAmount: getOutstandingAmount(savedConsultation || {}),
  }
}
```

- [ ] **Step 4: 更新 ConsultationView 付款流程使用 helper**

```js
import { resolveInvoicePaymentAfterSave } from '../../utils/invoicePaymentFlow'

async function finalizeInvoicePayment(method) {
  const id = currentConsultationId.value
  if (!id) {
    ElMessage.warning(t('consultation.saveBefore'))
    return
  }
  if (invoicePaymentSubmitting.value) return
  invoicePaymentSubmitting.value = true
  try {
    const { savedConsultation, outstandingAmount: refreshedOutstanding } =
      await resolveInvoicePaymentAfterSave(persistConsultationDraft)

    if (refreshedOutstanding <= 0) {
      showInvoicePaymentDialog.value = false
      showPosSimulationDialog.value = false
      pendingPosPaymentMethod.value = ''
      ElMessage.info(t('consultation.noPendingAmount'))
      return
    }

    const paymentId = savedConsultation?.id || currentConsultationId.value
    const updated = await consultStore.markAsPaid(paymentId, {
      paymentMethod: method,
      amount: refreshedOutstanding,
    })
    if (updated) {
      applySavedConsultation(updated)
      syncSavedSnapshot()
    }
    showInvoicePaymentDialog.value = false
    showPosSimulationDialog.value = false
    pendingPosPaymentMethod.value = ''
    ElMessage.success(t('consultation.paymentRecorded'))
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message)
  } finally {
    invoicePaymentSubmitting.value = false
  }
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `node --test tests/invoicePaymentFlow.test.js`

Expected: PASS

- [ ] **Step 6: 跳过提交（按要求不提交 git commit）**

---

### Task 3: 按要求执行回归验证

**Files:**
- Test: `tests/prescriptionWorkflow.test.js`
- Test: `tests/paymentMethods.test.js`
- Test: `tests/invoicePaymentFlow.test.js`

- [ ] **Step 1: 运行规定测试集**

Run: `node --test tests/prescriptionWorkflow.test.js tests/paymentMethods.test.js tests/invoicePaymentFlow.test.js`

Expected: PASS

- [ ] **Step 2: 跳过提交（按要求不提交 git commit）**

---

## 自检清单
- [ ] Legacy 已付款且无 paymentRecords：付款记录回退、已付金额与状态正确
- [ ] 有真实 paymentRecords：不触发回退
- [ ] Invoice 付款前保存草稿并基于保存后 outstanding 计算
- [ ] outstanding=0 时不继续付款并提示

