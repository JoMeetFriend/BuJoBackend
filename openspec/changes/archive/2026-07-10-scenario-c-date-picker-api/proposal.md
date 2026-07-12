## Why

前端 Mode C 日期-only picker 需要穩定辨識情境三，且已報名者在 `recruiting` 期間重新選日期時，後端必須能覆寫既有 slot availability。Mode B range 模式也已暴露取消報名後 availability ranges 可能殘留的風險，需在後端資料一致性層補齊。

## What Changes

- `GET /api/activities/:id` 新增 `schedule_variant`，以 `fixed` / `find_time` / `find_date` / `find_date_time` 穩定描述活動情境
- Mode C（`schedule_variant: 'find_date'`）已報名者在 `recruiting` 期間重新送 `candidateSlotIds` 時，覆寫該使用者既有 `ActivityAvailability`
- Mode C 在 `voting` / `confirmed` 狀態拒絕重新送 `candidateSlotIds`
- Mode B range 模式取消報名時同步刪除該使用者的 `ActivityAvailabilityRange`
- 不更動 Mode D 報名或重選邏輯

## Capabilities

### New Capabilities

- `scenario-c-date-picker-api`: 後端提供 Mode C 前端所需的情境辨識與 recruiting 期間 candidate slot 重選 API 行為。

### Modified Capabilities

- `scenario-b-availability-reporting`: range 模式取消報名時必須同步移除該使用者的 `ActivityAvailabilityRange`，避免取消後仍被排序計入。

## Impact

- Affected specs:
  - New: `scenario-c-date-picker-api`
  - Modified: `scenario-b-availability-reporting`
- Affected code:
  - Modified: `src/controllers/activityController.js`
  - Modified: `src/__tests__/activityStateMachine.test.js`
  - Modified: `src/__tests__/scenarioBRange.test.js`
