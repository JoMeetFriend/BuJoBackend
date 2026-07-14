## 1. schedule_variant API

- [x] 1.1 寫後端失敗測試：`Activity detail exposes schedule variant`，覆蓋 `fixed`、`find_time`、`find_date`、`find_date_time`
- [x] 1.2 實作 `schedule_variant 由後端依 schedule 和 candidate slots 推導`，在 `GET /api/activities/:id` response 加上 `schedule_variant`
- [x] 1.3 執行 `npm test -- activityStateMachine.test.js`，確認 schedule variant 測試通過

## 2. Mode C recruiting 重選

- [x] 2.1 寫後端失敗測試：`Scenario C slot resubmission during recruiting`，已報名者於 `recruiting` 重新送 `candidateSlotIds` 時覆寫 `ActivityAvailability`
- [x] 2.2 寫後端失敗測試：`Scenario C slot resubmission during recruiting`，已報名者於 `voting` / `confirmed` 重新送 `candidateSlotIds` 時回 400 且不改資料
- [x] 2.3 實作 `Mode C slot resubmission 只允許 recruiting`，只對 `schedule_variant === 'find_date'` 開放已報名者覆寫
- [x] 2.4 執行 `npm test -- activityStateMachine.test.js`，確認 Mode C 重選行為通過

## 3. Mode B range cancel cleanup

- [x] 3.1 寫後端失敗測試：`Range-mode cancellation removes stored availability ranges`，取消 range 模式報名時刪除 `ActivityAvailabilityRange`
- [x] 3.2 寫後端失敗測試：`Cancelled participant is excluded from range ranking`，取消後舊 ranges 不再影響 ranking
- [x] 3.3 實作 `range cancellation deletes ActivityAvailabilityRange`，在 `cancelJoin` transaction 補 `activityAvailabilityRange.deleteMany`
- [x] 3.4 執行 `npm test -- scenarioBRange.test.js`，確認 Mode B range cleanup 通過

## 4. 驗證與範圍檢查

- [x] 4.1 執行 `npm test`
- [x] 4.2 執行 `spectra validate --changes scenario-c-date-picker-api`
- [x] 4.3 確認本 change 沒有前端 UI、Mode D、建立者決選體驗、picker 外觀換皮實作
