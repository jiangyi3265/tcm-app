# Appointment Overlap Room Tag Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复预约排班中 `overlap / room / tag / 20 分钟步进 / 14:20 可约` 的前后端不一致问题。

**Architecture:** 后端把预约冲突改成“医师占用 + 诊室占用”双资源模型，并把 `requiredTag / supportTags` 数据链打通；前端内部预约与公开预约都改为消费后端返回的细粒度时间步进和状态矩阵。

**Tech Stack:** Vue 3 + Pinia + Element Plus, Spring Boot + MyBatis, Fastjson2, Playwright, JUnit 5 + Mockito

---

### Task 1: 打通服务类型与诊室标签数据链

**Files:**
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/domain/TcmRoom.java`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/domain/TcmServiceType.java`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/RuoYi-Vue/ruoyi-hospital/src/main/resources/mapper/hospital/TcmRoomMapper.xml`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/RuoYi-Vue/ruoyi-hospital/src/main/resources/mapper/hospital/TcmServiceTypeMapper.xml`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/utils/PayloadUtils.java`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmSettingsServiceImpl.java`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmSettingsController.java`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmPublicBookingController.java`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/RuoYi-Vue/sql/tcm_all_in_one.sql`

- [ ] **Step 1: 先写失败测试或断言目标**
  目标：
  - `flattenServiceType` 返回 `requiredTag`
  - room payload 返回 `supportTags`

- [ ] **Step 2: 扩展 mapper 与 domain**
  - 为 `tcm_service_type` 增加 `required_tag`
  - 为 `tcm_room` 增加 `support_tags`
  - mapper 完整读写这两个字段

- [ ] **Step 3: 打通 settings / public-booking 输出**
  - `settingsService.getBundle()` 返回完整 room/serviceType 元数据
  - `TcmSettingsController` 和 `TcmPublicBookingController` 都保留这些字段

- [ ] **Step 4: 运行后端相关测试**
  Run: `mvn -pl ruoyi-hospital -Dtest=TcmPublicBookingControllerTest test`
  Expected: PASS

### Task 2: 重构后端预约占用算法

**Files:**
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmAppointmentServiceImpl.java`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmAppointmentServiceImplTest.java`

- [ ] **Step 1: 写失败测试**
  覆盖：
  - `practitionerTime=20,duration=60` 时，14:20 可继续约
  - 同 room 仍冲突到 15:00
  - tag 不匹配时不可约
  - availability / weekly schedule 返回 `14:20`

- [ ] **Step 2: 实现统一服务约束解析**
  - 解析 `duration / practitionerTime / roomRequired / requiredTag`
  - 规范化 `practitionerBusyMinutes`

- [ ] **Step 3: 实现双资源冲突判断**
  - 医师冲突按 `practitionerBusyMinutes`
  - 诊室冲突按 `duration`
  - 未指定 room 时自动在匹配 tag 的诊室中选可用房间

- [ ] **Step 4: 修复 availability / weekly schedule 步进**
  - 单医师扫描按间隔
  - 周视图返回 `slotStepMinutes`
  - 允许 20 分钟起点

- [ ] **Step 5: 跑目标测试**
  Run: `mvn -pl ruoyi-hospital -Dtest=TcmAppointmentServiceImplTest test`
  Expected: PASS

### Task 3: 前端 settings / API / 本地缓存对齐

**Files:**
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/hospital/src/stores/settings.js`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/hospital/src/utils/api.js`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/hospital/src/utils/sampleData.js`

- [ ] **Step 1: 对齐前端接收字段**
  - settings bundle 与 public booking options 能保留 `requiredTag / supportTags / practitionerTime`

- [ ] **Step 2: 确保本地示例数据与后端字段一致**
  - sample data 只作为 fallback，不与后端字段冲突

- [ ] **Step 3: 本地 smoke 检查**
  - 确认 `buildQuery` / `publicBookingApi.schedule` 可携带新的 `slotStepMinutes` 消费路径，不破坏旧接口

### Task 4: 修复内部预约页日历与可约时间展示

**Files:**
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/hospital/src/views/appointments/AppointmentView.vue`

- [ ] **Step 1: 拆出失败场景**
  - 表头/时间轴错位
  - 20 分钟起点不能显示
  - 可约点击栅格仍按旧 30 分钟假设

- [ ] **Step 2: 改造布局**
  - 修正头部 DOM 结构
  - 统一分钟定位基准
  - 日历点击层按细粒度步进生成

- [ ] **Step 3: 改造创建预约抽屉**
  - 直接展示后端返回的细粒度 availability
  - 诊室筛选依赖真实 `requiredTag / supportTags`

- [ ] **Step 4: 补一个最小可回归验证**
  - 至少确保页面代码不再依赖 `.available-pill / .appt-chip`

### Task 5: 修复公开预约页周视图与 E2E

**Files:**
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/hospital/src/views/public/PublicBookingView.vue`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/hospital/tests/e2e/smoke.spec.js`

- [ ] **Step 1: 周视图消费 `slotStepMinutes`**
  - 时间行按后端步进生成
  - 非 30 分钟槽位可点击

- [ ] **Step 2: 覆盖关系完全按后端返回渲染**
  - 不再自行假设 30 分钟覆盖
  - `14:20` 槽位在周表可见

- [ ] **Step 3: 更新 E2E 选择器**
  - 公开预约和内部预约冒烟用例与当前 DOM 对齐
  - 删除对旧 `.available-pill / .appt-chip / .page-title` 的强耦合

- [ ] **Step 4: 跑前端 E2E 或最小冒烟**
  Run: `npm run test:e2e -- --grep "预约"`
  Expected: 关键预约冒烟通过；若环境不足，记录阻塞

### Task 6: 全量验证

**Files:**
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/hospital/tests/e2e/smoke.spec.js`
- Modify: `C:/Users/jiangyi/Desktop/项目/未完成/医院/RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmAppointmentServiceImplTest.java`

- [ ] **Step 1: 跑后端目标测试**
  Run: `mvn -pl ruoyi-hospital -Dtest=TcmAppointmentServiceImplTest,TcmPublicBookingControllerTest test`
  Expected: PASS

- [ ] **Step 2: 跑前端构建**
  Run: `npm run build`
  Expected: PASS

- [ ] **Step 3: 跑前端 node 测试**
  Run: `npm test`
  Expected: PASS

- [ ] **Step 4: 总结剩余风险**
  - 数据库实际环境是否已执行 SQL 变更
  - 旧预约数据对新 tag/room 规则的兼容情况
