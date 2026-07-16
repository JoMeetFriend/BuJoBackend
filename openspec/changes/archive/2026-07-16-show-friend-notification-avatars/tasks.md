## 1. Service TDD 與批次查詢

- [x] 1.1 先在 src/__tests__/notificationService.test.js 為「Notification actor response contract」與「Friendship actors are loaded in one batch」加入失敗測試，具體覆蓋 created/requester、accepted/receiver、null avatar、missing friendship、activity/general actor: null、重複與不同 friendship IDs 只呼叫一次 friendship.findMany、沒有 friendship references 時零次 findMany，以及 listing path 零次 friendship.findUnique；以 npm test -- --runTestsByPath src/__tests__/notificationService.test.js 驗證新測試在實作前因缺少 actor 或仍使用逐筆查詢而失敗。
- [x] 1.2 在 src/services/notificationService.js 完成「在 listUserNotifications 批次載入 friendship actor context」與「由通知 type 決定好友 actor」：去重有效 friendship reference IDs、非空時單次 findMany 載入 status/requester/receiver、建立 lookup，並映射 requester 或 receiver 為精確的 camelCase actor shape；以 npm test -- --runTestsByPath src/__tests__/notificationService.test.js 驗證 1.1 全部轉綠，且 LINE message 與 dismissal guard 的既有 friendship.findUnique 行為未被改動。

## 2. HTTP 契約與文件

- [x] 2.1 在 src/__tests__/notificationController.test.js 先新增或調整會因缺少 actor 而失敗的 HTTP response assertions，再完成「所有 notification response 固定包含 actor 欄位」與「Existing notification listing behavior is preserved」契約：好友通知回傳完整 id/displayName/avatarUrl，活動與一般通知回傳 actor: null，且既有 id、type、category、message、timeText、isRead、createdAt、reference、actions、排序及 dismissal 過濾不變；以 npm test -- --runTestsByPath src/__tests__/notificationController.test.js 驗證。
- [x] 2.2 在 API_DOCS.md 完成「以 service query contract 與 controller HTTP contract 分層驗證」的文件面：GET /api/notifications 範例包含 actor，通知類型說明明確列出 created=requester、accepted=receiver、avatarUrl 可為 null、friendship 缺失及 activity/general actor: null；以人工比對 friend-notification-actors spec 與文件中的欄位名稱、mapping、null cases 完全一致驗證。

## 3. 整體驗收

- [x] 3.1 執行 npm test -- --runTestsByPath src/__tests__/notificationService.test.js src/__tests__/notificationController.test.js，確認 service query contract 與 HTTP actor contract 的 targeted suites 全數通過。
- [x] 3.2 執行 npm test 與 git diff --check，確認完整 Jest suite 無回歸且所有變更沒有 whitespace errors；同時人工確認 git diff 未包含 Prisma schema、migration、endpoint、notification storage、LINE formatting 或前端變更。

## 4. Activity Creator Actor TDD

- [x] 4.1 先在 src/__tests__/notificationService.test.js 為「Activity-created notification actor」新增失敗測試，使用 spec example 的 activity-1／user-a／A／https://example.com/a.png 驗證 activity_created 回傳 creator actor，並覆蓋 creator avatar_url 為 null、activity 或 creator 缺失時 actor: null，以及 formation_ready、time_to_pick、activity_confirmed、activity_cancelled 與一般通知仍為 actor: null；以 npm test -- --runTestsByPath src/__tests__/notificationService.test.js 驗證新 assertions 在實作前因 activity_created 仍回傳 actor: null 而失敗。
- [x] 4.2 在 src/services/notificationService.js 完成「activity_created 重用 activity creator 作為 actor」：formatActivityNotification 只在 type 為 activity_created 且 creator 存在時，把既有 activity.findUnique 已載入的 creator 映射成精確的 id/displayName/avatarUrl，不新增 activity 或 user query，並保留其他 activity lifecycle/general actor: null 與既有 message/reference/actions；以 npm test -- --runTestsByPath src/__tests__/notificationService.test.js 驗證 4.1 全部轉綠。
- [x] 4.3 在 src/__tests__/notificationController.test.js 先將 activity_created HTTP response assertion 改為完整 creator actor 並確認 RED，再驗證實作後 actor 只含 camelCase id/displayName/avatarUrl、null avatar contract 與既有 id/type/category/message/timeText/isRead/createdAt/reference/actions 不變；同時驗證其他 activity lifecycle 與一般通知仍為 actor: null，並以 npm test -- --runTestsByPath src/__tests__/notificationController.test.js 驗證。
- [x] 4.4 在 API_DOCS.md 擴充 GET /api/notifications 的 actor 規則與通知類型表，明確記錄 activity_created actor=activity creator、avatarUrl 可為 null、activity/creator 缺失時 actor: null，以及其他 activity lifecycle/general actor: null；以人工逐項比對 friend-notification-actors spec 驗證文件 contract 一致。

## 5. 擴充範圍驗收

- [x] 5.1 執行 npm test -- --runTestsByPath src/__tests__/notificationService.test.js src/__tests__/notificationController.test.js，確認好友與 activity_created actor 的 service／HTTP contract targeted suites 全數通過。
- [x] 5.2 執行 npm test 與 git diff --check，確認完整 Jest suite 無回歸且沒有 whitespace errors；人工確認新增 diff 仍未包含 Prisma schema、migration、endpoint、notification storage、LINE formatting 或前端變更。
