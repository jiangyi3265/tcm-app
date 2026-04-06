# 处方库存重复扣减修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复处方自动同步导致的库存重复扣减问题，确保 7 剂生脉散只扣减一次实际所需包数。

**Architecture:** 这次修复分两层做。前端先阻断处方抽屉里的重复自动同步和回写后的自激活循环；后端再把“库存快照未变化的重复同步”改成幂等，避免同一处方被重复 restore/deduct。这样即使网络抖动或用户连续编辑，也不会把 14 包累计扣成 140 包。

**Tech Stack:** Vue 3 + Pinia + Node `--test`，Spring Boot + JUnit 5 + Mockito

---

## File Structure

- Modify: `hospital/src/views/consultations/ConsultationView.vue`
  责任：处方草稿自动同步调度、同步中的并发保护、服务端回写后的基线更新。
- Create: `hospital/src/utils/rxAutosaveGuard.js`
  责任：抽出纯函数，判断是否应跳过自动同步，便于用 Node 测试覆盖。
- Test: `hospital/tests/rxAutosaveGuard.test.js`
  责任：覆盖“未变化不自动同步”“同步中不并发发请求”“服务端回写不触发二次同步”。
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmConsultationServiceImpl.java`
  责任：当处方库存快照未变化且现有 reservation 可复用时，跳过 restore/deduct，直接沿用 reservation。
- Test: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmConsultationServiceImplTest.java`
  责任：覆盖后端幂等同步，确保重复同步相同处方时不再二次扣减。

### Task 1: 后端把相同处方同步改成幂等

**Files:**
- Modify: `RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmConsultationServiceImpl.java`
- Test: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmConsultationServiceImplTest.java`

- [ ] **Step 1: 写失败测试，证明相同库存快照重复同步时不能再次扣减**

```java
@Test
void syncPrescription_shouldReuseExistingReservationWhenInventorySnapshotUnchanged()
{
    TcmConsultation existing = consultation("consult-powder", payloadWithPrescription(
            powderPrescription("rx-powder",
                    items(item("人参", "10", "g", "inv-rs", "supplier-rs", "14")),
                    reservations(reservation("inv-rs", "人参", "14", "supplier-rs")),
                    "editing")));
    when(consultationMapper.selectTcmConsultationById("consult-powder")).thenReturn(existing);
    when(consultationMapper.updateTcmConsultation(any(TcmConsultation.class))).thenReturn(1);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("prescription", powderPrescription("rx-powder",
            items(item("人参", "10", "g", "inv-rs", "supplier-rs", "14")),
            null,
            "editing"));

    TcmConsultation result = service.syncPrescription("consult-powder", body, "u-powder");

    JSONObject payload = JSON.parseObject(result.getPayload());
    JSONObject updated = payload.getJSONArray("prescriptions").getJSONObject(0);
    assertEquals("14", updated.getJSONArray("inventoryReservation").getJSONObject(0).getString("reservedQty"));
    verify(inventoryService, never()).restoreFromPrescription(anyList(), eq("powder"));
    verify(inventoryService, never()).deductFromPrescription(anyList(), eq("powder"));
}
```

- [ ] **Step 2: 跑后端单测，确认当前实现失败**

Run: `mvn -pl ruoyi-hospital -Dtest=TcmConsultationServiceImplTest#syncPrescription_shouldReuseExistingReservationWhenInventorySnapshotUnchanged test`

Expected: FAIL，当前实现会调用 `restoreFromPrescription()` 和 `deductFromPrescription()`。

- [ ] **Step 3: 在服务层增加“库存快照相同则复用 reservation”的最小实现**

```java
private boolean hasSameReservationSnapshot(Map<String, Object> current, Map<String, Object> next)
{
    if (current == null)
    {
        return false;
    }
    List<Map<String, Object>> currentReservation = toMapList(current.get("inventoryReservation"));
    if (currentReservation.isEmpty())
    {
        return false;
    }
    return buildReservationSnapshot(current).equals(buildReservationSnapshot(next));
}
```

```java
Map<String, Object> nextPrescription = buildWritablePrescription(existing, incomingPrescription, current, prescriptionId);
List<Map<String, Object>> reservation;
if (hasSameReservationSnapshot(current, nextPrescription))
{
    reservation = toMapList(current.get("inventoryReservation"));
}
else
{
    restoreReservationIfNeeded(current);
    reservation = reservePrescription(nextPrescription);
}
nextPrescription.put("inventoryReservation", reservation);
```

- [ ] **Step 4: 重新运行后端单测，确认通过**

Run: `mvn -pl ruoyi-hospital -Dtest=TcmConsultationServiceImplTest#syncPrescription_shouldReuseExistingReservationWhenInventorySnapshotUnchanged test`

Expected: PASS

- [ ] **Step 5: 再跑现有相关后端回归**

Run: `mvn -pl ruoyi-hospital -Dtest=TcmConsultationServiceImplTest test`

Expected: PASS

### Task 2: 前端阻止自动同步自激活和并发重入

**Files:**
- Create: `hospital/src/utils/rxAutosaveGuard.js`
- Test: `hospital/tests/rxAutosaveGuard.test.js`
- Modify: `hospital/src/views/consultations/ConsultationView.vue`

- [ ] **Step 1: 写失败测试，固定自动同步守卫规则**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldQueueRxAutosave, shouldSkipRxAutosaveAfterSync } from '../src/utils/rxAutosaveGuard.js'

test('同步中的处方修改不立即并发发起第二个请求', () => {
  assert.equal(shouldQueueRxAutosave({ rxSyncing: true, hasPendingChanges: true }), true)
})

test('服务端回写且草稿快照未变化时，不再触发二次自动同步', () => {
  assert.equal(
    shouldSkipRxAutosaveAfterSync({
      currentSnapshot: '{"id":"rx-1","items":[{"name":"人参","convertedQty":14}]}',
      baselineSnapshot: '{"id":"rx-1","items":[{"name":"人参","convertedQty":14}]}',
    }),
    true,
  )
})
```

- [ ] **Step 2: 跑前端单测，确认当前实现失败**

Run: `npm test -- rxAutosaveGuard.test.js`

Expected: FAIL，因为守卫文件尚不存在。

- [ ] **Step 3: 实现最小守卫工具**

```js
export function shouldQueueRxAutosave({ rxSyncing = false, hasPendingChanges = false } = {}) {
  return Boolean(rxSyncing && hasPendingChanges)
}

export function shouldSkipRxAutosaveAfterSync({ currentSnapshot = '', baselineSnapshot = '' } = {}) {
  return currentSnapshot === baselineSnapshot
}
```

- [ ] **Step 4: 在处方页面接入守卫，去掉重复自动同步**

```js
const pendingRxAutosave = ref(false)

async function syncPrescriptionDraft({ silent = true } = {}) {
  if (isReadOnly.value || suspendRxAutosave.value || !showRxDialog.value) return null
  if (rxSyncing.value) {
    pendingRxAutosave.value = true
    return null
  }

  const payload = buildPrescriptionPayload(rxForm.value, 'editing')
  if (!hasUnsavedRxDialogChanges.value) return null
  if (!shouldPersistRxDraft(payload)) return null

  rxSyncing.value = true
  pendingRxAutosave.value = false
  try {
    const updated = await consultStore.syncPrescription(consultationId, {
      prescription: payload,
      totals: buildRxTotals(),
    })
    applySavedConsultation(updated)
    syncSavedSnapshot()
    syncRxFormFromConsultation(payload.id)
    syncRxBaseline()
    return updated
  } finally {
    rxSyncing.value = false
    if (pendingRxAutosave.value && hasUnsavedRxDialogChanges.value) {
      pendingRxAutosave.value = false
      scheduleRxAutosave()
    }
  }
}
```

```js
watch(
  () => rxForm.value,
  () => {
    if (!hasUnsavedRxDialogChanges.value) return
    scheduleRxAutosave()
  },
  { deep: true },
)
```

- [ ] **Step 5: 运行前端单测，确认守卫通过**

Run: `npm test -- rxAutosaveGuard.test.js`

Expected: PASS

### Task 3: 组合验证重复扣减场景

**Files:**
- Test: `hospital/tests/rxAutosaveGuard.test.js`
- Test: `RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmConsultationServiceImplTest.java`

- [ ] **Step 1: 增补一个“重复同步同一粉剂处方”的后端回归断言**

```java
verify(inventoryService, never()).restoreFromPrescription(anyList(), eq("powder"));
verify(inventoryService, never()).deductFromPrescription(anyList(), eq("powder"));
```

- [ ] **Step 2: 增补一个“有未保存改动才允许再次调度”的前端断言**

```js
test('草稿无变化时不应继续调度自动同步', () => {
  assert.equal(
    shouldSkipRxAutosaveAfterSync({
      currentSnapshot: '{"id":"rx-1","items":[{"name":"人参","convertedQty":14}]}',
      baselineSnapshot: '{"id":"rx-1","items":[{"name":"人参","convertedQty":14}]}',
    }),
    true,
  )
})
```

- [ ] **Step 3: 跑前后端相关测试**

Run: `npm test -- rxAutosaveGuard.test.js consultationInventorySync.test.js`
Expected: PASS

Run: `mvn -pl ruoyi-hospital -Dtest=TcmConsultationServiceImplTest test`
Expected: PASS

- [ ] **Step 4: 手工验证库存案例**

1. 新建三种粉剂库存：人参 `500`、麦冬 `500`、五味子 `500`。
2. gramsPerPacket 分别设为能得到 `14 / 14 / 7` 包的规格。
3. 录入 `7` 剂生脉散并等待自动保存。
4. 重开处方抽屉、停留数秒、再次保存。
5. 库存应保持单次扣减结果，不得继续下降到 `360`。

- [ ] **Step 5: 提交**

```bash
git add hospital/src/views/consultations/ConsultationView.vue hospital/src/utils/rxAutosaveGuard.js hospital/tests/rxAutosaveGuard.test.js RuoYi-Vue/ruoyi-hospital/src/main/java/com/ruoyi/hospital/service/impl/TcmConsultationServiceImpl.java RuoYi-Vue/ruoyi-hospital/src/test/java/com/ruoyi/hospital/service/impl/TcmConsultationServiceImplTest.java
git commit -m "fix: prevent duplicate prescription inventory deductions"
```
