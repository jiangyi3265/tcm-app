# Invoice 栏付款入口与 POS 模拟 Design

**日期：** 2026-04-06

## 目标
在诊疗页 `Invoice` 发票栏内增加“创建发票并开始付费”入口，让 `admin` 与 `cashier` 可直接依据当前 `Pricing` 信息发起一次付款流程；其中 `bankcard` 走系统内 POS 模拟流程，`etransfer` 与 `cash` 直接完成付款并记录支付结果。

## 范围
### 包含
- 诊疗页 `Invoice` 标签页权限改为仅 `admin` / `cashier` 可见。
- `Invoice` 标签页在“当前诊疗已保存且仍有未付金额”时展示付款入口按钮。
- 付款界面固定使用当前未付金额作为本次付款金额，不支持手工输入部分付款。
- 支付方式限定为：`bankcard`、`etransfer`、`cash`。
- `bankcard` 进入系统内 POS 模拟成功/取消流程。
- `etransfer`、`cash` 直接调用现有付款接口并将状态改为已付款。
- 成功付款后仅新增 `paymentRecords`，不新增独立 invoice 草稿/记录。
- 同步更新相关页面中的支付方式显示文案，避免 `card/transfer/manual` 与新方案混杂。

### 不包含
- 不接入真实 POS 硬件或外部支付接口。
- 不支持部分付款。
- 不新增独立发票模型、发票草稿、发票编号流水。
- 不修改后端支付结算核心算法，只复用现有 `/api/consultations/{id}/payments`。

## 当前实现现状
1. 诊疗页 `ConsultationView.vue` 已有 `Invoice` 标签页与付款摘要，但当前标签页对角色未做收口，仅页头存在一个 `Record Payment` 按钮。
2. 付款接口已存在：`consultationsStore.markAsPaid()` -> `consultationsApi.createPayment()`。
3. 当前系统的支付方式文案在 `CashierView` / `PharmacyView` 里仍是旧集合：`cash / card / wechat / alipay / transfer / other`。
4. 当前支付记录是 `paymentRecords`，前端通过 `getPaymentRecords / getPaymentStatus / getOutstandingAmount` 计算付款状态。

## 采用方案
### 方案 A（采用）
直接在 `ConsultationView` 的 `Invoice` 标签页内实现付款入口与 POS 模拟流程，并继续复用现有付款记录模型与付款 API。

**理由：**
- 最符合“在 invoice 发票栏创建按钮并开始付费过程”的需求。
- 改动最小，不引入新数据模型。
- 与现有 `CashierView` 的付款链路一致，维护成本低。

### 方案 B（不采用）
抽一个通用支付组件，同时重构 `CashierView` / `PharmacyView` / `ConsultationView`。

**不采用原因：**
- 范围过大，会把当前小需求变成一次支付 UI 重构。
- 现阶段用户目标是尽快在诊疗页内完成收款入口，而不是统一全站架构。

### 方案 C（不采用）
在 `Invoice` 栏点击后跳转到 `CashierView` 去完成付款。

**不采用原因：**
- 与“在当前 invoice 栏发起付款”的操作预期不一致。
- 页面跳转增加使用成本，尤其在平板端体验较差。

## 详细交互设计
### 1. Invoice 标签页权限
`Invoice` 标签页仅在以下角色可见：
- `admin`
- `cashier`

其它角色（如 `practitioner`）完全看不到该标签页。

### 2. 付款入口按钮显示条件
在 `Invoice` 标签页内显示按钮：
**创建发票并开始付费**

显示条件同时满足：
1. 当前诊疗记录已保存（存在 `currentConsultationId` / `form.id`）
2. 当前未付金额 `outstandingAmount > 0`

不满足时：
- 未保存：不显示按钮
- 已付清：不显示按钮

### 3. 当前发票预览
`Invoice` 标签页继续展示基于当前 `Pricing` 计算的发票预览，包括：
- 服务项目
- subtotal
- tax
- total
- paid amount
- balance amount

即便还没有任何付款记录，也可展示当前待付款发票预览。

### 4. 付款弹窗/抽屉
点击“创建发票并开始付费”后，打开付款弹窗（建议用 `el-dialog`，因为这是一次短流程确认，而不是复杂侧边编辑）。

弹窗展示：
- 患者姓名
- 诊疗日期 / 诊疗编号
- 当前发票摘要
- 本次付款金额（只读，固定等于当前未付金额）
- 支付方式选择：
  - `bankcard`
  - `etransfer`
  - `cash`

### 5. bankcard -> POS 模拟流程
当支付方式为 `bankcard` 时：
1. 点击确认付款
2. 不直接写付款记录，而是弹出第二个 `POS 支付中` 模态框
3. 模态框展示：
   - POS 已连接
   - 正在等待刷卡 / 插卡 / 感应
   - 当前金额
4. 用户可选：
   - **支付成功**
   - **取消**

#### 支付成功
- 调用现有付款接口
- 提交：
  - `paymentMethod: 'bankcard'`
  - `amount: outstandingAmount`
- 刷新当前诊疗数据
- `paymentRecords` 增加一条记录
- `paymentStatus` 变为 `paid`
- 关闭 POS 模态框与付款弹窗

#### 取消
- 不写付款记录
- 不改变付款状态
- 关闭 POS 模态框，保留付款弹窗供再次选择或关闭

### 6. etransfer / cash 流程
当支付方式为：
- `etransfer`
- `cash`

点击确认付款后：
- 直接调用现有付款接口
- 分别写入对应 `paymentMethod`
- 刷新当前诊疗数据
- 将付款状态改为 `paid`
- 关闭付款弹窗

### 7. 页头按钮处理
为避免同一页面出现两个付款入口，诊疗页头当前的 `Record Payment` 按钮应移除或隐藏。

付款入口统一只保留在 `Invoice` 标签页内。

### 8. 支付方式统一
本次支付方式标准值统一为：
- `bankcard`
- `etransfer`
- `cash`

需要同步调整以下页面/区域的显示文案与映射：
- `ConsultationView`
- `CashierView`
- `PharmacyView`
- 支付历史记录 method 展示

目标是让系统内不再混用：
- `card`
- `transfer`
- `manual`
- `wechat`
- `alipay`
- `other`

其中旧记录若存在历史数据，可在展示层做兼容映射；新产生的记录统一写入新值。

## 数据流
### 打开付款弹窗
`ConsultationView` 当前表单 -> 读取 `Pricing` 计算值 -> 生成付款界面展示数据

### 完成付款
付款弹窗确认 ->
- `bankcard`：先进入 POS 模拟 -> 成功后调用 `consultationsStore.markAsPaid(id, { paymentMethod, amount })`
- `etransfer` / `cash`：直接调用 `consultationsStore.markAsPaid(id, { paymentMethod, amount })`

接口返回最新 consultation -> 刷新 `form` -> 刷新 `paymentRecords` / `paymentStatus` / `paidAmount` / `outstandingAmount`

## 边界条件
1. **未保存诊疗**：不显示付款按钮，避免对不存在的 consultation id 发起付款。
2. **已付清**：不显示付款按钮，只展示历史付款记录与已付款状态。
3. **POS 取消**：不得写入任何付款记录。
4. **付款接口失败**：保留弹窗，显示错误信息，不变更状态。
5. **旧支付方式兼容**：历史记录允许显示旧值，但新记录全部使用三种新值。

## 验收标准
1. 只有 `admin` / `cashier` 能看见 `Invoice` 标签页。
2. 标签页内在“已保存 + 未付金额 > 0”时显示“创建发票并开始付费”按钮。
3. 选择 `cash` 后确认付款，可直接变为已付款。
4. 选择 `etransfer` 后确认付款，可直接变为已付款。
5. 选择 `bankcard` 后先进入 POS 模拟流程。
6. POS 模拟点“成功”后才写付款记录。
7. POS 模拟点“取消”后不写付款记录。
8. 付款成功后只新增 `paymentRecords`，不新增独立 invoice 草稿/记录。
9. 付款成功后 `Invoice` 标签页能即时刷新付款状态与付款历史。
