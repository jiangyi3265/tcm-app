# 草药主数据绑定库存与方剂设计

**日期：** 2026-04-06

## 目标

解决当前“新增供应商库存时要重复录入草药性味归经”的问题，收口为：

- 草药是独立主数据，只在草药字典维护一次
- `raw_herbs` 库存必须从系统已有草药字典中选择
- 方剂药味必须从系统已有草药字典中选择
- 粉剂和成药暂不纳入这次强约束范围

本次目标不是重构整个中药业务模型，而是在现有 `herbDictId` 已存在的基础上，把录入流程真正收口到主数据。

## 当前现状

### 已有基础

- 后端已经存在草药字典表 `tcm_herb_dict`
- 后端库存表 `tcm_inventory_item` 已有 `herb_dict_id`
- 后端方剂明细表 `tcm_formula_item` 已有 `herb_dict_id`
- 前端处方计算和库存匹配已经支持 `herbDictId` 优先匹配

### 当前问题

#### 库存侧

- 库存页新增 `raw_herbs` 时，药名是自由输入
- 性味、归经、毒性、功效、禁忌等仍在库存表单中重复录入
- 同一味草药换一个供应商，就会在库存里重复维护一套草药属性

#### 方剂侧

- 方剂页和管理页新增药味时，药名也是自由输入
- 旧数据里的 `herbDictId` 有时能保留，但新加药味不会强制绑定字典
- 因此系统里同时存在“有字典引用的方剂药味”和“纯文本药味”

### 业务后果

- 草药属性没有唯一来源
- 草药字典、库存、方剂三处信息容易不一致
- 后续修改草药性味时，库存和方剂无法自然联动

## 方案对比

### 方案 A：只做前端联动，不改职责

- 库存新增时从草药字典选择名称
- 自动带出性味后仍保存到库存 payload
- 方剂仍同时接受自由文本和字典引用

**优点：**

- 改动小
- 页面很快能看到联动效果

**缺点：**

- 数据仍然重复
- 后续仍会出现草药字典和库存、方剂内容不一致

### 方案 B：草药字典做唯一主数据，本次采用

- 草药属性只在草药字典维护
- `raw_herbs` 库存只保存库存维度数据，并强制绑定 `herbDictId`
- 方剂药味只保存剂量模板数据，并强制绑定 `herbDictId`
- 名称保留为快照字段，便于展示和兼容旧逻辑

**优点：**

- 符合用户业务口径
- 充分复用现有 `herbDictId` 能力
- 不需要新增数据库字段
- 后续维护成本最低

**缺点：**

- 需要同时收口前端录入和后端校验
- 需要兼容旧的未绑定数据

### 方案 C：库存彻底只存 `herbDictId`

- 库存不再保留名称快照
- 展示完全依赖草药字典联表或映射

**不采用原因：**

- 会牵动现有搜索、展示、导入、历史数据兼容
- 这次需求不需要做到这么激进

## 本次确认口径

### 1. 草药字典职责

草药字典是草药主数据的唯一来源，负责维护：

- 名称
- 别名
- 拼音
- 分类
- 性味
- 归经
- 功效
- 主治
- 用量范围
- 禁忌

这些信息不再由库存页重复录入。

### 2. 库存职责

库存记录表达的是“某草药在某供应商、某分院、某库存形态下的可用库存”，负责维护：

- `herbDictId`
- `name`
- `category`
- `unit`
- `quantity`
- `pricePerUnit`
- `minStockLevel`
- `supplierId`
- `supplier`
- `gramsPerPacket`
- `branchId`

其中：

- `raw_herbs` 必须绑定 `herbDictId`
- `powder` 和 `pills` 维持现状，不强制绑定
- `name` 保留，但由系统根据草药字典名称回写，不再允许用户自由输入

### 3. 方剂职责

方剂模板中的药味表达的是“某草药 + 默认剂量 + 单位 + 备注”，负责维护：

- `herbDictId`
- `herbName`
- `dosage`
- `unit`
- `sortOrder`
- `notes`

其中：

- 每一味药必须绑定 `herbDictId`
- `herbName` 保留为快照字段，由系统根据草药字典名称回写
- 不再允许自由文本新增药味

## 详细设计

### 1. 前端库存页

目标文件：

- `hospital/src/views/inventory/InventoryView.vue`
- `hospital/src/stores/inventory.js`

#### 1.1 新增库存

当当前标签页为 `raw_herbs` 时：

- 名称字段改为可搜索下拉
- 候选来源为 `herbDictStore.activeHerbs`
- 用户只能选择系统已有草药，不能自由输入
- 选择后自动写入：
  - `newItem.herbDictId`
  - `newItem.name`

#### 1.2 编辑库存

当编辑的是 `raw_herbs` 库存时：

- 药名同样改为可搜索下拉
- 重新选择后同步更新 `editForm.herbDictId` 和 `editForm.name`
- 若旧数据没有 `herbDictId`，进入编辑后必须补绑字典

#### 1.3 表单字段收口

库存页新增/编辑表单中，以下草药属性字段从 `raw_herbs` 录入区移除：

- `nature`
- `taste`
- `guijing`
- `toxicity`
- `functionsAndIndications`
- `contraindications`
- `aliases`

这些字段后续仅由草药字典维护。

#### 1.4 列表展示

库存列表中的“性味归经”列改为：

- 优先通过 `row.herbDictId` 去草药字典读取并展示
- 若旧数据尚未绑定字典，则回退显示库存 payload 里的旧字段
- 回退只用于兼容显示，不再作为新增编辑来源

#### 1.5 批量导入

批量导入也是库存写入口，本次必须同步收口：

- `powder` 和 `pills` 维持现状
- `raw_herbs` 导入时，不允许再生成未绑定字典的库存
- 后端按导入行中的药名去匹配系统内有效草药字典
- 若能唯一匹配，则自动补写 `herbDictId` 并保存
- 若无法匹配或匹配不唯一，则该行失败，并在导入结果中返回错误

这样既保留现有批量导入入口，又不破坏“草药必须来自系统已有字典”的总原则

### 2. 前端方剂页与管理页

目标文件：

- `hospital/src/views/formulas/FormulaView.vue`
- `hospital/src/views/admin/AdminView.vue`
- 可复用逻辑参考 `hospital/src/views/consultations/ConsultationView.vue`

#### 2.1 方剂页

在主方剂页中：

- 新增药味时，`herbName` 改为可搜索下拉
- 候选来源为草药字典
- 用户选中后写入：
  - `herbDictId`
  - `herbName`
- 不再接受纯文本药名

#### 2.2 管理页中的方剂编辑器

管理页中现有重复的方剂新增/编辑入口也必须同步改造，保持与主方剂页一致：

- 新增药味必须从草药字典选择
- 编辑药味必须保留并维护 `herbDictId`
- 不允许出现一边强制绑定、一边仍可自由输入的双轨行为

#### 2.3 可复用能力

优先复用诊疗页现有草药查询逻辑，而不是再造一套查询规则：

- 使用草药字典 store 提供的查询能力
- 保持搜索体验、选择结果结构与诊疗页尽量一致

### 3. 后端库存校验

目标文件：

- `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmInventoryController.java`
- `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/utils/PayloadUtils.java`
- 必要时补充 service 层校验

#### 3.1 校验规则

保存库存时：

- 若 `category = raw_herbs`，则 `herbDictId` 必填
- 若未传或传入不存在的草药字典 ID，则拒绝保存
- 校验通过后，后端根据草药字典名称回写 `name`

#### 3.2 兼容规则

- `powder` 和 `pills` 不强制校验 `herbDictId`
- 旧库存读取不受影响
- 旧库存只有在被编辑保存时，才要求补绑字典
- `raw_herbs` 批量导入不要求前端额外传 `herbDictId`，但后端必须按药名字典匹配后再入库

### 4. 后端方剂校验

目标文件：

- `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmFormulaController.java`
- `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/utils/PayloadUtils.java`
- `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmFormulaServiceImpl.java`

#### 4.1 校验规则

保存方剂时：

- 每一味药都必须有 `herbDictId`
- 若有任一药味缺失 `herbDictId` 或引用不存在，则拒绝保存
- 后端根据草药字典名称回写 `herbName`

#### 4.2 数据保留策略

- 继续保留 `herbName` 字段，兼容现有展示和旧接口消费方
- 继续保留 `herbDictId` 作为库存匹配与后续联动的主键

## 数据流

### 1. 新增 raw_herbs 库存

1. 用户打开库存页 `raw_herbs`
2. 从草药字典下拉选择一个草药
3. 前端写入 `herbDictId + name`
4. 用户填写供应商、数量、价格等库存字段
5. 后端校验 `herbDictId`
6. 后端按草药字典回写标准名称后保存

### 2. 新增方剂药味

1. 用户新增一味药
2. 从草药字典下拉选择一个草药
3. 前端写入 `herbDictId + herbName`
4. 用户填写剂量、单位、备注
5. 后端逐项校验并回写标准名称
6. 保存到 `tcm_formula_item`

### 3. 处方导入方剂

1. 方剂模板保留 `herbDictId`
2. 导入诊疗处方时继续把 `herbDictId` 带入
3. 处方换算与库存匹配仍优先使用 `herbDictId`

## 异常处理

### 1. 未绑定草药字典

- `raw_herbs` 库存未绑定字典时，前端禁止提交
- 即使绕过前端，后端也必须拒绝保存

### 2. 草药字典项不存在或被停用

- 前端下拉默认只展示有效草药
- 若旧数据绑定了失效字典项，列表仍可展示历史快照
- 编辑保存时要求重新选择有效草药

### 3. 旧数据兼容

- 老库存、老方剂如果没有 `herbDictId`，仍允许读取和展示
- 展示时按旧 `name` 回退
- 用户一旦编辑这类数据，必须完成字典绑定后才能保存

## 测试与验收

### 1. 前端验收

1. 新增 `raw_herbs` 库存时，药名只能从草药字典选择
2. 选择草药后，不再要求录入性味归经
3. 新增第二个供应商库存时，只需要重新选择同一草药并填写库存字段
4. 方剂页新增药味时，药名只能从草药字典选择
5. 管理页中的方剂编辑器行为与主方剂页一致
6. 老库存、老方剂可正常展示，编辑时要求补绑

### 2. 后端验收

1. `raw_herbs` 库存缺失 `herbDictId` 时保存失败
2. 方剂药味缺失 `herbDictId` 时保存失败
3. 传入伪造名称但字典 ID 正确时，后端回写为字典标准名称
4. `powder` 和 `pills` 仍按现状可保存

### 3. 回归重点

1. 处方导入方剂仍正常
2. 处方库存匹配仍优先使用 `herbDictId`
3. 切换供应商仍正常
4. 药房页库存候选与发药逻辑不退化
5. `raw_herbs` 批量导入能按药名自动绑定草药字典，无法绑定的行会明确报错

## 非目标

本次不包含：

- 为 `powder` 和 `pills` 建立统一草药字典强绑定
- 改造历史问诊 payload 中所有草药快照结构
- 批量回填所有旧库存和旧方剂的 `herbDictId`
- 重构整套库存搜索与发药模块
- 数据库新增字段或大规模迁移

## 实施建议

建议按以下顺序实施：

1. 先改前端库存页 `raw_herbs` 录入与展示
2. 再改前端方剂页和管理页药味录入
3. 再补后端库存与方剂保存校验
4. 最后做处方导入、库存匹配、药房发药回归验证

这样可以先解决最明显的重复录入问题，再补上服务端数据一致性约束。
