## 1. 共用合併演算法與支持者收集 helper

- [x] 1.1 測試：新增 `mergeAdjacentSameCount(countedSegments)` 的單元測試——相鄰、`count` 相同、時間銜接（前一筆 `slot_end` === 這一筆 `slot_start`）、且支持者集合完全相同的格子合併成一筆，`slot_start`/`slot_end` 分別取最早/最晚；`count` 不同、時間不連續、或支持者集合不同（即使票數相同，例如 Alice 9:00-10:00、Bob 10:00-11:00 這種交接情境）都會斷開成新的一筆（design: 合併相鄰同票數區段的演算法；spec: Adjacent segments with equal count and identical supporters are merged / A count change breaks the merge / Equal count but different supporters does not merge）
- [x] 1.2 在 `activityController.js` 實作 `mergeAdjacentSameCount`（含 `sameSupporterSet` 比對 helper），讓 1.1 的測試通過（design: 統一的決策項目形狀——這個 helper 是產生統一 segment 形狀的共用基礎）
- [x] 1.3 測試：`mergeAdjacentSameCount` 對 `count === 0` 的格子直接濾掉，不出現在合併結果裡
- [x] 1.4 測試：新增支持者收集邏輯的單元測試——給定一組 `{start, end, user_id}` range 與切格結果，每個 segment 能正確收集涵蓋它的 `user_id` 清單（design: 支持者清單的來源）
- [x] 1.5 實作支持者收集邏輯，讓 1.4 的測試通過；新增一個小 helper 把 `user_id` 清單對照 `activity.participants`（含 `user.display_name`/`user.avatar_url`）組成 `supporters` 陣列 `[{user_id, display_name, avatar_url}]`（design: 支持者清單的來源）

## 2. 情境二（range 模式）：單一排序陣列、排除建立者、合併

- [x] 2.1 測試：`computeRangeRanking` 的回傳格式從 `{perfect_overlap, partial_overlap}` 改成單一排序陣列，依 `count` 由高到低排序，每筆含 `is_unanimous`／`supporters`（spec: Overlap ranking computation — Ranking is a single array sorted by support）
- [x] 2.2 測試：兩個時間相鄰、票數相同的 60 分鐘格子，合併後只回傳一筆（spec: Overlap ranking computation — Adjacent segments with equal count are merged）
- [x] 2.3 測試：票數中途變化時正確斷開成不同筆，用 design.md 的兩參與者範例（Alice 18:00-19:00、Bob 18:00-21:00），驗證 18:00-19:00 是一筆 count 2、19:00-21:00 合併成一筆 count 1（spec: Overlap ranking computation — A count change breaks the merge）
- [x] 2.4 依 2.1-2.3 修改 `computeRangeRanking` 的實作：切格計數邏輯不變，組裝回傳結果前呼叫 `mergeAdjacentSameCount`，不再分兩個陣列（design: 統一的決策項目形狀；spec: Creator is treated as always available 的移除——確認新實作不再注入建立者的虛擬 range）
- [x] 2.5 測試：`getActivity`（isRangeMode 分支）跟 `confirmFormation`（isRangeMode 分支）呼叫 `computeRangeRanking` 時，`totalParticipants` 引數改用真人送出者去重數（`getJoinedSubmitterCount`，情境四幽靈投票修復時已存在），不含建立者——確認 `is_unanimous` 正確反映真人分母（design: is_unanimous 的分母沿用既有的 votingParticipantCount）
- [x] 2.6 依 2.5 更新 `getActivity`／`confirmFormation` 呼叫端；`getJoinedAvailabilityRanges` 改成不丟掉 `user_id`（回傳 `{start, end, user_id}` 而不是只有 `{start, end}`）（design: 支持者清單的來源）
- [x] 2.7 測試：`getActivity` 回傳的 `decision_candidates` 是單一陣列，不再是 `{perfect_overlap, partial_overlap}`；`confirmFormation` 比對 `{slotStart, slotEnd}` 時改成在新的單一陣列裡找，找不到一樣回 400
- [x] 2.8 測試：情境二取消報名後，該參與者的舊 range 不會出現在任何 `decision_candidates` entry 裡（spec: Range-mode cancellation removes stored availability ranges — Cancelled participant is excluded from range ranking）
- [x] 2.9 更新 `src/__tests__/scenarioBRange.test.js`、`src/__tests__/computeRangeRanking.test.js`、`src/__tests__/activityStateMachine.test.js` 裡所有斷言舊的 `{perfect_overlap, partial_overlap}` 格式的既有測試，改成斷言新的單一陣列格式

## 3. 情境三（find_date）：新增 supporters，格式對齊

- [x] 3.1 測試：`getActivity` 的情境三分支（`!isRangeMode` 且非 `find_date_time`），`decision_candidates` 每筆新增 `supporters` 陣列，正確列出投給該候選時段的參與者，且完整清單（不只並列最高票）依票數排序的既有行為不受影響（spec: Formation decision candidates are not filtered to only the leading option — find_date activity ranks candidates by vote count and identifies supporters）
- [x] 3.2 依 3.1 修改情境三的 `decision_candidates` 組裝邏輯，新增 `supporters` 欄位；`is_unanimous` 的分母確認沿用既有的 `getVotingParticipantCount`（幽靈投票修復時已存在，不重新定義）（design: is_unanimous 的分母沿用既有的 votingParticipantCount）
- [x] 3.3 更新 `src/__tests__/activityStateMachine.test.js` 裡情境三 `decision_candidates` 相關的既有測試，新增 `supporters` 欄位的斷言

## 4. 情境四（find_date_time）：候選時段分組、內層合併＋單一陣列

- [x] 4.1 測試：`computeSlotOverlapRanking` 回傳格式從 `{perfect_overlap, partial_overlap}` 改成單一排序陣列（`segments`），套用同一套 `mergeAdjacentSameCount`；沿用 design.md 的三參與者範例（候選時段 09:00-12:00，A 09:00-10:00、B 09:30-11:00、C 無子區間）驗證合併後 09:00-10:00 是 count 3／`is_unanimous: true`，10:00-11:00 是 count 2，11:00-12:00 是 count 1，且每筆帶正確的 `supporters`（spec: Scenario D computes sub-range overlap ranking per candidate slot）
- [x] 4.2 依 4.1 修改 `computeSlotOverlapRanking` 的實作
- [x] 4.3 測試：`getActivity` 的情境四分支，`decision_candidates` 是「候選時段」外層陣列，每筆含該候選時段自己的 `id`/`slot_start`/`slot_end`/`count`，以及內層合併後的 `segments` 陣列（取代原本的 `perfect_overlap`/`partial_overlap`）（spec: Decision candidates response groups merged segments under their candidate slot）
- [x] 4.4 依 4.3 修改 `getActivity` 情境四分支的組裝邏輯（design: 統一的決策項目形狀）
- [x] 4.5 測試：`confirmFormation` 情境四分支，比對送出的 `{slotStart, slotEnd}` 時改成在對應候選時段的 `segments` 陣列裡找，找不到一樣回 400（spec: Scenario D formation confirmation creates a slot from the computed overlap window — Confirming a segment not in the computed ranking is rejected）
- [x] 4.6 依 4.5 修改 `confirmFormation` 情境四分支
- [x] 4.7 更新 `src/__tests__/activityStateMachine.test.js`、`src/__tests__/computeSlotOverlapRanking.test.js` 裡所有斷言舊格式的既有測試

## 5. 情境一：已報名人數／頭像可見性查證

- [x] 5.1 測試：新增一則情境一（`schedule_variant: 'fixed'`，免投票）的 `getActivity` 整合測試，斷言回應包含正確的 `current_count` 與 `participants` 陣列（含 `display_name`/`avatar_url`），驗證後端資料層本身沒有缺漏（spec: Fixed-time activities expose participant headcount and avatars to the creator；design: 情境一已報名人數/頭像可見性）
- [x] 5.2 執行 5.1 的測試：若通過，確認後端資料層正確、不需要修改 `activityController.js`，把查證結果記錄在 commit/PR 說明裡，落差留給前端 `BuJo` repo 的對應 change 排查；若測試失敗，修正 `getActivity` 情境一分支缺漏的欄位，直到測試通過（design: 情境一已報名人數/頭像可見性）

## 6. API_DOCS 更新

- [x] 6.1 更新 `API_DOCS.md`：`decision_candidates` 的回應格式說明改成新的單一排序陣列／情境四候選時段分組＋`segments`；新增 `is_unanimous`／`supporters` 欄位說明；移除已經不存在的 `perfect_overlap`/`partial_overlap` 頂層鍵名描述

## 7. 收尾驗證

- [x] 7.1 跑 `npm test`（`cross-env NODE_OPTIONS=--experimental-vm-modules jest`）全套後端測試，確認情境一/二/三/四既有測試沒有因為這次調整而回歸（已知 `authGoogle`/`authMiddleware`/`authRoutes` 三個測試檔案有跟這次改動無關的既有環境性失敗，不列入回歸判斷）
- [x] 7.2 手動驗證：建立一個情境二活動，兩個參與者送出時間重疊但不完全一致，確認決策畫面回傳的 `decision_candidates` 正確合併、`is_unanimous`／`supporters` 正確；建立一個情境四活動重複驗證候選時段分組＋內層 segments
