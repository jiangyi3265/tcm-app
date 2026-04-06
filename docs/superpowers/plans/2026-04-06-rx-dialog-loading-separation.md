# Rx Dialog Loading Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复新处方弹窗里“完成处方”按钮被自动保存长期占用的问题，避免按钮不可点和外层完成按钮转圈卡住。

**Architecture:** 保持现有处方自动保存流程不变，只把自动保存与手动完成拆成两个独立状态。手动完成前先等待在途自动保存结束，再执行完成接口，避免并发竞争和状态错乱。

**Tech Stack:** Vue 3、Element Plus、Pinia、Vite

---

### Task 1: 拆分处方弹窗状态

**Files:**
- Modify: `hospital/src/views/consultations/ConsultationView.vue`

- [ ] **Step 1: 明确自动保存与手动完成的状态边界**

目标：

```js
// 自动保存使用独立状态
const rxAutosaving = ref(false)

// 手动完成使用独立状态
const rxCompleting = ref(false)
```

- [ ] **Step 2: 让自动保存只控制自己的状态**

目标：

```js
async function syncPrescriptionDraft({ silent = true } = {}) {
  // ...
  rxAutosaving.value = true
  try {
    // 保持现有 syncPrescription 调用
  } finally {
    rxAutosaving.value = false
  }
}
```

- [ ] **Step 3: 让手动完成等待自动保存结束**

目标：

```js
async function waitForRxAutosaveToFinish() {
  while (rxAutosaving.value) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

async function saveRx() {
  await waitForRxAutosaveToFinish()
  rxCompleting.value = true
  try {
    // 先同步草稿，再 completePrescription
  } finally {
    rxCompleting.value = false
  }
}
```

- [ ] **Step 4: 把按钮 loading 切到手动完成状态**

目标：

```vue
<el-button type="primary" :loading="rxCompleting" @click="saveRx">
  {{ t('consultation.completeRx') }}
</el-button>
```

### Task 2: 验证回归

**Files:**
- Modify: `hospital/src/views/consultations/ConsultationView.vue`

- [ ] **Step 1: 检查新处方弹窗关闭时是否复位状态**

目标：

```js
function resetRxEditorState() {
  pendingRxAutosave.value = false
  rxAutosaving.value = false
  rxCompleting.value = false
}
```

- [ ] **Step 2: 运行前端构建验证**

Run:

```bash
npm run build
```

Expected:

```text
vite build exit 0
```

- [ ] **Step 3: 手工验收要点**

检查：

```text
1. 新建处方后，自动保存期间按钮不应长时间锁死。
2. 点击“完成处方”时，只显示手动完成的 loading。
3. 取消弹窗后，外层列表不应出现无限转圈。
```
