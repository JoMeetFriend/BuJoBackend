## 1. notificationService 推播能力

- [x] 1.1 擴充 buildActivityLineMessage 支援型別參數，文案與站內通知共用：`buildActivityLineMessage({ activityId, type }, db)` 依 `type` 回傳與 `buildActivityMessage` 相同的文案（`formation_ready`→「「{title}」人數已滿，請確認成團」、`time_to_pick`→「「{title}」候選時段票數不相上下，請選擇最終時段」、`activity_confirmed`→「「{title}」已確認成團」、`activity_cancelled`→「「{title}」已取消」），未知或未帶 `type` 時維持既有活動建立文案。驗證：`src/__tests__/notificationService.test.js` 新增四種型別的文案斷言與 fallback 斷言，跑 `npx cross-env NODE_OPTIONS=--experimental-vm-modules jest src/__tests__/notificationService.test.js` 通過
- [x] 1.2 新增 sendActivityLifecycleLineNotifications 批次推播函式：`src/services/notificationService.js` export `sendActivityLifecycleLineNotifications({ userIds, activityId, type }, db)`，共用單一 lazy 文案 promise，對每個 userId 經 `deliverLineNotification` 送出，`userIds` 為空陣列時不呼叫 LINE、回傳空陣列；未綁定 LINE 或偏好關閉的使用者被略過、`sendLinePushMessage` 拋錯時函式仍正常返回不外拋。驗證：`notificationService.test.js` 新增送達／未綁定略過／偏好關閉略過／拋錯不外拋四類測試通過

## 2. 人數達標通知型別修正

- [x] 2.1 人數達標改發 formation_ready，截止進決選維持 time_to_pick：`src/controllers/activityController.js` 的 joinActivity 在 targetReached 時建立的站內通知型別改為 `NOTIFICATION_TYPES.FORMATION_READY`（import 常數取代字串 literal），招募截止 lazy 轉換仍建立 `time_to_pick`，滿足 spec「Reaching the participant target never auto-confirms an activity」。驗證：`src/__tests__/activityStateMachine.test.js` 與 `src/__tests__/scenarioBRange.test.js` 中人數達標情境的通知型別斷言更新為 `formation_ready`、截止進決選情境維持 `time_to_pick`，兩套測試通過

## 3. activityController 推播接線

- [x] 3.1 LINE 推播在交易提交後發送，樂觀鎖敗者不推播——lazy 狀態轉換：招募截止轉 `voting` 後對建立者送 `time_to_pick` 推播、轉 `cancelled` 後對全體參與者送 `activity_cancelled` 推播、決選期逾期自動取消後對全體參與者送 `activity_cancelled` 推播，皆在 `won === true` 分支且交易返回後呼叫 `sendActivityLifecycleLineNotifications`，滿足 spec「LINE push delivery for activity lifecycle notifications」。驗證：`activityStateMachine.test.js` 新增斷言——轉換成功後推播函式被以正確 type 與收件人呼叫、樂觀鎖敗者分支未呼叫
- [x] 3.2 joinActivity 達標與 confirmFormation、cancelActivity 的推播接線：達標交易返回後對建立者送 `formation_ready` 推播；confirmFormation 的 `won === true` 後對其他參與者送 `activity_confirmed` 推播；cancelActivity 的 `won === true` 後對其他參與者送 `activity_cancelled` 推播；推播失敗不改變 API 回應（報名回 200「報名成功」、成團回 200「成團成功」、取消回 200「活動已取消」）。驗證：controller 測試 mock `sendLinePushMessage`（或推播函式）斷言呼叫對象與型別，並含推播拋錯仍回 200 的案例

## 4. 文件與收尾

- [x] 4.1 API_DOCS.md 通知型別章節更新：載明 `formation_ready` 為人數達標通知（文案「人數已滿，請確認成團」）、`time_to_pick` 保留給截止進決選，並註明四種活動生命週期通知具備 LINE 推播。驗證：內容審閱確認與 spec delta 一致
- [x] 4.2 全套測試回歸：`npx cross-env NODE_OPTIONS=--experimental-vm-modules jest` 全部通過，無因型別改動而遺漏更新的斷言。驗證：測試輸出零失敗
