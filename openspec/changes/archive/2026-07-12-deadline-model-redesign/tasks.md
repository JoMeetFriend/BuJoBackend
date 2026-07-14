## 1. `createActivity`：deadline_at/vote_deadline_at 語意反轉（設計決策：`deadline` 欄位語意反轉：從天花板變成報名截止）

- [x] 1.1 在 `src/__tests__/activityStateMachine.test.js` 新增測試：四個情境（固定時段、range 模式、find_date、find_date_time）各自送出 `POST /activities` 後，驗證建立出來的 `ActivitySchedule.deadline_at` 符合「Server-computed deadline_at ceiling per scheduling scenario」的四情境公式（情境 A＝活動本身 `slot_start`；情境 B＝`time_window_start` 或 `fixed_date`；情境 C／D＝所有候選時段中最晚一筆的 `slot_start`，對應「Scenario D vote deadline anchored to latest candidate slot」語意反轉後的版本），且 `vote_deadline_at` 等於請求送出的 `deadline` 欄位值。先確認測試在目前程式碼下失敗（RED）。
- [x] 1.2 修改 `createActivity`：依情境公式計算 `deadline_at`（不再直接寫入客戶端送的 `deadline`），並把客戶端送的 `deadline` 寫入 `vote_deadline_at`（Submitted deadline becomes vote_deadline_at and must precede deadline_at）。四個情境的 `scheduleExtra` 組裝邏輯都要調整，情境一（`else` 分支）新增 `vote_deadline_at` 欄位（目前完全沒有）。跑 1.1 的測試確認轉綠（GREEN）。
- [x] 1.3 新增測試：`deadline`（即將寫入 `vote_deadline_at`）等於或晚於伺服器算出的 `deadline_at` 天花板時，`POST /activities` 回應 400，且不建立任何 `Activity`/`ActivitySchedule`/`ActivityCandidateSlot` 記錄（涵蓋「Activity deadline must be in the future at creation time」中「Server-computed deadline_at already in the past is rejected」與「vote_deadline_at not earlier than deadline_at is rejected」兩個情境）。先確認測試失敗（RED）。
- [x] 1.4 在 `createActivity` 依情境算出 `deadline_at` 候選值後，新增兩項驗證（設計決策：新增驗證：`vote_deadline_at` 必須早於伺服器算出的 `deadline_at`，且 `deadline_at` 必須晚於現在）：`deadline_at <= now` 拒絕、送出的 `deadline` 不早於算出的 `deadline_at` 拒絕，皆回應 400 且不建立任何記錄。跑 1.3 的測試確認轉綠（GREEN）。

## 2. `getActivity` lazy check：狀態機統一（狀態機統一：四情境的「決策緩衝期」「逾期自動取消」「提早達標」共用同一套規則；移除 decideFormationOutcome／getLeaderSlots）

- [x] 2.1 在 `src/__tests__/activityStateMachine.test.js` 新增測試：四個情境各自在 `recruiting` 狀態、`vote_deadline_at` 已到期、`participant_target` 已達標（或未設定）時，觸發 `GET /api/activities/:id` 後活動狀態一律轉為 `voting`（不再依情境呼叫 `decideFormationOutcome` 判斷是否全員一致自動 `confirmed`），對應「Reaching the participant target never auto-confirms an activity」情境一／情境三的行為與新模型下情境四的行為。先確認測試在目前程式碼下失敗（RED，因為目前情境一會變 `confirmed`、情境三/四全員一致時也會變 `confirmed`）。
- [x] 2.2 修改 `getActivity` 的 `recruitingDeadline` 計算：四個情境一律使用 `vote_deadline_at`（目前只有 find_date／find_date_time 使用，情境一／二仍用舊的 `deadline_at`）。移除情境一 `!sched.requires_voting` 到期直接 `confirmed` 的分支，以及呼叫 `decideFormationOutcome` 的 `else` 分支，兩者改成一律回傳 `nextStatus = 'voting'`。跑 2.1 的測試確認轉綠（GREEN）。
- [x] 2.3 依設計決策「移除 `decideFormationOutcome`／`getLeaderSlots`」，刪除這兩個函式（`src/controllers/activityController.js`），確認全域搜尋沒有其他呼叫端後執行 `npm test` 全數通過，確認移除後沒有殘留引用造成的執行期錯誤。
- [x] 2.4 新增測試：`voting` 狀態的活動，`deadline_at` 已到期且 `confirmed_slot_id` 仍未設定時，四個情境（固定時段、range 模式、find_date、find_date_time）各自觸發 `GET /api/activities/:id` 後都自動轉為 `cancelled`，並對建立者與所有已報名參與者建立 `activity_cancelled` 通知，對應「Decision-buffer period expiring without confirmation cancels the activity across all scheduling scenarios」四個情境的 scenario。先確認測試失敗（RED，因為目前只有 range 模式有這個機制，且觸發欄位是 `vote_deadline_at`）。
- [x] 2.5 在 `getActivity` 新增涵蓋四情境的統一 lazy check：`currentStatus === 'voting' && now >= deadline_at && !confirmedSlot` → 轉 `cancelled` 並通知建立者與所有已報名參與者，取代原本只覆蓋 range 模式、對應舊需求「Vote deadline auto-cancellation」、且判斷式用 `vote_deadline_at` 的區塊。跑 2.4 的測試確認轉綠（GREEN）。
- [x] 2.6 新增測試：情境二（range 模式）在沒有設定 `participant_target`、`vote_deadline_at` 已到期、除建立者外無人提交可用時間時，仍然依既有「Zero-submission cancellation without a participant cap」邏輯轉為 `cancelled`（驗證觸發欄位已從 `deadline_at` 改成 `vote_deadline_at`，行為本身不變）。先確認測試在調整前的判斷欄位下會出現不一致（RED 或既有測試需要更新）。
- [x] 2.7 確認 `getActivity` 的 zero-submission 分支已隨 2.2 的 `recruitingDeadline` 調整改用 `vote_deadline_at`，跑 2.6 的測試確認轉綠（GREEN）。

## 3. `joinActivity`：報名截止檢查與提早達標統一（設計決策：`joinActivity` 報名截止檢查改用 `vote_deadline_at`）

- [x] 3.1 新增測試：`POST /:id/join` 對一個 `status` 仍是 `recruiting` 但 `vote_deadline_at < now`（`deadline_at` 卻還沒到）的活動送出報名請求，回應 400「此活動已截止報名」，且不建立 `ActivityParticipant` 記錄，對應「Join rejects activities past their deadline」的更新版本（觸發欄位從 `deadline_at` 改成 `vote_deadline_at`）。先確認測試在目前程式碼下失敗（RED）。
- [x] 3.2 修改 `joinActivity` 開頭的截止檢查，把 `activity.schedule.deadline_at < new Date()` 改成讀 `activity.schedule.vote_deadline_at`。跑 3.1 的測試確認轉綠（GREEN）。
- [x] 3.3 新增測試：情境一（固定時段）與情境二（range 模式）提早達標（`participant_target` 因本次報名而達標）時，活動狀態一律轉為 `voting` 並對建立者建立 `time_to_pick` 通知，對應「Reaching the participant target never auto-confirms an activity」的「Fixed-time activity reaching target transitions to voting」與「Range-mode activity reaching target transitions to voting」兩個情境。先確認測試在目前程式碼下失敗（RED，因為目前情境一停留 `recruiting` 不轉狀態、情境二被排除在判斷式外）。
- [x] 3.4 修改 `joinActivity` 的提早達標判斷式：拿掉 `!isRangeMode` 這個排除條件，並讓 `requiresVoting` 為 false（情境一）時也轉入 `voting`（不再只有 `requiresVoting` 為 true 才轉狀態），四個情境一律轉入 `voting` 並通知建立者。跑 3.3 的測試確認轉綠（GREEN）。

## 4. `confirmFormation`：過期候選時段檢查與情境一狀態放寬（設計決策：`confirmFormation`：新增過期候選時段檢查 + 放寬情境一的狀態檢查）

- [x] 4.1 新增測試：四個情境（固定時段的單一候選時段、range 模式的 `slotStart`/`slotEnd`、find_date 的 `candidateSlotId`、find_date_time 的 `candidateSlotId`+`slotStart`/`slotEnd`）各自對一個開始時間已經是過去式的候選時段呼叫 `confirmFormation`，回應 400 且不寫入 `confirmed_slot_id`、不建立新的 `ActivityCandidateSlot`、不改變活動狀態，對應「confirmFormation rejects a candidate whose start time has already passed」的四個 scenario。先確認測試在目前程式碼下失敗（RED，因為目前完全沒有這項檢查）。
- [x] 4.2 在 `confirmFormation` 四個分支各自找到 `winningSlot`／`matched`（range 模式與情境四是臨時算出的窄窗口）之後、寫入資料庫之前，新增「開始時間已早於現在則拒絕」的檢查，回應 400 並說明時段已過去。跑 4.1 的測試確認轉綠（GREEN）。
- [x] 4.3 新增測試：情境一（`!requiresVoting`）活動在 `voting` 狀態下（例如報名截止後尚未到決策硬截止）呼叫 `confirmFormation` 能成功確認成團，對應「Fixed-time activities may confirm formation while in voting status」的「Confirming a fixed-time activity that has transitioned to voting」情境。先確認測試在目前程式碼下失敗（RED，因為目前情境一分支只接受 `recruiting` 狀態）。
- [x] 4.4 把 `confirmFormation` 情境一分支的狀態檢查從 `activity.status !== 'recruiting'` 放寬成 `activity.status !== 'recruiting' && activity.status !== 'voting'`，跟其他情境分支的檢查方式一致。跑 4.3 的測試確認轉綠（GREEN）。

## 5. 文件同步

- [x] 5.1 更新 `API_DOCS.md` 的 `POST /activities` 段落：`deadline` 欄位語意說明改成「建立者選擇的報名截止時間（寫入 `vote_deadline_at`）」，補上四情境 `deadline_at` 計算公式的說明表格；`GET /api/activities/:id` 回應範例補上四情境都會出現 `vote_deadline_at` 欄位（目前情境一的範例沒有這個欄位）。人工核對文件內容與 1~4 節實際程式行為一致。

## 6. 收尾驗證

- [x] 6.1 執行 `npm test` 確認全數通過（含新增的所有測試），確認既有測試中若有斷言舊行為（例如情境一到期自動 `confirmed`、`decideFormationOutcome` 相關行為、`joinActivity`/`confirmFormation` 使用 `deadline_at` 判斷）的斷言已同步更新為新行為，不是被刪除或跳過。
- [x] 6.2 執行 `spectra validate deadline-model-redesign` 確認 proposal／design／specs／tasks 四份 artifact 彼此一致、無驗證錯誤。
