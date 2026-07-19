## 1. 後端：候選時段顯示改用既有的 formatHHMM，parseDateTime 先支援雙格式

- [x] 1.1 `parseDateTime` 過渡期同時接受舊格式與新格式（`上午/下午 H:MM` 與 `HH:MM`）兩種時間字串，兩種格式都能正確解析回相同的 `Date` 物件（Backend accepts both legacy and new time string formats during the transition period）。驗證：`src/__tests__/activityStateMachine.test.js` 新增/更新測試案例，分別餵入 `'上午 9:00'` 與 `'09:00'`，斷言解析出的 `Date` 小時數字相同
- [x] 1.2 `formatCard` 顯示候選時段時間改成呼叫既有的 `formatHHMM`（原本用在情境二時間窗顯示的同一個函式），刪除重複實作的 `formatTime`——只輸出零填充 24 小時制格式（`HH:MM`），不再輸出「上午/下午」（Backend outputs displayed times in zero-padded 24-hour format）。驗證：測試斷言 `formatHHMM(hour=9 的 Date) === '09:00'`、`formatHHMM(hour=23 的 Date) === '23:00'`，且透過 `getActivity`/`listActivities` 回應確認候選時段的 `time` 欄位不再出現「上午/下午」
- [x] 1.3 確認 `formatHHMM` 輸出的字串能被 `parseDateTime` 新格式分支解析回相同小時分鐘（formatHHMM output round-trips through parseDateTime）。驗證：round-trip 測試，對 0~23 每個小時，`parseDateTime` 解析 `formatHHMM` 的輸出字串得到相同小時數字

## 2. 測試字面值更新與前後端一致性 fixture

- [x] 2.1 把 2 個測試檔（`activityStateMachine.test.js`、`scenarioBRange.test.js`）裡約 40 處「上午/下午」時間字面值全部改成對應的 24 小時制格式（新格式測試優先，並保留至少幾筆舊格式輸入的測試案例以涵蓋雙格式相容需求）。驗證：後端測試指令（`npm test`）全數通過
- [x] 2.2 新增後端這一側的時間字面值 fixture 校驗測試（例如斷言 `formatHHMM(9 點的 Date) === '09:00'`），並在任務描述或程式碼註解中標明這個字面值需要跟 `BuJo` 的對應 change 裡前端 `createTimeOptions()[9]` 的斷言保持一致。驗證：後端測試通過，字面值與 `BuJo` 對應測試使用相同字串

## 3. 部署與端到端驗證

- [x] 3.1 部署後端（雙格式相容上線），確認舊格式（`上午/下午 H:MM`）與新格式（`HH:MM`）的 payload 都能成功建立活動。驗證：手動或腳本分別用舊格式與新格式的 payload 打後端 API，兩者皆回傳成功
- [x] 3.2 執行完整後端回歸：後端測試指令全數通過。驗證：`npm test`（或對應測試指令）無失敗案例，且 3.1 的手動驗證已完成
