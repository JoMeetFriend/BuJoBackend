## 1. 共用 helper：從 segments 篩出時間重疊的 co_participants

- [x] 1.1 測試：新增 `collectOverlappingCoParticipants(segments, myStart, myEnd, myUserId)` 的單元測試——涵蓋「時間有重疊的 segment 的 supporter 出現在結果裡」「交接情境（前一筆 end === 後一筆 start，時間不算重疊）的 supporter 不出現」「排除 `myUserId` 自己」三種情況（design: 共用 helper：從 segments 篩出跟我自己時間重疊的 supporters）
- [x] 1.2 在 `activityController.js` 實作 `collectOverlappingCoParticipants`，讓 1.1 的測試通過（design: 共用 helper：從 segments 篩出跟我自己時間重疊的 supporters）

## 2. 情境二（range 模式）：decision_candidates 限定建立者、my_ranges 新增 co_participants

- [x] 2.1 測試：`getActivity` 的 `isRangeMode` 分支，非建立者請求時回應的 `decision_candidates` 為 `null`；建立者請求時維持現有完整格式不變（spec: Decision candidates are restricted to the activity creator — Non-creator receives null decision_candidates / Creator still receives the full ranked list）
- [x] 2.2 依 2.1 修改 `getActivity` 的 `isRangeMode` 分支，依 `isCreator` 決定 `decision_candidates` 賦值（design: decision_candidates 只回傳給建立者）
- [x] 2.3 測試：非建立者回應的 `my_ranges[]` 每筆正確附上 `co_participants`——用 Alice 18:00-20:00、Bob 19:00-21:00 驗證重疊情境正確互相看到彼此；用 Alice 09:00-10:00、Bob 10:00-11:00 驗證交接情境不重疊、互相看不到；驗證建立者即使有殘留 range 紀錄也不會出現在任何人的 `co_participants` 裡（spec: my_ranges expose overlapping co-participants to non-creator viewers — 三個情境）
- [x] 2.4 依 2.3 修改 `getActivity` 的 `isRangeMode` 分支，在組裝 `my_ranges[]` 時對每一筆呼叫 1.2 的 helper 附上 `co_participants`（design: 情境二 my_ranges co_participants 計算）
- [x] 2.5 移除規格裡過時、跟現行程式碼矛盾的「Creator is treated as always available」需求文字（該需求宣稱系統會把建立者視為對每個候選格都有空，但程式碼在更早的幽靈投票修復時已經改成排除建立者，規格文字沒有同步移除），確認 `spectra validate` 通過（design: 清除過時的規格文字）

## 3. 情境三（find_date）：decision_candidates 限定建立者、candidate_slots 新增 co_participants

- [x] 3.1 測試：`getActivity` 的 find_date 分支，非建立者請求時回應的 `decision_candidates` 為 `null`；建立者不受影響（spec: Decision candidates are restricted to the activity creator）
- [x] 3.2 依 3.1 修改 `getActivity` 的 find_date 分支（design: decision_candidates 只回傳給建立者）
- [x] 3.3 測試：非建立者回應的 `candidate_slots[]` 正確附上 `co_participants`——兩個真人參與者都選了候選時段 X 時互相看得到對方；一個選 X、一個選 Y 時看不到彼此；使用者自己沒選的候選時段 `co_participants` 一律是空陣列（spec: candidate_slots expose same-day co-participants to non-creator viewers — 三個情境）
- [x] 3.4 依 3.3 修改 `getActivity` 的 find_date 分支，組裝 `candidate_slots[]` 時依 `is_selected` 附上 `co_participants`（design: 情境三不需要共用 helper，直接篩 candidate_slot_id 相同的 availabilities）

## 4. 情境四（find_date_time）：decision_candidates 限定建立者、candidate_slots 新增 co_participants

- [x] 4.1 測試：`getActivity` 的 find_date_time 分支，非建立者請求時回應的 `decision_candidates` 為 `null`；建立者不受影響（spec: Decision candidates are restricted to the activity creator）
- [x] 4.2 依 4.1 修改 `getActivity` 的 find_date_time 分支（design: decision_candidates 只回傳給建立者）
- [x] 4.3 測試：非建立者回應的 `candidate_slots[]` 正確附上 `co_participants`——沿用 design.md 的三參與者範例（候選時段 09:00-12:00，A 09:00-10:00、B 09:30-11:00、C 無子區間），驗證 A 跟 B 因為子區間重疊互相看得到，A 跟 C 因為 C 涵蓋整個窗口也看得到 A；另外驗證交接不重疊情境（A 09:00-10:00、B 10:00-11:00 互相看不到）；驗證使用者自己沒選的候選時段 `co_participants` 一律是空陣列（spec: candidate_slots expose overlapping co-participants to non-creator viewers — 四個情境）
- [x] 4.4 依 4.3 修改 `getActivity` 的 find_date_time 分支，組裝 `candidate_slots[]` 時對每個 `is_selected` 的候選時段呼叫 1.2 的 helper，`myStart`/`myEnd` 依該使用者的 `my_range`（沒有子區間時 fallback 成整個候選時段的 `slot_start`/`slot_end`，跟 `computeSlotOverlapRanking` 內部規則一致）（design: 情境四 candidate_slots co_participants 計算，共用 collectOverlappingCoParticipants）

## 5. 收尾：規格清理、文件、驗證

- [x] 5.1 更新 `API_DOCS.md`：`decision_candidates` 欄位說明新增「非建立者一律為 null」；`my_ranges[]`／`candidate_slots[]` 新增 `co_participants` 欄位說明與範例
- [x] 5.2 跑 `npm test` 全套後端測試，確認情境二/三/四新增測試通過、既有建立者視角的測試（`decision_candidates` 完整格式）沒有回歸（已知 `authGoogle`/`authMiddleware`/`authRoutes` 三個測試檔案有跟這次改動無關的既有環境性失敗，不列入回歸判斷）
- [x] 5.3 手動驗證：用種子帳號建一個情境四活動，兩個參與者子區間重疊、一個不重疊，確認建立者仍看到完整排名，重疊的兩人各自的 `candidate_slots[].co_participants` 看得到對方，不重疊的那個人看不到前兩人
