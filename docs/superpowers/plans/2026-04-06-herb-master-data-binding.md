# 草药主数据绑定库存与方剂 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `raw_herbs` 库存和方剂药味统一收口到草药字典，避免新增供应商库存时重复录入草药性味归经。

**Architecture:** 前端通过共享草药绑定辅助函数收口库存页、方剂页和管理页的录入行为；后端在库存与方剂保存入口做最小校验和名称回写；`powder` 与 `pills` 保持现状，`raw_herbs` 批量导入改为按药名字典自动绑定。整个改动保持现有 `herbDictId + name/herbName` 双字段兼容策略，不做数据库迁移。

**Tech Stack:** Vue 3 + Pinia + Element Plus + node:test；Spring Boot + RuoYi + JUnit 5 + Mockito。

---

## 文件结构与职责

### 前端

- Modify: `hospital/src/views/inventory/InventoryView.vue`
  负责 `raw_herbs` 库存的下拉绑定、旧数据补绑、字典属性展示回退、批量导入提示更新。
- Modify: `hospital/src/views/formulas/FormulaView.vue`
  负责主方剂页新增/编辑药味时强制选择草药字典。
- Modify: `hospital/src/views/admin/AdminView.vue`
  负责管理页方剂新增/编辑入口与主方剂页保持一致。
- Create: `hospital/src/utils/herbBinding.js`
  负责前端共用的草药绑定、字典属性读取、保存前校验。
- Create: `hospital/tests/herbBinding.test.js`
  覆盖草药绑定辅助函数的单元测试。
- Modify: `hospital/src/i18n/zh-CN.js`
- Modify: `hospital/src/i18n/en.js`
  更新“请输入药材名称”类文案为“请选择草药”类文案。

### 后端

- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmInventoryController.java`
  负责入口请求校验、`raw_herbs` 批量导入药名字典匹配、去重键统一。
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmFormulaController.java`
  负责方剂请求体结构兜底校验。
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmInventoryServiceImpl.java`
  负责 `raw_herbs` 的 `herbDictId` 强校验、名称回写、更新时按“请求值 + existing 值”合并判断。
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmFormulaServiceImpl.java`
  负责方剂药味 `herbDictId` 强校验与 `herbName` 回写。
- Modify: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/controller/TcmControllerValidationTest.java`
  新增控制器层请求校验与批量导入匹配测试。
- Modify: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmInventoryServiceImplTest.java`
  新增库存 service 级字典绑定测试。
- Create: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmFormulaServiceImplTest.java`
  新增方剂药味 service 级字典绑定测试。

### 回归验证

- Run: `hospital/tests/prescriptionCalc.test.js`
  确保 `herbDictId` 优先匹配逻辑未退化。
- Run: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmConsultationServiceImplTest.java`
  确保处方库存同步主链路不受影响。

---

### Task 1: 建立前端共享草药绑定辅助函数

**Files:**
- Create: `hospital/src/utils/herbBinding.js`
- Test: `hospital/tests/herbBinding.test.js`

- [ ] **Step 1: 写前端失败测试，锁定草药绑定与字典属性回退行为**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bindHerbSelection,
  getInventoryHerbMeta,
  validateBoundHerb,
} from '../src/utils/herbBinding.js'

test('bindHerbSelection 为库存行写入 herbDictId 和 name', () => {
  const draft = { name: '', herbDictId: null }
  const herb = { id: 'herb-hq', name: '黄芪' }

  const next = bindHerbSelection(draft, herb, { nameKey: 'name' })

  assert.equal(next.herbDictId, 'herb-hq')
  assert.equal(next.name, '黄芪')
})

test('bindHerbSelection 为方剂药味写入 herbDictId 和 herbName', () => {
  const draft = { herbName: '', herbDictId: null }
  const herb = { id: 'herb-ds', name: '党参' }

  const next = bindHerbSelection(draft, herb, { nameKey: 'herbName' })

  assert.equal(next.herbDictId, 'herb-ds')
  assert.equal(next.herbName, '党参')
})

test('getInventoryHerbMeta 优先读取草药字典，缺失时回退旧库存字段', () => {
  const herbById = new Map([
    ['herb-bz', { id: 'herb-bz', alias: '於术', nature: '温', taste: '苦,甘', meridianTropism: '脾,胃' }],
  ])

  assert.deepEqual(
    getInventoryHerbMeta(
      { herbDictId: 'herb-bz', alias: '旧别名', nature: '凉', taste: ['酸'], guijing: ['肝'] },
      herbById,
    ),
    { alias: '於术', nature: '温', taste: ['苦', '甘'], guijing: ['脾', '胃'] },
  )

  assert.deepEqual(
    getInventoryHerbMeta(
      { herbDictId: null, alias: '旧别名', nature: '凉', taste: ['酸'], guijing: ['肝'] },
      herbById,
    ),
    { alias: '旧别名', nature: '凉', taste: ['酸'], guijing: ['肝'] },
  )
})

test('validateBoundHerb 仅对 raw_herbs 强制 herbDictId', () => {
  assert.equal(validateBoundHerb({ category: 'raw_herbs', herbDictId: '' }), false)
  assert.equal(validateBoundHerb({ category: 'powder', herbDictId: '' }), true)
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test hospital/tests/herbBinding.test.js`

Expected: FAIL，报错 `Cannot find module '../src/utils/herbBinding.js'`

- [ ] **Step 3: 编写最小实现，让库存页和方剂页可复用同一套草药绑定逻辑**

```js
function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(/[,\u3001]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

export function bindHerbSelection(target, herb, { nameKey = 'name' } = {}) {
  return {
    ...target,
    herbDictId: herb?.id || '',
    [nameKey]: herb?.name || '',
  }
}

export function getInventoryHerbMeta(item, herbById = new Map()) {
  const herb = item?.herbDictId ? herbById.get(item.herbDictId) : null
  return {
    alias: herb?.alias || item?.alias || item?.aliases || '',
    nature: herb?.nature || item?.nature || '',
    taste: normalizeList(herb?.taste || item?.taste),
    guijing: normalizeList(herb?.meridianTropism || item?.guijing),
  }
}

export function validateBoundHerb(entry) {
  return entry?.category !== 'raw_herbs' || Boolean(entry?.herbDictId)
}
```

- [ ] **Step 4: 重新运行测试，确认辅助函数通过**

Run: `node --test hospital/tests/herbBinding.test.js`

Expected: PASS，4 个测试通过

- [ ] **Step 5: 提交这一层基础设施**

```bash
git add hospital/src/utils/herbBinding.js hospital/tests/herbBinding.test.js
git commit -m "feat: add herb binding helpers"
```

### Task 2: 收口 raw_herbs 库存录入与展示

**Files:**
- Modify: `hospital/src/views/inventory/InventoryView.vue`
- Modify: `hospital/src/i18n/zh-CN.js`
- Modify: `hospital/src/i18n/en.js`
- Test: `hospital/tests/herbBinding.test.js`
- Regression: `hospital/tests/prescriptionCalc.test.js`

- [ ] **Step 1: 先补失败测试，锁定 raw_herbs 必须绑定草药字典的前端判定**

```js
test('validateBoundHerb 对已绑定 raw_herbs 返回 true', () => {
  assert.equal(
    validateBoundHerb({ category: 'raw_herbs', herbDictId: 'herb-dg' }),
    true,
  )
})
```

Run: `node --test hospital/tests/herbBinding.test.js`

Expected: 如果尚未补这个断言，新增测试先失败或未覆盖新分支

- [ ] **Step 2: 在库存页接入草药字典 store 和共享辅助函数**

```js
import { useHerbDictStore } from '../../stores/herbDict'
import { bindHerbSelection, getInventoryHerbMeta, validateBoundHerb } from '../../utils/herbBinding'

const herbDictStore = useHerbDictStore()

const herbById = computed(() => new Map(
  herbDictStore.activeHerbs.map((herb) => [herb.id, herb]),
))

const herbOptions = computed(() =>
  herbDictStore.activeHerbs.map((herb) => ({
    label: herb.name,
    value: herb.id,
    herb,
  })),
)
```

- [ ] **Step 3: 把 raw_herbs 的新增、编辑、展示切到字典绑定模型**

```vue
<el-form-item :label="t('inventory.herbNameLabel')" required>
  <el-select
    v-if="activeTab === 'raw_herbs'"
    :model-value="newItem.herbDictId"
    filterable
    clearable
    style="width:100%"
    :placeholder="t('inventory.selectHerbRequired')"
    @change="(id) => {
      const selected = herbById.get(id)
      newItem = bindHerbSelection(newItem, selected, { nameKey: 'name' })
    }"
  >
    <el-option
      v-for="option in herbOptions"
      :key="option.value"
      :label="option.label"
      :value="option.value"
    />
  </el-select>
  <el-input v-else v-model="newItem.name" :placeholder="t('inventory.herbNamePh')" />
</el-form-item>
```

```js
async function handleAddItem() {
  if (!newItem.value.name) return ElMessage.warning(t('inventory.fillName'))
  if (!validateBoundHerb({ ...newItem.value, category: activeTab.value })) {
    return ElMessage.warning(t('inventory.selectHerbRequired'))
  }
  await inventoryStore.addItem({
    ...newItem.value,
    category: activeTab.value,
    branchId: branchesStore.currentBranchId || null,
  })
}
```

```js
const herbMeta = getInventoryHerbMeta(row, herbById.value)
```

要求同时完成：

- `raw_herbs` 编辑态药名输入框改成 `el-select filterable`
- `raw_herbs` 新增表单移除 `aliases/nature/taste/guijing/toxicity/functionsAndIndications/contraindications`
- 列表和详情页通过 `getInventoryHerbMeta()` 优先展示字典属性，旧数据回退展示库存旧字段
- `powder` 与 `pills` 保持现状

- [ ] **Step 4: 更新文案并跑回归测试**

文案示例：

```js
// zh-CN.js
selectHerbRequired: '请选择系统已有草药',
fillName: '请选择草药名称',

// en.js
selectHerbRequired: 'Select an herb from the dictionary',
fillName: 'Please select an herb',
```

Run: `node --test hospital/tests/herbBinding.test.js hospital/tests/prescriptionCalc.test.js`

Expected: PASS，且 `prescriptionCalc.test.js` 继续验证 `herbDictId` 优先匹配

- [ ] **Step 5: 提交库存页收口改动**

```bash
git add hospital/src/views/inventory/InventoryView.vue hospital/src/i18n/zh-CN.js hospital/src/i18n/en.js hospital/tests/herbBinding.test.js
git commit -m "feat: bind raw herb inventory to herb dictionary"
```

### Task 3: 收口方剂页和管理页药味选择

**Files:**
- Modify: `hospital/src/views/formulas/FormulaView.vue`
- Modify: `hospital/src/views/admin/AdminView.vue`
- Modify: `hospital/src/i18n/zh-CN.js`
- Modify: `hospital/src/i18n/en.js`
- Test: `hospital/tests/herbBinding.test.js`

- [ ] **Step 1: 先补失败测试，锁定方剂药味必须绑定 herbDictId**

```js
test('bindHerbSelection 可为方剂药味回写 herbName', () => {
  const next = bindHerbSelection(
    { herbName: '', herbDictId: null, dosage: 6, unit: 'g' },
    { id: 'herb-gc', name: '甘草' },
    { nameKey: 'herbName' },
  )

  assert.equal(next.herbDictId, 'herb-gc')
  assert.equal(next.herbName, '甘草')
})
```

Run: `node --test hospital/tests/herbBinding.test.js`

Expected: 若前一任务未覆盖方剂分支，此处先失败

- [ ] **Step 2: 在主方剂页把新增药味和旧药味编辑都切到草药字典**

```js
import { useHerbDictStore } from '../../stores/herbDict'
import { bindHerbSelection } from '../../utils/herbBinding'

const herbDictStore = useHerbDictStore()
const herbOptions = computed(() => herbDictStore.activeHerbs.map((herb) => ({
  label: herb.name,
  value: herb.id,
  herb,
})))
```

```vue
<el-select
  v-model="editHerb.herbDictId"
  filterable
  clearable
  size="small"
  :placeholder="t('admin.selectFormulaHerb')"
  @change="(id) => {
    const selected = herbDictStore.getHerb(id)
    editHerb = bindHerbSelection(editHerb, selected, { nameKey: 'herbName' })
  }"
>
  <el-option v-for="option in herbOptions" :key="option.value" :label="option.label" :value="option.value" />
</el-select>
```

```vue
<el-table-column :label="t('admin.formulaHerbName')" min-width="140">
  <template #default="{ row }">
    <el-select
      v-model="row.herbDictId"
      filterable
      clearable
      size="small"
      :placeholder="t('admin.selectFormulaHerb')"
      @change="(id) => {
        const selected = herbDictStore.getHerb(id)
        Object.assign(row, bindHerbSelection(row, selected, { nameKey: 'herbName' }))
      }"
    >
      <el-option v-for="option in herbOptions" :key="option.value" :label="option.label" :value="option.value" />
    </el-select>
  </template>
</el-table-column>
```

要求同时完成：

- `newHerb/editHerb` 增加 `herbDictId`
- `addNewHerb/addEditHerb` 保存时强制要求 `herbDictId`
- 编辑表格中的旧药味可逐行重新绑定，解决老方剂无法保存的问题

- [ ] **Step 3: 在管理页的新增/编辑方剂入口做同样收口**

```js
const newFormulaHerb = ref({ herbName: '', herbDictId: '', dosage: 0, unit: 'g', notes: '' })
const editFormulaHerb = ref({ herbName: '', herbDictId: '', dosage: 0, unit: 'g', notes: '' })
```

```js
function addFormulaHerb() {
  if (!newFormulaHerb.value.herbDictId) {
    return ElMessage.warning(t('admin.selectFormulaHerb'))
  }
  newFormula.value.items.push({
    ...newFormulaHerb.value,
    sortOrder: newFormula.value.items.length + 1,
  })
}
```

要求同时完成：

- 管理页新增方剂抽屉的药味输入改成 `el-select filterable`
- 管理页编辑方剂抽屉的药味表格支持逐行重绑 `herbDictId`
- 主方剂页与管理页的校验口径一致

- [ ] **Step 4: 运行前端测试并做一次手工烟测**

Run: `node --test hospital/tests/herbBinding.test.js hospital/tests/prescriptionCalc.test.js`

Expected: PASS

手工烟测：

1. 主方剂页新增方剂并添加两味草药
2. 主方剂页编辑旧方剂并为无 `herbDictId` 的旧药味重新绑定
3. 管理页重复执行新增、编辑、删除药味流程
4. 诊疗页导入方剂后，药味仍带 `herbDictId`

- [ ] **Step 5: 提交方剂录入收口改动**

```bash
git add hospital/src/views/formulas/FormulaView.vue hospital/src/views/admin/AdminView.vue hospital/src/i18n/zh-CN.js hospital/src/i18n/en.js hospital/tests/herbBinding.test.js
git commit -m "feat: require herb dictionary selection for formulas"
```

### Task 4: 后端在 service 强制校验 herbDictId，并在 controller 收口导入入口

**Files:**
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmInventoryController.java`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmFormulaController.java`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmInventoryServiceImpl.java`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmFormulaServiceImpl.java`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/controller/TcmControllerValidationTest.java`
- Modify: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmInventoryServiceImplTest.java`
- Create: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmFormulaServiceImplTest.java`
- Regression: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmConsultationServiceImplTest.java`

- [ ] **Step 1: 先补后端失败测试，分别锁定 controller 入口和 service 强校验**

```java
@Test
void createInventory_shouldRejectRawHerbWithoutHerbDictId()
{
    Map<String, Object> body = new HashMap<>();
    body.put("category", "raw_herbs");
    body.put("name", "黄芪");

    ServiceException ex = assertThrows(ServiceException.class,
            () -> inventoryController.create(body));

    assertEquals("raw_herbs herbDictId is required", ex.getMessage());
}

@Test
void createFormula_shouldRejectItemWithoutHerbDictId()
{
    Map<String, Object> body = new HashMap<>();
    body.put("name", "补气方");
    body.put("items", Collections.singletonList(new HashMap<String, Object>() {{
        put("herbName", "黄芪");
        put("dosage", 10);
        put("unit", "g");
    }}));

    ServiceException ex = assertThrows(ServiceException.class,
            () -> formulaController.create(body));

    assertEquals("formula item herbDictId is required", ex.getMessage());
}
```

```java
@Test
void insertTcmInventoryItem_shouldRewriteRawHerbNameFromDictionary()
{
    TcmInventoryItem item = new TcmInventoryItem();
    item.setCategory("raw_herbs");
    item.setHerbDictId("herb-hq");
    item.setName("随便写");

    TcmHerbDict herb = new TcmHerbDict();
    herb.setId("herb-hq");
    herb.setName("黄芪");
    herb.setIsActive(1);

    when(herbDictService.selectTcmHerbDictById("herb-hq")).thenReturn(herb);

    service.insertTcmInventoryItem(item);

    assertEquals("黄芪", item.getName());
}
```

Run: `cd RuoYi-Vue && mvn -pl ruoyi-hospital -Dtest=TcmControllerValidationTest,TcmInventoryServiceImplTest test`

Expected: FAIL，当前尚未实现 controller 入口校验，也尚未在 service 回写标准名称

- [ ] **Step 2: 在 inventory/formula service 落 `herbDictId` 强校验与名称回写**

```java
@Autowired
private ITcmHerbDictService herbDictService;

private TcmHerbDict requireActiveHerb(String herbDictId)
{
    TcmHerbDict herb = herbDictService.selectTcmHerbDictById(herbDictId);
    if (herb == null || herb.getDeletedAt() != null || herb.getIsActive() == null || herb.getIsActive() != 1)
    {
        throw new ServiceException("herb dictionary item not found");
    }
    return herb;
}

private void normalizeRawHerbItem(TcmInventoryItem item, TcmInventoryItem existing)
{
    String category = item.getCategory() != null ? item.getCategory() : existing != null ? existing.getCategory() : null;
    if (!"raw_herbs".equals(category))
    {
        return;
    }
    String herbDictId = item.getHerbDictId() != null ? item.getHerbDictId().trim()
            : existing != null ? existing.getHerbDictId() : "";
    if (herbDictId.isEmpty())
    {
        throw new ServiceException("raw_herbs herbDictId is required");
    }
    TcmHerbDict herb = requireActiveHerb(herbDictId);
    item.setHerbDictId(herb.getId());
    item.setName(herb.getName());
}
```

```java
private void normalizeFormulaItems(TcmFormula formula)
{
    for (TcmFormulaItem item : formula.getItems())
    {
        if (item.getHerbDictId() == null || item.getHerbDictId().trim().isEmpty())
        {
            throw new ServiceException("formula item herbDictId is required");
        }
        TcmHerbDict herb = requireActiveHerb(item.getHerbDictId().trim());
        item.setHerbDictId(herb.getId());
        item.setHerbName(herb.getName());
    }
}
```

要求同时完成：

- `TcmInventoryServiceImpl.insertTcmInventoryItem()` 在入库前调用 `normalizeRawHerbItem(item, null)`
- `TcmInventoryServiceImpl.updateTcmInventoryItem()` 在读取 `existing` 后调用 `normalizeRawHerbItem(item, existing)`
- `TcmFormulaServiceImpl.saveFormulaItems()` 在写明细前统一调用 `normalizeFormulaItems(formula)`

- [ ] **Step 3: 在 controller 收口请求体形状与 raw_herbs 批量导入**

```java
private void validateFormulaBody(Map<String, Object> body)
{
    Object itemsObj = body.get("items");
    if (itemsObj != null && !(itemsObj instanceof List))
    {
        throw new ServiceException("formula items must be an array");
    }
}
```

```java
private void normalizeBatchImportHerb(Map<String, Object> item, List<TcmHerbDict> herbs)
{
    String category = item.get("category") != null ? String.valueOf(item.get("category")).trim() : "raw_herbs";
    if (!"raw_herbs".equals(category))
    {
        return;
    }
    String importName = item.get("name") != null ? String.valueOf(item.get("name")).trim() : "";
    List<TcmHerbDict> matches = herbs.stream()
            .filter(herb -> herb.getDeletedAt() == null && herb.getIsActive() != null && herb.getIsActive() == 1)
            .filter(herb -> herb.getName().equals(importName))
            .collect(Collectors.toList());
    if (matches.size() != 1)
    {
        throw new ServiceException(importName + " herb dictionary match is not unique");
    }
    item.put("herbDictId", matches.get(0).getId());
    item.put("name", matches.get(0).getName());
}
```

批量导入要求同步完成：

- `raw_herbs` 导入前按药名唯一匹配草药字典
- 匹配成功时自动补写 `herbDictId` 和标准 `name`
- 建库存去重键时优先使用标准化后的 `herbDictId`
- 未匹配或多匹配时记录错误，不落库该行

- [ ] **Step 4: 重新运行后端测试并做库存同步回归**

Run: `cd RuoYi-Vue && mvn -pl ruoyi-hospital -Dtest=TcmControllerValidationTest,TcmInventoryServiceImplTest,TcmFormulaServiceImplTest,TcmConsultationServiceImplTest test`

Expected:

- `TcmControllerValidationTest` PASS
- `TcmInventoryServiceImplTest` PASS
- `TcmFormulaServiceImplTest` PASS
- `TcmConsultationServiceImplTest` PASS，处方库存同步主链路不回归

- [ ] **Step 5: 提交后端约束改动**

```bash
git add RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmInventoryController.java RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmFormulaController.java RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmInventoryServiceImpl.java RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmFormulaServiceImpl.java RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/controller/TcmControllerValidationTest.java RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmInventoryServiceImplTest.java RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmFormulaServiceImplTest.java
git commit -m "feat: enforce herb dictionary binding on inventory and formulas"
```

### Task 5: 全量验证与交付检查

**Files:**
- Verify only: 前后端上述改动文件

- [ ] **Step 1: 运行前端单测和构建**

Run: `cd hospital && node --test tests/herbBinding.test.js tests/prescriptionCalc.test.js && npm run build`

Expected:

- 测试全部 PASS
- `vite build` 成功输出 `dist/`

- [ ] **Step 2: 运行后端测试和编译**

Run: `cd RuoYi-Vue && mvn -pl ruoyi-hospital -Dtest=TcmControllerValidationTest,TcmInventoryServiceImplTest,TcmFormulaServiceImplTest,TcmConsultationServiceImplTest test && mvn -pl ruoyi-hospital -DskipTests package`

Expected:

- JUnit 测试 PASS
- `ruoyi-hospital` 编译通过

- [ ] **Step 3: 做人工回归**

人工回归清单：

1. 在库存页新增一条 `raw_herbs` 库存，确认必须先选草药
2. 用同一草药新增第二个供应商库存，确认不再录入性味
3. 编辑一条旧 `raw_herbs` 库存，确认可补绑草药字典并保存
4. 在主方剂页新增方剂，确认每味药必须选草药
5. 在管理页编辑旧方剂，确认旧药味可逐行重绑
6. 在诊疗页导入方剂，确认换算和库存匹配正常
7. 在库存页批量导入 `raw_herbs`，确认可自动绑定；无法匹配的行明确报错

- [ ] **Step 4: 整理交付说明并提交最终 commit**

```bash
git status --short
git add hospital/src/views/inventory/InventoryView.vue hospital/src/views/formulas/FormulaView.vue hospital/src/views/admin/AdminView.vue hospital/src/utils/herbBinding.js hospital/tests/herbBinding.test.js hospital/src/i18n/zh-CN.js hospital/src/i18n/en.js RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmInventoryController.java RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/controller/TcmFormulaController.java RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmInventoryServiceImpl.java RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmFormulaServiceImpl.java RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/controller/TcmControllerValidationTest.java RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmInventoryServiceImplTest.java RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmFormulaServiceImplTest.java
git commit -m "feat: bind raw herbs and formulas to herb dictionary"
```

Expected: 工作区仅保留与本功能无关的既有改动

---

## Self-Review

### Spec coverage

- 草药字典唯一主数据来源：Task 2、Task 3、Task 4 覆盖
- `raw_herbs` 库存强制字典选择：Task 2、Task 4 覆盖
- 方剂药味强制字典选择：Task 3、Task 4 覆盖
- 旧数据兼容与补绑：Task 2、Task 3 覆盖
- `raw_herbs` 批量导入自动绑定：Task 4 覆盖
- 处方库存匹配与药房页不回归：Task 2、Task 4、Task 5 覆盖

### Placeholder scan

- 无 `TODO` / `TBD`
- 每个改动任务都给出具体文件、命令、代码片段和提交建议

### Type consistency

- 库存统一使用 `name + herbDictId`
- 方剂统一使用 `herbName + herbDictId`
- `raw_herbs` 是唯一强制字典绑定的库存分类
