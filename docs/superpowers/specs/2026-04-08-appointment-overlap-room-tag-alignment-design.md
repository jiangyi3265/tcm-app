# 预约排班 overlap / room / tag 对齐设计

## 背景

当前预约排班链路已经有一部分“医师排序 + 服务时长 + 诊室冲突 + 周视图”的实现，但实际代码里仍存在 3 个断层：

1. `practitionerTime` 只存在于服务类型数据里，没有真正进入预约冲突算法。
2. `requiredTag / supportTags` 在前端示例数据和管理页面里存在，但后端 mapper / controller / payload 并没有打通。
3. 公开预约与内部预约周视图仍以 30 分钟栅格为核心，无法稳定展示 `14:20` 这类非半小时起始时间。

这直接导致以下症状：

- 默认 20 分钟规则不能形成“医师并排、诊室持续占用”的效果。
- 14:20 之后的可约时间被错误吞掉。
- 选诊室后 14:20-15:00 整段被锁死。
- 内部日历已切成按分钟定位，但时间轴头部和点击栅格仍带着旧的 30 分钟/表格假设。

## 目标

1. 把预约冲突规则改成“双资源占用模型”：
   - 医师占用时间 = `practitionerTime`
   - 诊室占用时间 = `duration`
2. 把服务类型 `requiredTag` 和诊室 `supportTags` 从数据库映射到前后端完整打通。
3. 让内部预约与公开预约都能显示和选择 20 分钟规则下的起始时间，包括 `14:20`。
4. 保持现有自动匹配医师、按排序号分配、指定诊室过滤、公开预约匿名下单逻辑不回退。

## 非目标

- 不重做整套排班领域模型。
- 不新增“按具体日期例外停诊/加班”。
- 不修改工作时间录入规则，工作时间仍保持半小时粒度。
- 不引入新的排班表或资源表，优先复用现有 `tcm_service_type / tcm_room / tcm_appointment / tcm_clinic_setting`。

## 规则定义

### 1. 医师占用与诊室占用

- `duration` 表示服务总时长，也是诊室占用总时长。
- `practitionerTime` 表示医师实际占用时长。
- 若 `practitionerTime` 为空、非正数、或大于 `duration`，则回退为 `duration`。
- 冲突判断分两层：
  - 医师冲突判断区间：`[start, start + practitionerTime)`
  - 诊室冲突判断区间：`[start, start + duration)`

这意味着：

- 同一医师在 `practitionerTime` 结束后，可以在另一个可用诊室继续下一位。
- 同一诊室在 `duration` 结束前不能被复用。

### 2. tag 规则

- 服务类型通过 `requiredTag` 声明所需诊室能力。
- 诊室通过 `supportTags` 声明可承载的服务标签。
- 当服务 `roomRequired = true` 且存在 `requiredTag` 时：
  - 若用户显式选择诊室，则该诊室必须包含该 tag。
  - 若未显式选择诊室，则系统只在支持该 tag 的诊室中寻找可用房间。
- 当服务没有 `requiredTag` 时，沿用当前逻辑，不做 tag 过滤。

### 3. 起始时间步进

- 可预约起始时间不再强绑 30 分钟。
- 单医师可约列表按该医师的预约间隔生成。
- 聚合周视图采用“最细公共展示步进”：
  - 候选医师间隔的最小公约数与 10 分钟下限共同决定展示粒度。
  - 默认目标是能同时展示 `:00 / :20 / :30 / :40` 这类时间。
- 工作时间本身仍然是 30 分钟粒度，只作为可约范围边界，不决定起始时间粒度。

## 数据设计

### 服务类型

- 使用数据库字段 `tcm_service_type.required_tag`。
- 扩展：
  - `TcmServiceType`
  - `TcmServiceTypeMapper.xml`
  - `PayloadUtils.flattenServiceType`
  - `TcmSettingsController.updateServiceType`

### 诊室

- 为 `tcm_room` 增加 `support_tags` JSON 文本字段。
- 扩展：
  - `TcmRoom`
  - `TcmRoomMapper.xml`
  - `TcmSettingsServiceImpl.getBundle`
  - `TcmSettingsController.addRoom / updateRoom / flattenRoom`
  - `TcmPublicBookingController.buildRooms`

## 后端设计

### 1. 统一资源占用判断

在 `TcmAppointmentServiceImpl` 中新增统一的资源占用计算：

- 解析服务类型得到：
  - `durationMinutes`
  - `practitionerBusyMinutes`
  - `requiredTag`
  - `roomRequired`
- 校验指定诊室是否满足 tag。
- 当未指定诊室且服务需要诊室时，为每个候选医师尝试匹配一个满足 tag 且空闲的诊室。
- availability / weekly schedule / create / update 统一复用同一套占用判断。

### 2. 可约时间生成

- 单医师 availability：
  - 在工作时间段内按该医师间隔扫描起始时间。
  - 允许 `14:20` 之类时间进入结果。
  - 每个槽位返回实际分配的 `roomId`，供前端调试和后续展示。
- 聚合 availability：
  - 同一 `startTime` 汇总 `availablePractitionerIds`。
  - `assignedPractitionerId` 仍取排序号最优且当前可分配者。
- weekly schedule：
  - 单医师模式与聚合模式都返回 `slotStepMinutes`。
  - `days[].slots[]` 允许非 30 分钟起点。

### 3. checkSlot 语义修正

- `checkSlot` 恢复对“医师间隔/占用窗口”的真实校验，不再把 overlap 仅当扫描步长。
- 原有 `validatePractitionerInterval` 逻辑不再闲置，而是改造为基于 `practitionerBusyMinutes` 的占用判断。

## 前端设计

### 1. 内部预约页

- `AppointmentView.vue`
  - 保留现有按分钟定位的预约块布局。
  - 头部与列结构改成真正的两行布局，消除表头/时间轴错位。
  - 点击栅格和时间轴标签不再假设 30 分钟，而是跟随后端 `slotStepMinutes` 或回退 10 分钟。
  - 诊室下拉继续按 `requiredTag` 过滤，但依赖后端真实下发的 `requiredTag / supportTags`。

### 2. 公开预约页

- `PublicBookingView.vue`
  - 周表格使用后端 `slotStepMinutes` 渲染时间行。
  - 支持非 30 分钟起始槽位。
  - 在已选择具体医师或诊室时，严格按后端返回状态展示，不再自行推断 30 分钟覆盖关系。

### 3. 设置与缓存

- `settings` bundle 和 public booking options 都必须包含：
  - service type: `practitionerTime`, `roomRequired`, `requiredTag`
  - room: `supportTags`
- 前端本地缓存结构沿用现有 `settingsStore`，但不再依赖 `sampleData.js` 里的字段兜底。

## 测试策略

### 后端

- `TcmAppointmentServiceImplTest`
  - 同医师 + 不同诊室，在 `practitionerTime` 结束后允许下一位。
  - 同诊室在 `duration` 结束前继续拦截。
  - `14:20`、`14:40` 能出现在 availability。
  - 选择支持 tag 的诊室时可约；不支持 tag 的诊室时报错或过滤。
  - 聚合模式正确返回 `availablePractitionerIds / assignedPractitionerId`。

### 前端

- 补充与当前 DOM 对齐的 E2E：
  - 公开预约页能选中 20 分钟规则下的槽位并下单。
  - 内部预约页能打开新建抽屉并看到 14:20 类可约时间。
  - 移除对 `.available-pill / .appt-chip` 等旧 DOM 的依赖。

## 风险

- 当前工作区已有未提交改动，修复时必须在现有修改上叠加，不能回退。
- 数据库真实环境若尚未加 `required_tag / support_tags` 列，需要同步 SQL；测试环境因使用 mock，不会自动暴露此问题。
- 内部日历与公开预约一旦切到更细粒度，旧 E2E 选择器大概率全部失效，需要一起更新。
