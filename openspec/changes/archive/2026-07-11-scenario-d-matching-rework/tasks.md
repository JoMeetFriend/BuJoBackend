## 1. 情境四建立驗證（單一候選時段模型）

- [x] 1.1 `createActivity` 的 `isVotingD` 分支新增重複日期檢查，同一天出現兩筆 `dateSlots` 就回 400（design: 單一候選時段模型，情境四建立時每個候選日期只能有一組時段；spec: Scenario D candidate dates accept only one time slot）
- [x] 1.2 測試：`dateSlots` 有重複日期時建立活動回 400，不建立任何候選時段（Duplicate date in dateSlots is rejected）
- [x] 1.3 測試：`dateSlots` 每個日期都不同時正常建立一個候選時段對一個日期（One slot per date is accepted）

## 2. 情境四子區間交集運算

- [x] 2.1 新增泛化版切格計算函式（輸入時間範圍＋一組 range，輸出 perfect_overlap/partial_overlap），情境四對每個候選時段各自呼叫一次，範圍限定在該候選時段自己的 `slot_start`~`slot_end`（design: 情境四子區間交集運算比照情境二 computeRangeRanking，範圍限定在單一候選時段內；spec: Scenario D computes sub-range overlap ranking per candidate slot）
- [x] 2.2 沒有提交子區間的參與者，在交集運算中視為整個候選時段時間都覆蓋
- [x] 2.3 測試：三個參與者不同子區間時，各時段的覆蓋人數計算正確（Overlap ranking scoped to a single candidate slot's window / three participants with different sub-ranges）
- [x] 2.4 測試：沒有子區間的參與者在整個候選時段每一格都算覆蓋（Participant without a sub-range counts as available for the whole slot）

## 3. 情境四 confirmFormation 改用計算出的窄窗口

- [x] 3.1 `confirmFormation` 的情境四分支改成從交集運算排名（perfect_overlap/partial_overlap）挑選，當場建立新的候選時段存最終時間，不直接沿用候選時段原始邊界（spec: Scenario D formation confirmation creates a slot from the computed overlap window）
- [x] 3.2 測試：確認一個交集運算算出的窄窗口，正確建立新候選時段並設為 `confirmed_slot_id`（Confirming a computed overlap segment creates the final slot）
- [x] 3.3 測試：送出的時間不在交集運算排名清單裡時回 400（Confirming a segment not in the computed ranking is rejected）

## 4. 情境三／四建立者決策可見度與自由選

- [x] 4.1 `getActivity` 的 `decision_candidates`，情境三／四都改成回傳完整清單（不只並列最高票），依支持度由高到低排序（design: decision_candidates 改成回傳完整排名清單，不再只有並列最高票；spec: Formation decision candidates are not filtered to only the leading option）
- [x] 4.2 情境三的 `decision_candidates` 每筆包含 `id`/`slot_start`/`slot_end`/`count`/是否全員一致
- [x] 4.3 `confirmFormation` 的情境三分支移除「必須並列最高票」限制，只驗證候選時段屬於這個活動（design: confirmFormation 情境三／四分支移除並列最高票限制，允許自由選；spec: Creator may confirm any listed candidate, not only the top-ranked one）
- [x] 4.4 測試：候選時段 X 3 票、Y 2 票時，`decision_candidates` 同時包含兩者且 X 排在前面（Non-leading candidate slots remain visible to the creator）
- [x] 4.5 測試：情境三 `decision_candidates` 每筆正確包含 count 與是否全員一致（find_date activity ranks candidates by vote count）
- [x] 4.6 測試：確認非最高票的候選時段成功成團（Confirming a non-leading candidate succeeds）
- [x] 4.7 測試：確認不屬於此活動的候選時段回 400（Confirming a candidate slot from another activity is rejected）

## 5. 人數滿額不再自動成團

- [x] 5.1 `joinActivity` 的 `targetReached` 判定邏輯移除自動 `confirmed`，情境一維持 `recruiting` 並發通知；情境三／四不論票數/交集是否一致，一律轉 `voting` 並發 `time_to_pick` 通知（design: 人數滿額不再自動成團，四個情境統一交由建立者手動確認；spec: Reaching the participant target never auto-confirms an activity）
- [x] 5.2 測試：情境一人數達標時狀態維持 `recruiting`、建立者收到通知（Fixed-time activity reaching target does not auto-confirm）
- [x] 5.3 測試：情境三全員投給同一候選時段且人數達標時，狀態轉 `voting`、建立者收到通知（Unanimous find_date vote reaching target does not auto-confirm）
- [x] 5.4 測試：建立者在收到通知後手動呼叫 `confirmFormation` 能正常成團（Creator confirms formation explicitly after target reached）

## 6. 情境四已報名修改（resubmission）

- [x] 6.1 `isFindDateResubmission` 判斷條件擴大到涵蓋 `find_date_time`（design: isFindDateResubmission 擴大到 find_date_time；spec: Scenario D slot resubmission during recruiting）
- [x] 6.2 測試：情境四已報名參與者在 `recruiting` 階段重新提交候選時段，舊投票紀錄被刪除、新的被寫入（Joined participant replaces selected candidate slots）
- [x] 6.3 測試：非 `recruiting` 狀態時重新提交被拒絕（Joined participant tries to replace after recruiting）

## 7. 子區間選填確認

- [x] 7.1 確認 `joinActivity` 情境四分支維持子區間選填，沒有提交 `candidateSlotRanges` 的 `candidateSlotIds` 仍正常寫入 `range_start`/`range_end` 為 null（design: 子區間維持選填）
- [x] 7.2 測試：沒有子區間的候選時段投票仍正常計票，確認不回歸（Vote without a sub-range still counts）

## 8. 收尾驗證

- [x] 8.1 更新 `API_DOCS.md`，補上 `decision_candidates` 新格式、`confirmFormation` 新驗證規則、情境四交集運算相關的回應說明
- [x] 8.2 跑完整後端測試套件，確認情境一/二/三既有測試沒有因為自動成團判定調整而壞掉
- [x] 8.3 手動驗證：情境三/四各建一個多候選時段的活動，走過報名→查看排名清單→確認非最高票成團的完整流程

## 9. 移除建立者的幽靈投票（情境四手動驗證時發現，見 proposal.md/design.md 的 Addendum）

- [x] 9.1 移除 `createActivity` 的 `creatorSlotIndexes` 必填驗證（83-87 行）與 `creatorAvailability`/`ActivityAvailability.createMany` 的 insert（128-141 行）（design: 移除 creatorSlotIndexes/creatorAvailability 機制，不是「排除建立者的計票」）
- [x] 9.2 測試：情境三／四建立活動時不再要求 `creatorSlotIndexes`，缺少這個欄位也能成功建立（`createActivity` no longer requires or writes a creator availability row）
- [x] 9.3 測試：情境四只有 1 個真人參與者對某候選時段提交子區間時，`computeSlotOverlapRanking` 算出的 `perfect_overlap`/`partial_overlap` 票數等於 1，不是 2（Solo real participant's sub-range is not inflated by a phantom creator vote）
- [x] 9.4 測試：情境三只有 1 個真人參與者投給某候選時段時，`decision_candidates` 該筆的 `count` 等於 1，不是 2（Solo real participant's vote is not inflated by a phantom creator vote）
- [x] 9.5 新增 `getVotingParticipantCount(activity)`，回傳 `activity.participants` 排除 `creator_id` 後的人數，取代情境三／四 `decideFormationOutcome`/`is_unanimous` 目前使用的 `joinedCount`；`joinedCount`/`current_count`/`participants` 陣列（出席人數統計、`participant_target` 判定、頭像列表）維持不變，不套用這個新函式（design: 新增 votingParticipantCount，跟 joinedCount 分開用途）
- [x] 9.6 測試：情境三／四所有真人參與者都投給同一候選時段時，`is_unanimous`/`decideFormationOutcome` 正確判定全員一致，不會因為分母誤含建立者而永遠判定不一致（All real participants agreeing is correctly detected as unanimous）
- [x] 9.7 測試：`getActivity` 回傳的 `current_count`、`participants` 陣列、`已報名` 對應欄位不受這次調整影響，建立者仍計入出席人數（Attendance headcount still includes the creator）
- [x] 9.8 情境二（range 模式）：`getActivity`/`confirmFormation` 兩處呼叫移除 `allRanges = [...submittedRanges, {start: windowStart, end: windowEnd}]` 的虛擬建立者 range 注入，`computeRangeRanking` 的 `totalParticipants` 改用真人送出者依 `user_id` 去重後的人數（design: 情境二比照處理：移除虛擬 range 注入，totalParticipants 改用真人送出者去重數）
- [x] 9.9 測試：情境二只有建立者、沒有任何人報名時，`decision_candidates.perfect_overlap`/`partial_overlap` 都是空陣列，不會顯示建立者虛擬投票出來的整段時間（No real submissions yields an empty overlap ranking）
- [x] 9.10 測試：情境二同一個真人參與者用「+新增時段」送出兩筆不連續 range 時，`totalParticipants` 正確算成 1 人（去重），不是 2（A single participant's multiple ranges count as one voter）
- [x] 9.11 更新 `src/__tests__/activityStateMachine.test.js` 裡斷言 `creatorAvailability`/`creatorSlotIndexes` 行為的既有測試（397/433/475/506/534/633/645 行附近），移除或改寫成驗證新行為
- [x] 9.12 跑 `npx jest` 全套後端測試，確認情境一/二/三/四既有測試沒有因為這次調整而回歸
- [x] 9.13 更新 `API_DOCS.md`，移除 `creatorSlotIndexes` 請求欄位的說明（若有記載）
