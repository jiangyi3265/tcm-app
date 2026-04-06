# Rx Completion Race Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复新建处方抽屉与外层列表“完成处方”在自动保存竞态下的卡转圈与状态回退问题，同时保持现有处方状态语义不变。

**Architecture:** 继续保留现有处方自动保存，但把“自动保存请求”和“手动完成动作”拆成两条独立生命周期。通过 `rxEditingSessionId` 屏蔽过期 autosave 的 UI 回写，并在关闭抽屉或执行完成前清理定时器、等待在途请求收尾，再由当前动作写入最终状态。

**Tech Stack:** Vue 3、Element Plus、Pinia、Vite、Node.js `node:test`

---

### Task 1: 给 autosave 增加“过期结果不可回写”的纯函数保护

**Files:**
- Modify: `src/utils/rxAutosaveGuard.js`
- Test: `tests/rxAutosaveGuard.test.js`

- [ ] **Step 1: 先写失败测试，固定“旧 autosave 结果不能回写”的规则**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldApplyRxAutosaveResult,
  shouldQueueRxAutosave,
  shouldSkipRxAutosaveAfterSync,
} from '../src/utils/rxAutosaveGuard.js'

test('关闭抽屉后，旧 autosave 结果不再回写', () => {
  assert.equal(
    shouldApplyRxAutosaveResult({
      requestSessionId: 4,
      activeSessionId: 5,
      showDialog: false,
    }),
    false,
  )
})

test('完成动作使会话失效后，旧 autosave 结果不再回写', () => {
  assert.equal(
    shouldApplyRxAutosaveResult({
      requestSessionId: 7,
      activeSessionId: 8,
      showDialog: true,
    }),
    false,
  )
})

test('同一会话且抽屉仍打开时，允许 autosave 回写', () => {
  assert.equal(
    shouldApplyRxAutosaveResult({
      requestSessionId: 9,
      activeSessionId: 9,
      showDialog: true,
    }),
    true,
  )
})
```

- [ ] **Step 2: 运行测试确认当前缺口**

Run: `node --test tests/rxAutosaveGuard.test.js`

Expected:

```text
FAIL
shouldApplyRxAutosaveResult is not exported
```

- [ ] **Step 3: 在 autosave guard 工具中补上会话判定函数**

```js
export function shouldApplyRxAutosaveResult({
  requestSessionId = 0,
  activeSessionId = 0,
  showDialog = false,
} = {}) {
  return Boolean(
    showDialog
      && requestSessionId > 0
      && requestSessionId === activeSessionId,
  )
}
```

- [ ] **Step 4: 再跑一次测试，确认 guard 行为稳定**

Run: `node --test tests/rxAutosaveGuard.test.js`

Expected:

```text
# tests 7
# pass 7
# fail 0
```

- [ ] **Step 5: 提交本任务**

```bash
git add src/utils/rxAutosaveGuard.js tests/rxAutosaveGuard.test.js
git commit -m "fix: guard stale rx autosave results"
```

### Task 2: 在处方抽屉里隔离 autosave 与手动完成生命周期

**Files:**
- Modify: `src/views/consultations/ConsultationView.vue`
- Modify: `src/utils/rxAutosaveGuard.js`
- Test: `tests/rxAutosaveGuard.test.js`

- [ ] **Step 1: 先把抽屉会话与清理函数补到组件里**

```js
const rxEditingSessionId = ref(0)

function beginRxEditingSession() {
  rxEditingSessionId.value += 1
  return rxEditingSessionId.value
}

function invalidateRxEditingSession() {
  rxEditingSessionId.value += 1
}

function clearRxAutosaveTimer() {
  if (!rxAutosaveTimer) return
  clearTimeout(rxAutosaveTimer)
  rxAutosaveTimer = null
}
```

- [ ] **Step 2: 在新建和编辑处方入口里开启新会话**

```js
function openNewRx() {
  editingRxIdx.value = -1
  const defaultPreference = normalizePrescriptionPreference(authStore.currentUser?.prescriptionPreference)
  suspendRxAutosave.value = true
  rxForm.value = {
    id: buildRxId(),
    formulaName: '',
    prescriptionType: defaultPreference,
    quantity: 7,
    direction: TCM_OPTIONS.direction[0] || 'Take 1 bag twice a day',
    whereToGet: TCM_OPTIONS.whereToGet[0] || 'Clinic',
    preferredUnit: defaultPreference === 'powder' ? 'bag' : 'g',
    items: [],
    comments: '',
    rxStatus: 'editing',
  }
  beginRxEditingSession()
  suspendRxAutosave.value = false
  syncRxBaseline()
  showRxDialog.value = true
}

function openEditRx(target) {
  const idx = resolvePrescriptionIndex(target)
  if (idx < 0) return
  const oldRx = form.value.prescriptions[idx]
  editingRxIdx.value = idx
  suspendRxAutosave.value = true
  rxForm.value = {
    ...oldRx,
    items: (oldRx.items || []).map((item) => ({ ...item })),
    rxStatus: oldRx?.rxStatus || getPrescriptionStatus(oldRx),
  }
  beginRxEditingSession()
  suspendRxAutosave.value = false
  syncRxBaseline()
  showRxDialog.value = true
}
```

- [ ] **Step 3: 把 autosave 的网络写入与 UI 回写拆开**

```js
async function persistRxDraftPayload(payload) {
  const consultationId = await ensureConsultationForPrescription()
  if (!consultationId) throw new Error(t('consultation.saveBefore'))
  return consultStore.syncPrescription(consultationId, {
    prescription: payload,
    totals: buildRxTotals(),
  })
}

async function syncPrescriptionDraft({ silent = true } = {}) {
  if (isReadOnly.value || suspendRxAutosave.value || !showRxDialog.value) return null
  const currentSnapshot = buildRxDraftSnapshot()
  if (shouldSkipRxAutosaveAfterSync({
    currentSnapshot,
    baselineSnapshot: rxEditorSnapshot.value,
  })) return null

  const payload = buildPrescriptionPayload(rxForm.value, 'editing')
  if (!shouldPersistRxDraft(payload)) return null

  const requestSessionId = rxEditingSessionId.value
  pendingRxAutosave.value = false
  rxAutosaving.value = true

  const autosaveTask = persistRxDraftPayload(payload)
  rxAutosavePromise = autosaveTask

  try {
    const updated = await autosaveTask
    if (shouldApplyRxAutosaveResult({
      requestSessionId,
      activeSessionId: rxEditingSessionId.value,
      showDialog: showRxDialog.value,
    })) {
      applySavedConsultation(updated)
      syncSavedSnapshot()
      syncRxFormFromConsultation(payload.id)
    }
    return updated
  } finally {
    if (rxAutosavePromise === autosaveTask) {
      rxAutosavePromise = null
    }
    rxAutosaving.value = false
    if (pendingRxAutosave.value && hasUnsavedRxDialogChanges.value) {
      pendingRxAutosave.value = false
      scheduleRxAutosave()
    }
  }
}
```

- [ ] **Step 4: 完成处方前先停掉背景 autosave，再做一次受控同步和完成**

```js
async function saveRx() {
  if (rxCompleting.value) return
  const rx = buildPrescriptionPayload(rxForm.value, 'pending')
  if (!hasPersistableRxDraft(rx)) {
    ElMessage.warning(t('admin.fillFormulaHerbs'))
    return
  }

  rxCompleting.value = true
  clearRxAutosaveTimer()
  pendingRxAutosave.value = false
  suspendRxAutosave.value = true

  try {
    await waitForRxAutosaveToFinish()

    const editingPayload = buildPrescriptionPayload(rxForm.value, 'editing')
    const synced = await persistRxDraftPayload(editingPayload)
    applySavedConsultation(synced)
    syncSavedSnapshot()
    syncRxFormFromConsultation(editingPayload.id)

    const consultationId = synced?.id || currentConsultationId.value
    if (!consultationId) throw new Error(t('consultation.saveBefore'))

    const updated = await consultStore.completePrescription(consultationId, editingPayload.id, {
      totals: buildRxTotals(),
    })
    applySavedConsultation(updated)
    syncSavedSnapshot()
    showRxDialog.value = false
  } catch (error) {
    ElMessage.error(error.message || t('common.operationFailed'))
  } finally {
    suspendRxAutosave.value = false
    rxCompleting.value = false
  }
}
```

- [ ] **Step 5: 运行处方 guard 测试，确认重构没破坏基础规则**

Run: `node --test tests/rxAutosaveGuard.test.js`

Expected:

```text
# tests 7
# pass 7
# fail 0
```

- [ ] **Step 6: 提交本任务**

```bash
git add src/views/consultations/ConsultationView.vue src/utils/rxAutosaveGuard.js tests/rxAutosaveGuard.test.js
git commit -m "fix: isolate rx completion from autosave"
```

### Task 3: 让关闭抽屉与外层列表完成动作都避开旧 autosave 回写

**Files:**
- Modify: `src/views/consultations/ConsultationView.vue`
- Test: `tests/rxAutosaveGuard.test.js`

- [ ] **Step 1: 关闭抽屉时让旧会话失效，并清掉排队 autosave**

```js
async function requestCloseRxDialog() {
  if (hasUnsavedRxDialogChanges.value) {
    const confirmed = await confirmUnsavedChanges('consultation.unsavedPrescriptionLeaveMessage')
    if (!confirmed) return
  }
  clearRxAutosaveTimer()
  pendingRxAutosave.value = false
  invalidateRxEditingSession()
  showRxDialog.value = false
}

function handleRxDialogClosed() {
  clearRxAutosaveTimer()
  pendingRxAutosave.value = false
  invalidateRxEditingSession()
  resetRxEditorState()
}
```

- [ ] **Step 2: 外层列表完成同一张处方前，先等该处方的 autosave 收尾**

```js
async function completeRxRow(row) {
  if (!row?.id || !currentConsultationId.value) return

  const isEditingSameRx = showRxDialog.value && rxForm.value.id === row.id
  if (isEditingSameRx) {
    clearRxAutosaveTimer()
    pendingRxAutosave.value = false
    invalidateRxEditingSession()
    await waitForRxAutosaveToFinish()
  }

  try {
    const updated = await consultStore.completePrescription(currentConsultationId.value, row.id, {
      totals: buildRxTotals(),
    })
    applySavedConsultation(updated)
    syncSavedSnapshot()
    if (isEditingSameRx) {
      showRxDialog.value = false
    }
    ElMessage.success(t('consultation.rxCompleted'))
  } catch (error) {
    ElMessage.error(error.message || t('common.operationFailed'))
  }
}
```

- [ ] **Step 3: 运行前端构建，确认模板与脚本联动正常**

Run: `npm run build`

Expected:

```text
vite build
exit 0
```

- [ ] **Step 4: 手工验证关键路径**

检查：

```text
1. 新建处方后，抽屉底部“完成处方”可以直接点击，不会被自动保存长期占用。
2. 点击取消关闭抽屉后，外层列表再点“完成处方”不会出现状态回退或持续转圈。
3. 完成成功后，处方状态稳定为 pending，不会被旧 autosave 回写成 editing。
```

- [ ] **Step 5: 提交本任务**

```bash
git add src/views/consultations/ConsultationView.vue
git commit -m "fix: cancel stale rx autosave on close and complete"
```
