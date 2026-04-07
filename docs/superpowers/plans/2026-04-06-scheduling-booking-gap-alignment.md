# 排班/预约差异对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不推翻现有排班/预约体系的前提下，把病历访问有效期、半小时排班粒度和公开预约周视图补齐到当前业务要求。

**Architecture:** 继续复用现有用户资料 `remark`、预约可用性计算和公开预约创建流程；后端新增匿名周视图状态接口，前端升级为可视化周网格；权限窗口和半小时规则前后端同时收口，避免口径漂移。

**Tech Stack:** Vue 3 + Pinia + Element Plus, Node test runner, Spring Boot + Maven + JUnit

---

### Task 1: 后端规则对齐与公开周视图接口

**Files:**
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/RuoYi-Vue/codex-scheduling-booking-gap/ruoyi-hospital/src/main/java/com/ruoyi/hospital/utils/PrivacyUtils.java`
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/RuoYi-Vue/codex-scheduling-booking-gap/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmUserController.java`
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/RuoYi-Vue/codex-scheduling-booking-gap/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmPublicBookingController.java`
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/RuoYi-Vue/codex-scheduling-booking-gap/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmAppointmentServiceImpl.java`
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/RuoYi-Vue/codex-scheduling-booking-gap/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmAppointmentServiceImplTest.java`

- [ ] 把非主治医生近期病历访问窗口从 7 天改成 3 天，但不影响主治医生永久访问与实习生现有 3 天窗口。
- [ ] 在用户资料工作时间规范化逻辑中增加半小时粒度校验和非法时间过滤。
- [ ] 在预约服务中新增公开周视图状态构建逻辑，并暴露匿名 `schedule` 接口。
- [ ] 为 3 天权限、半小时校验、公开周视图补后端测试。

### Task 2: 前端排班编辑器与公开预约周视图

**Files:**
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/hospital/codex-scheduling-booking-gap/src/views/admin/AdminView.vue`
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/hospital/codex-scheduling-booking-gap/src/views/appointments/AppointmentView.vue`
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/hospital/codex-scheduling-booking-gap/src/views/public/PublicBookingView.vue`
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/hospital/codex-scheduling-booking-gap/src/utils/api.js`
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/hospital/codex-scheduling-booking-gap/src/i18n/zh-CN.js`
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/hospital/codex-scheduling-booking-gap/src/i18n/en.js`

- [ ] 把管理员和医师个人排班编辑器改成 30 分钟步进输入，并在保存前校验时间合法性与时间段不重叠。
- [ ] 公开预约页新增按周切换的时间表视图，显示工作时段、占用时段与可预约时段。
- [ ] 保持已存在的无医师自动匹配、提交创建预约和成功态展示逻辑。
- [ ] 补齐公开周视图新增文案与接口调用。

### Task 3: 前端权限规则与测试

**Files:**
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/hospital/codex-scheduling-booking-gap/src/utils/permissions.js`
- Modify: `C:/Users/jiangyi/.config/superpowers/worktrees/hospital/codex-scheduling-booking-gap/tests/permissions.test.js`

- [ ] 将非主治医生的近期病历可见期由 7 天改为 3 天。
- [ ] 保持实习生 3 天窗口和主治医生永久可见测试不回退。
- [ ] 为前端权限规则补回归测试。

### Task 4: 集成验证

**Files:**
- Verify only

- [ ] 在前端 worktree 运行 `npm install`，然后运行 `node --test tests/permissions.test.js`。
- [ ] 在前端 worktree 运行 `npm test` 与 `npm run build`。
- [ ] 在后端 worktree 运行 `mvn -Dtest=TcmAppointmentServiceImplTest test`，必要时补跑新增权限测试。
- [ ] 记录未做手工联调的风险，特别是公开预约周视图的最终视觉表现。
