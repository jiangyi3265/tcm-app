# Consultation Copy Persist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复已有诊疗记录执行“全部拷贝到当前”时，拷贝内容被处方同步返回的旧数据覆盖的问题。

**Architecture:** 把诊疗拷贝后的持久化决策抽到独立辅助函数中：已有诊疗记录且包含处方时，直接保存整张诊疗单；新建诊疗记录时，保留原有“创建记录后同步处方”的路径。这样既修复覆盖问题，也能继续复用现有库存联动逻辑。

**Tech Stack:** Vue 3、Node `node:test`

---

### Task 1: 抽离拷贝持久化决策

**Files:**
- Create: `docs/superpowers/specs/2026-04-06-consultation-copy-persist-design.md`
- Create: `hospital/src/utils/consultationCopyFlow.js`
- Modify: `hospital/src/views/consultations/ConsultationView.vue`
- Test: `hospital/tests/consultationCopyFlow.test.js`

- [ ] 提炼已有记录/新建记录的不同持久化策略。
- [ ] 让 `ConsultationView.vue` 调用辅助函数而不是把判断散落在事件处理函数中。
- [ ] 保持无处方时仍只更新表单，不额外强制保存。

### Task 2: 回归测试

**Files:**
- Create: `hospital/tests/consultationCopyFlow.test.js`

- [ ] 覆盖“已有诊疗 + 含处方 -> 走整单保存，不走逐处方同步”。
- [ ] 覆盖“新建诊疗 + 含处方 -> 仍走逐处方同步”。
- [ ] 覆盖“无处方 -> 不触发任何持久化”。

### Task 3: 验证

**Files:**
- Modify: `hospital/src/views/consultations/ConsultationView.vue`
- Create: `hospital/tests/consultationCopyFlow.test.js`

- [ ] 运行 `npm test -- consultationCopyFlow.test.js consultationCopy.test.js consultationInventorySync.test.js`
- [ ] 如测试通过，再汇报修复结果与影响范围。
