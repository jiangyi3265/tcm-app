# 医师排班与预约/人员扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成医师排班、自动匹配预约、人员扩展、实习权限、公开预约的前后端联动实现。

**Architecture:** 用户扩展字段继续落在 `sys_user.remark` JSON；预约可用时间由后端统一计算，前端只渲染结果；公开预约复用同一套排班/可用性逻辑；实习权限集中收口到 `PrivacyUtils`。

**Tech Stack:** Vue 3 + Pinia + Element Plus, Spring Boot + MyBatis, Fastjson2, Day.js

---

### Task 1: 后端用户资料与权限模型扩展

**Files:**
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmUserController.java`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmBootstrapController.java`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/utils/PrivacyUtils.java`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/controller/TcmUserControllerTest.java`

- [ ] 扩展 `TcmUserController` remark 字段映射，支持 `practitionerSortOrder / serviceKeys / internshipDates / workingHours`。
- [ ] 新增实习签到接口，向 `internshipDates` 追加当天日期。
- [ ] 在 bootstrap 输出这些字段。
- [ ] 将 apprentice 的病历可见规则改为“实习日期起 3 天内只读可见”。
- [ ] 为新增字段与签到接口补控制器测试。

### Task 2: 后端预约可用性与公开预约接口

**Files:**
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmAppointmentServiceImpl.java`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmAppointmentController.java`
- Add: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmPublicBookingController.java`
- Modify: `RuoYi-Vue/ruoyi-framework/src/main/java/com/ruoyi/framework/config/SecurityConfig.java`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmAppointmentServiceImplTest.java`

- [ ] 在预约服务中增加按服务时长、排班段、预约间隔、排序号计算可用槽位的能力。
- [ ] 内部预约接口新增 availability 查询，create 支持未传医师时自动分配。
- [ ] 新增匿名公开预约元数据/可用性/创建接口。
- [ ] 将公开预约接口加入匿名放行。
- [ ] 为自动分配和排班段计算补服务测试。

### Task 3: 后端员工自动建档与服务权限

**Files:**
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmUserController.java`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/utils/PayloadUtils.java`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmPatientServiceImpl.java`

- [ ] 用户创建/更新时自动创建或同步 `linkedUserId` 对应病人档案。
- [ ] 保持病人 payload 可透传员工标记字段。
- [ ] 让旧数据无 `serviceKeys` 时按全量服务兼容。

### Task 4: 前端用户管理与排班编辑器

**Files:**
- Modify: `hospital/src/views/admin/AdminView.vue`
- Modify: `hospital/src/stores/auth.js`
- Modify: `hospital/src/utils/api.js`
- Modify: `hospital/src/i18n/zh-CN.js`
- Modify: `hospital/src/i18n/en.js`

- [ ] 用户表单增加排序号、服务权限、组织资料、地址、实习记录、今日签到按钮。
- [ ] 将排班编辑器从“单段 start/end”改为“每天多个时间段”。
- [ ] 接通用户更新与实习签到 API。
- [ ] 补齐中英文文案。

### Task 5: 前端预约页与公开预约页

**Files:**
- Modify: `hospital/src/views/appointments/AppointmentView.vue`
- Modify: `hospital/src/stores/appointments.js`
- Modify: `hospital/src/router/index.js`
- Add: `hospital/src/views/public/PublicBookingView.vue`
- Modify: `hospital/src/utils/api.js`
- Modify: `hospital/src/utils/dateUtils.js`

- [ ] 内部预约页改为周视图半小时网格。
- [ ] 指定医师时显示上班时段和预约；不指定医师时显示聚合可约时段。
- [ ] 新建预约改为通过 availability 接口取时间。
- [ ] 新增公开预约页面、路由和匿名 API 调用。

### Task 6: 前端服务权限过滤与验证

**Files:**
- Modify: `hospital/src/views/consultations/ConsultationView.vue`
- Modify: `hospital/src/views/cashier/CashierView.vue`
- Modify: `hospital/src/utils/permissions.js`
- Modify: `hospital/tests/permissions.test.js`

- [ ] 问诊服务下拉按当前医师 `serviceKeys` 过滤。
- [ ] 收银新增/选择服务时只提供授权范围内服务。
- [ ] apprentice 访问判断改为 3 天实习窗口。
- [ ] 增加前端权限测试。

### Task 7: 验证

**Files:**
- Modify: `hospital/tests/*.test.js`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/*.java`

- [ ] 运行前端 `npm test`。
- [ ] 运行前端 `npm run build`。
- [ ] 运行后端目标测试。
- [ ] 记录未覆盖的边界与风险。

