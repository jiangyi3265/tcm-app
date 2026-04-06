# Invoice 付款入口与 POS 模拟 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在诊疗页 Invoice 标签页内增加仅 `admin/cashier` 可见的付款入口，基于当前 Pricing 发起一次性付款，并为 `bankcard` 增加系统内 POS 模拟成功/取消流程。

**Architecture:** 保持现有 `consultationsStore.markAsPaid() -> POST /api/consultations/{id}/payments` 主链路不变，只在前端增加一个诊疗页内付款流程。将支付方式标准化、旧值兼容映射、是否需要 POS 模拟等规则抽到共享工具中，让 `ConsultationView`、`CashierView`、`PharmacyView` 统一消费，避免再次出现 `card/transfer/manual` 与新值混用。

**Tech Stack:** Vue 3、Pinia、Element Plus、Node `node:test`

---

## File Structure

- Create: `src/utils/paymentMethods.js`
  - 统一支付方式值、标签映射、旧值兼容转换、POS 模拟判断、付款入口按钮显示条件。
- Create: `tests/paymentMethods.test.js`
  - 覆盖支付方式标准化、旧值兼容、POS 判断、付款入口显示条件。
- Modify: `src/views/consultations/ConsultationView.vue`
  - Invoice tab 权限收口、付款入口按钮、付款弹窗、POS 模拟弹窗、付款完成后刷新当前诊疗数据。
- Modify: `src/views/cashier/CashierView.vue`
  - 使用新支付方式集合与标签映射，显示历史 payment method 时兼容旧值。
- Modify: `src/views/pharmacy/PharmacyView.vue`
  - 同步使用新支付方式集合与标签映射。
- Modify: `src/i18n/zh-CN.js`
  - 新增 Consultation / Cashier 的付款入口、POS 模拟、Invoice 空态与按钮文案。
- Modify: `src/i18n/en.js`
  - 英文对应文案。

---

### Task 1: 抽离支付方式与付款入口规则

**Files:**
- Create: `src/utils/paymentMethods.js`
- Test: `tests/paymentMethods.test.js`

- [ ] **Step 1: 写失败测试**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canStartInvoicePayment,
  getPaymentMethodLabel,
  getPaymentMethodOptions,
  normalizePaymentMethodValue,
  requiresPosSimulation,
} from '../src/utils/paymentMethods.js'

test('旧支付方式值会被标准化到新三种值', () => {
  assert.equal(normalizePaymentMethodValue('card'), 'bankcard')
  assert.equal(normalizePaymentMethodValue('transfer'), 'etransfer')
  assert.equal(normalizePaymentMethodValue('manual'), 'cash')
})

test('bankcard 需要 POS 模拟，其它方式不需要', () => {
  assert.equal(requiresPosSimulation('bankcard'), true)
  assert.equal(requiresPosSimulation('card'), true)
  assert.equal(requiresPosSimulation('cash'), false)
  assert.equal(requiresPosSimulation('etransfer'), false)
})

test('付款入口仅在已保存且仍有未付金额时显示', () => {
  assert.equal(canStartInvoicePayment({ consultationId: 'consult-1', outstandingAmount: 88 }), true)
  assert.equal(canStartInvoicePayment({ consultationId: '', outstandingAmount: 88 }), false)
  assert.equal(canStartInvoicePayment({ consultationId: 'consult-1', outstandingAmount: 0 }), false)
})

test('支付方式选项与标签统一为三种', () => {
  const t = (key) => key
  assert.deepEqual(getPaymentMethodOptions(t), [
    { value: 'bankcard', label: 'cashier.paymentMethods.bankcard' },
    { value: 'etransfer', label: 'cashier.paymentMethods.etransfer' },
    { value: 'cash', label: 'cashier.paymentMethods.cash' },
  ])
  assert.equal(getPaymentMethodLabel('transfer', t), 'cashier.paymentMethods.etransfer')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/paymentMethods.test.js`
Expected: FAIL with `Cannot find module '../src/utils/paymentMethods.js'`

- [ ] **Step 3: 写最小实现**

```js
const METHOD_LABEL_KEYS = {
  bankcard: 'cashier.paymentMethods.bankcard',
  etransfer: 'cashier.paymentMethods.etransfer',
  cash: 'cashier.paymentMethods.cash',
}

const LEGACY_METHOD_MAP = {
  bankcard: 'bankcard',
  card: 'bankcard',
  etransfer: 'etransfer',
  transfer: 'etransfer',
  cash: 'cash',
  manual: 'cash',
}

export function normalizePaymentMethodValue(value = '') {
  return LEGACY_METHOD_MAP[String(value || '').trim().toLowerCase()] || 'cash'
}

export function requiresPosSimulation(value = '') {
  return normalizePaymentMethodValue(value) === 'bankcard'
}

export function canStartInvoicePayment({ consultationId, outstandingAmount } = {}) {
  return !!String(consultationId || '').trim() && Number(outstandingAmount || 0) > 0
}

export function getPaymentMethodOptions(t) {
  return ['bankcard', 'etransfer', 'cash'].map((value) => ({
    value,
    label: t(METHOD_LABEL_KEYS[value]),
  }))
}

export function getPaymentMethodLabel(value, t) {
  const normalized = normalizePaymentMethodValue(value)
  return t(METHOD_LABEL_KEYS[normalized])
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/paymentMethods.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/paymentMethods.js tests/paymentMethods.test.js
git commit -m "feat(payment): standardize consultation payment methods"
```

### Task 2: 在 ConsultationView 的 Invoice 标签页接入付款入口与 POS 模拟

**Files:**
- Modify: `src/views/consultations/ConsultationView.vue`
- Modify: `src/i18n/zh-CN.js`
- Modify: `src/i18n/en.js`
- Test: `tests/paymentMethods.test.js`

- [ ] **Step 1: 接入共享支付方式工具**

```js
import {
  canStartInvoicePayment,
  getPaymentMethodLabel,
  getPaymentMethodOptions,
  normalizePaymentMethodValue,
  requiresPosSimulation,
} from '../../utils/paymentMethods'

const canViewInvoiceTab = computed(() => roles.value.includes('admin') || roles.value.includes('cashier'))
const canStartCurrentInvoicePayment = computed(() =>
  canStartInvoicePayment({
    consultationId: currentConsultationId.value,
    outstandingAmount: outstandingAmount.value,
  }),
)
const paymentMethodOptions = computed(() => getPaymentMethodOptions(t))
```

- [ ] **Step 2: 增加付款弹窗与 POS 模拟状态**

```js
const showInvoicePaymentDialog = ref(false)
const showPosSimulationDialog = ref(false)
const invoicePaymentMethod = ref('cash')
const invoicePaymentSubmitting = ref(false)

function openInvoicePaymentDialog() {
  invoicePaymentMethod.value = 'cash'
  showInvoicePaymentDialog.value = true
}

function closePosSimulation() {
  showPosSimulationDialog.value = false
}
```

- [ ] **Step 3: 写统一提交函数，成功后刷新当前诊疗**

```js
async function commitInvoicePayment(method) {
  if (!currentConsultationId.value) return
  invoicePaymentSubmitting.value = true
  try {
    const updated = await consultStore.markAsPaid(currentConsultationId.value, {
      paymentMethod: normalizePaymentMethodValue(method),
      amount: outstandingAmount.value,
    })
    if (updated) {
      applySavedConsultation(updated)
      syncSavedSnapshot()
    }
    showInvoicePaymentDialog.value = false
    showPosSimulationDialog.value = false
    ElMessage.success(t('consultation.paymentRecorded'))
  } catch (error) {
    ElMessage.error(error.message || t('cashier.paymentFailed'))
  } finally {
    invoicePaymentSubmitting.value = false
  }
}
```

- [ ] **Step 4: bankcard 接 POS 模拟，其它方式直接付款**

```js
function submitInvoicePayment() {
  if (!canStartCurrentInvoicePayment.value) return
  if (requiresPosSimulation(invoicePaymentMethod.value)) {
    showPosSimulationDialog.value = true
    return
  }
  commitInvoicePayment(invoicePaymentMethod.value)
}

function confirmPosSimulationSuccess() {
  commitInvoicePayment('bankcard')
}
```

- [ ] **Step 5: 收口页头旧入口，并限制 Invoice 标签页权限**

```vue
<el-button
  v-if="form.status === 'completed' && canMarkPaid && outstandingAmount > 0"
  ...
>
```

改为删除这段页头按钮；Invoice tab 改成：

```vue
<el-tab-pane v-if="canViewInvoiceTab" :label="t('consultation.tabInvoice')" name="invoices">
```

- [ ] **Step 6: 在 Invoice 标签页内加入付款入口与支付方式展示**

```vue
<div class="invoice-actions" style="margin-bottom:12px">
  <el-button
    v-if="canStartCurrentInvoicePayment"
    type="primary"
    @click="openInvoicePaymentDialog"
  >
    {{ t('consultation.createInvoiceAndStartPayment') }}
  </el-button>
</div>

<el-table-column label="Status Reason" width="100">
  <template #default="{ row }">
    <el-tag type="success" size="small">{{ getPaymentMethodLabel(row.method, t) }}</el-tag>
  </template>
</el-table-column>

<el-card class="section-card invoice-pdf-preview">
  ...
</el-card>
```

同时把 `invoice-pdf-preview` 的 `v-if="paymentRecords.length"` 去掉，保证未付款时也能预览当前发票。

- [ ] **Step 7: 增加付款弹窗与 POS 模拟弹窗模板**

```vue
<el-dialog v-model="showInvoicePaymentDialog" :title="t('consultation.invoicePaymentDialogTitle')" width="420px">
  <div class="invoice-payment-summary">
    <div>{{ patient.name }}</div>
    <div>{{ t('consultation.currentInvoiceAmount') }} {{ cs }}{{ outstandingAmount.toFixed(2) }}</div>
  </div>
  <el-radio-group v-model="invoicePaymentMethod">
    <el-radio-button v-for="option in paymentMethodOptions" :key="option.value" :value="option.value">
      {{ option.label }}
    </el-radio-button>
  </el-radio-group>
  <template #footer>
    <el-button @click="showInvoicePaymentDialog = false">{{ t('common.cancel') }}</el-button>
    <el-button type="primary" :loading="invoicePaymentSubmitting" @click="submitInvoicePayment">
      {{ t('consultation.startPayment') }}
    </el-button>
  </template>
</el-dialog>

<el-dialog v-model="showPosSimulationDialog" :title="t('consultation.posSimulationTitle')" width="420px" :close-on-click-modal="false">
  <p>{{ t('consultation.posSimulationWaiting') }}</p>
  <p>{{ t('consultation.currentInvoiceAmount') }} {{ cs }}{{ outstandingAmount.toFixed(2) }}</p>
  <template #footer>
    <el-button @click="closePosSimulation">{{ t('common.cancel') }}</el-button>
    <el-button type="success" :loading="invoicePaymentSubmitting" @click="confirmPosSimulationSuccess">
      {{ t('consultation.posSimulationSuccess') }}
    </el-button>
  </template>
</el-dialog>
```

- [ ] **Step 8: 添加中英文文案**

```js
// zh-CN consultation
createInvoiceAndStartPayment: '创建发票并开始付费',
invoicePaymentDialogTitle: '开始付费',
currentInvoiceAmount: '本次付款金额',
startPayment: '开始付款',
posSimulationTitle: 'POS 支付中',
posSimulationWaiting: 'POS 已连接，等待刷卡/插卡/感应',
posSimulationSuccess: '支付成功',

// zh-CN cashier.paymentMethods
bankcard: '银行卡',
etransfer: '电子转账',
cash: '现金',
```

英文同名 keys 对应：

```js
createInvoiceAndStartPayment: 'Create Invoice and Start Payment',
invoicePaymentDialogTitle: 'Start Payment',
currentInvoiceAmount: 'Current Payment Amount',
startPayment: 'Start Payment',
posSimulationTitle: 'POS Payment In Progress',
posSimulationWaiting: 'POS connected, waiting for card tap/insert/swipe',
posSimulationSuccess: 'Payment Successful',
```

- [ ] **Step 9: 构建验证 ConsultationView 改动**

Run: `npm run build`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/views/consultations/ConsultationView.vue src/i18n/zh-CN.js src/i18n/en.js
git commit -m "feat(consultation): add invoice payment entry with pos simulation"
```

### Task 3: 同步 CashierView / PharmacyView 到新支付方式

**Files:**
- Modify: `src/views/cashier/CashierView.vue`
- Modify: `src/views/pharmacy/PharmacyView.vue`
- Modify: `src/utils/paymentMethods.js`
- Test: `tests/paymentMethods.test.js`

- [ ] **Step 1: CashierView 改用共享选项**

```js
import { getPaymentMethodLabel, getPaymentMethodOptions } from '../../utils/paymentMethods'

const paymentMethods = computed(() => getPaymentMethodOptions(t))
```

把历史表格 method 显示从：

```vue
{{ row.method || '-' }}
```

改成：

```vue
{{ getPaymentMethodLabel(row.method, t) }}
```

- [ ] **Step 2: PharmacyView 改用共享选项**

```js
import { getPaymentMethodLabel, getPaymentMethodOptions } from '../../utils/paymentMethods'

const paymentMethods = computed(() => getPaymentMethodOptions(t))
```

并把支付方式展示统一改成 `getPaymentMethodLabel(...)`。

- [ ] **Step 3: 运行回归测试**

Run: `node --test tests/paymentMethods.test.js tests/historyCompareNavigation.test.js tests/consultationCopyFlow.test.js tests/consultationCopy.test.js tests/consultationInventorySync.test.js`
Expected: PASS

- [ ] **Step 4: 运行构建验证**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/cashier/CashierView.vue src/views/pharmacy/PharmacyView.vue src/utils/paymentMethods.js tests/paymentMethods.test.js
git commit -m "refactor(payment): unify payment method options across views"
```

---

## Self-Review

### Spec coverage
- Invoice tab 仅 `admin/cashier` 可见：Task 2 Step 5
- 仅做付款入口不建独立 invoice：Task 2 Step 6/7，复用现有付款链路
- 一次付清未付金额：Task 2 Step 3
- `bankcard/etransfer/cash`：Task 1 + Task 3
- `bankcard` 走 POS 模拟：Task 2 Step 4/7
- 其它两种直接付款：Task 2 Step 4
- 历史方法文案统一：Task 3

### Placeholder scan
- 无 `TBD` / `TODO`
- 每个步骤都有明确文件、命令、代码片段

### Type consistency
- 统一使用 `bankcard` / `etransfer` / `cash`
- Consultation / Cashier / Pharmacy 都调用 `getPaymentMethodOptions` 与 `getPaymentMethodLabel`
