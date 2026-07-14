## Context

前端 Mode C 計畫已拆到 BuJo repo，只負責日期-only picker 與 `{ candidateSlotIds }` 轉換。後端需要提供兩個能力：一是讓前端能穩定辨識 Mode C；二是讓 Mode C 已報名者在 `recruiting` 期間重新提交候選日期時覆寫舊 availability。

目前 `availability_mode` 只有 `slot` / `range`。Mode C 與 Mode D 都是 slot voting，前端不能只靠 `availability_mode` 判斷。Mode B range 模式已支援 resubmission，但 `cancelJoin` 目前只刪 `ActivityAvailability`，未刪 `ActivityAvailabilityRange`。

## Goals / Non-Goals

**Goals:**

- 回傳 `schedule_variant` 供前端穩定分流
- Mode C 已報名者在 `recruiting` 期間可覆寫 `candidateSlotIds`
- `voting` / `confirmed` 後拒絕 Mode C 重選
- range 模式取消報名時清除 `ActivityAvailabilityRange`

**Non-Goals:**

- 不改前端 UI
- 不把 Mode C 遷移到 `ActivityAvailabilityRange`
- 不修改 Mode D 重選行為
- 不重設建立者決選體驗

## Decisions

### schedule_variant 由後端依 schedule 和 candidate slots 推導

`GET /api/activities/:id` 回傳：

- `fixed`：免投票固定時間活動
- `find_time`：`availability_mode === 'range'`
- `find_date`：slot voting，候選 slots 橫跨多個日期且時間形狀一致
- `find_date_time`：其他 slot voting

這避免前端重複推導，也讓 Mode C / D 的分界集中在後端。替代方案是新增資料庫欄位保存 variant；目前不採用，因為現有資料已能推導，且本次不需要 migration。

### Mode C slot resubmission 只允許 recruiting

`joinActivity` 對 `schedule_variant === 'find_date'` 且 existing participant 為 joined 的請求開放覆寫。覆寫時先刪除該使用者在此 activity 的 `ActivityAvailability`，再寫入新的 candidate slot ids。不新增 participant，不更新成團結果，不開放 Mode D。

### range cancellation deletes ActivityAvailabilityRange

`cancelJoin` 的 transaction 加入 `activityAvailabilityRange.deleteMany({ activity_id, user_id })`。此行為對非 range 活動無副作用，因為沒有對應 rows。

## Risks / Trade-offs

- **[Risk]** 從 slot 形狀推導 `find_date` 可能將某些單一時間的 D 活動歸為 C。→ **Mitigation**：此推導只作為現有資料模型下的過渡；Mode D 計畫會重新定義 D 的 payload 與 variant。
- **[Risk]** 重選時與狀態轉換競態。→ **Mitigation**：後端以目前 activity status 作最後防線，只允許 `recruiting`。
- **[Trade-off]** 不新增 schema 欄位，降低 migration 成本，但 variant 是推導值。→ 後續 Mode D 修正時可再評估是否保存明確 variant。

## Migration Plan

1. 部署後端 `schedule_variant` 與 Mode C resubmission。
2. 前端 Mode C picker 上線後消費 `schedule_variant: 'find_date'`。
3. 舊活動不需 migration；variant 由既有 schedule/candidate slots 推導。
