## 1. Schema Migration

- [x] 1.1 在 `prisma/schema.prisma` 新增 `ActivityAvailabilityRange` model、`AvailabilityMode` enum（對應設計決策「新增 ActivityAvailabilityRange 表，不重用既有的 ActivityCandidateSlot／ActivityAvailability」），並在 `ActivitySchedule` 新增 `availability_mode`、`fixed_date`、`time_window_start`、`time_window_end`、`vote_deadline_at` 欄位（對應設計決策「`ActivitySchedule` 新增 `availability_mode` 區分 slot／range 模式」）
- [x] 1.2 執行 `npx prisma migrate dev --name add_availability_range`，確認 migration 成功套用且不影響既有資料

## 2. createActivity：情境二改用 range 模式

- [x] 2.1 寫失敗測試：`createActivity` 收到情境二 payload（`singleDate` + 選填 `timeWindowStart`/`timeWindowEnd`）時，寫入 `availability_mode: 'range'`、`fixed_date`、`time_window_start/end`、`vote_deadline_at`，且不建立任何 `ActivityCandidateSlot`（對應規格 Optional creator-defined time window）
- [x] 2.2 執行測試確認失敗
- [x] 2.3 實作 `createActivity` 情境二分支（判斷條件從「有 slots[]」改為「有 singleDate 且沒有 startDate/candidateDates/dateSlots」；移除 buildVoteSlots 呼叫）
- [x] 2.4 執行測試確認通過
- [x] 2.5 Commit

## 3. joinActivity：range 模式報名與 deadline 安全修正

- [x] 3.1 寫失敗測試：range 模式活動 `POST /:id/join` 帶 `{ranges: [...]}` 時寫入對應數量的 `ActivityAvailabilityRange`（對應規格 Participant free-form availability reporting）
- [x] 3.2 執行確認失敗
- [x] 3.3 實作寫入邏輯
- [x] 3.4 執行確認通過
- [x] 3.5 寫失敗測試：空 `ranges` 陣列回 400、不寫入任何資料
- [x] 3.6 執行確認失敗 → 實作驗證 → 執行確認通過
- [x] 3.7 寫失敗測試：submitted range 超出 `time_window_start`/`time_window_end` 時回 400（對應規格 Optional creator-defined time window）
- [x] 3.8 執行確認失敗 → 實作驗證 → 執行確認通過
- [x] 3.9 寫失敗測試：已報名者於 `recruiting`/`voting` 狀態重新送出 `ranges` 時，先刪除該使用者舊的 `ActivityAvailabilityRange` 再寫入新的（對應規格 Participant free-form availability reporting 的重新編輯情境）
- [x] 3.10 執行確認失敗 → 實作 → 執行確認通過
- [x] 3.11 寫失敗測試：`POST /:id/join` 對 `deadline_at < now` 但 `status` 仍是 `recruiting` 的活動回拒絕錯誤、不建立 `ActivityParticipant`，四個情境皆適用（對應規格 Join rejects activities past their deadline，設計決策「`joinActivity` 補上 `deadline_at` 檢查（全情境適用的安全修正）」）
- [x] 3.12 執行確認失敗 → 實作（加在既有 transaction 最前面的檢查）→ 執行確認通過，並跑一次既有情境一/三/四相關測試確認無回歸
- [x] 3.13 Commit

## 4. 重疊排序演算法

- [x] 4.1 寫失敗測試：新增純函數（例如 `computeRangeRanking(ranges, windowStart, windowEnd, totalParticipants)`），驗證 60 分鐘切格、重疊人數計算、Section 1（完全符合）／Section 2（前 3）分區、平手依時間排序（對應規格 Overlap ranking computation，設計決策「重疊排序演算法：固定基準範圍切 60 分鐘一格，分 Section 1／2 顯示」）
- [x] 4.2 執行確認失敗
- [x] 4.3 實作純函數
- [x] 4.4 執行確認通過，並補上零提交（回傳兩區皆空）、零重疊（Section 1 空、Section 2 顯示最高票）邊界案例測試
- [x] 4.5 Commit

## 5. getActivity：串接排序與 lazy check 新分支

- [x] 5.1 寫失敗測試：`getActivity` 對 `availability_mode: 'range'` 活動回傳 `decision_candidates` 為 `{ perfect_overlap: [...], partial_overlap: [...] }`（對應設計決策「`GET /:id` 的 `decision_candidates` 回傳格式：range 模式改回傳 `{perfect_overlap, partial_overlap}`」），每筆項目含 `temp-` 前綴的識別碼、`slot_start`、`slot_end`、`count`，使用 `computeRangeRanking()`，並將建立者視為永遠有空（對應規格 Overlap ranking computation 的 creator always available 情境）
- [x] 5.2 執行確認失敗 → 實作 → 執行確認通過
- [x] 5.3 寫失敗測試：`voting` 狀態活動的 `vote_deadline_at` 已過且 `confirmed_slot_id` 仍為空時，lazy check 轉為 `cancelled` 並通知所有參與者（對應規格 Vote deadline auto-cancellation，設計決策「`vote_deadline_at` 逾時自動取消（新增，原文件規劃但從未實作）」）
- [x] 5.4 執行確認失敗 → 實作 → 執行確認通過
- [x] 5.5 寫失敗測試：`recruiting` 狀態、`range` 模式、未設 `participant_target`、`deadline_at` 已過、且除建立者外無人提交過 `ActivityAvailabilityRange` 時，lazy check 轉為 `cancelled`（對應規格 Zero-submission cancellation without a participant cap，設計決策「情境二零提交自動取消（新增，修正既有缺陷）」）
- [x] 5.6 執行確認失敗 → 實作 → 執行確認通過，並確認情境一/三/四原有 lazy check 行為不受影響
- [x] 5.7 Commit

## 6. confirmFormation：range 模式確認成團

- [x] 6.1 寫失敗測試：`range` 模式活動呼叫 `confirmFormation` 時改吃 `{ slotStart, slotEnd }`（而非 `candidateSlotId`），臨時建立一筆 `ActivityCandidateSlot` 並寫入 `confirmed_slot_id`（對應規格 Creator confirmation persists the selected slot，設計決策「`confirmed_slot_id` 沿用既有機制，只在確認成團時才建立 `ActivityCandidateSlot`」）
- [x] 6.2 執行確認失敗 → 實作 → 執行確認通過
- [x] 6.3 寫失敗測試：`{ slotStart, slotEnd }` 不在目前 `decision_candidates` 名單內時回 400、不建立 `ActivityCandidateSlot`
- [x] 6.4 執行確認失敗 → 實作 → 執行確認通過
- [ ] 6.5 Commit

## 7. 文件與跨庫備註

- [ ] 7.1 於 `API_DOCS.md` 註記設計決策「`deadline_at` 錨點沿用現行機制，不改回規劃文件的自動公式」——此項為前端錨點計算調整（`BuJo` repo 同名 change 負責），後端本次不需改動
- [ ] 7.2 更新 `API_DOCS.md`：`POST /activities` 情境二 payload 變更（移除 `slots`/`creatorSlotIndexes`，新增 `timeWindowStart`/`timeWindowEnd`）、`POST /:id/join` range 模式 body 格式、`GET /:id` `decision_candidates` 回傳格式

## 8. 既有測試回歸確認

- [ ] 8.1 檢查 `src/__tests__/activityStateMachine.test.js` 中涉及情境二（`isVotingB`／`slots`）的既有案例，改寫為對應 range 模式的案例（對應規格 Participant free-form availability reporting）
- [ ] 8.2 執行整套後端測試套件（`npm test`），確認情境一／三／四無回歸
