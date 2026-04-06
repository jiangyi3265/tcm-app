# History Compare Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一两处历史对比导航为“左旧右新”，并把编号改成按时间顺序显示。

**Architecture:** 抽一个轻量级历史导航工具函数，专门处理“最近在前”的数组如何计算显示编号、左/右按钮的下一索引。两个页面都只消费同一套规则，避免再次出现一处修好另一处相反的问题。

**Tech Stack:** Vue 3、Node `node:test`

---

### Task 1: 抽离历史导航规则

**Files:**
- Create: `src/utils/historyCompareNavigation.js`
- Test: `tests/historyCompareNavigation.test.js`

- [ ] 写失败测试，覆盖默认最新显示为 `N/N`、左旧右新、边界禁用状态。
- [ ] 写最小实现，提供显示序号与左右翻页索引计算。
- [ ] 运行 `node --test tests/historyCompareNavigation.test.js` 确认通过。

### Task 2: 接入诊疗对比弹窗

**Files:**
- Modify: `src/views/consultations/ConsultationComparePanel.vue`
- Test: `tests/historyCompareNavigation.test.js`

- [ ] 用工具函数替换当前左右翻页逻辑。
- [ ] 把顶部编号从 `selectedIdx + 1` 改成按时间顺序编号。
- [ ] 保持默认仍选中最近记录。

### Task 3: 接入病人详情历史对比

**Files:**
- Modify: `src/views/patients/PatientDetailView.vue`
- Test: `tests/historyCompareNavigation.test.js`

- [ ] 用工具函数统一左右翻页逻辑。
- [ ] 在导航中补充时间顺序编号。
- [ ] 运行 `node --test tests/historyCompareNavigation.test.js tests/consultationCopyFlow.test.js tests/consultationCopy.test.js tests/consultationInventorySync.test.js`。
- [ ] 运行 `npm run build`。
