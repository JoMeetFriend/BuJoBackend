## 1. 資料庫 Schema 變更

- [x] 1.1 在 `prisma/schema.prisma` 的 `Notification` model 新增 `@@index([user_id, is_read])`，並執行 `prisma migrate dev` 產生對應 migration；驗證方式：檢查 `prisma/migrations/` 下新增的 migration 資料夾內 SQL 只包含一行 `CREATE INDEX`，且 `prisma migrate status` 顯示 migration 已套用、無 pending 變更。

## 2. Service 層實作：Unread notification count endpoint

- [x] 2.1 實作 Requirement「Unread notification count endpoint」：在 `src/services/notificationService.js` 新增 `countUnreadNotifications({ userId }, db = prisma)`，回傳 `db.notification.count({ where: { user_id: userId, is_read: false } })` 的結果，且 `userId` 缺失時 throw Error；驗證方式：`src/__tests__/notificationService.test.js` 新增測試，涵蓋「回傳 prisma.notification.count 的結果」與「userId 缺失時 throw」兩種情境並通過。

## 3. Controller 層實作：Unread notification count endpoint

- [x] 3.1 實作 Requirement「Unread notification count endpoint」：在 `src/controllers/notificationController.js` 新增 `getUnreadCount(req, res)`，呼叫 `countUnreadNotifications({ userId: req.user.userId })` 並以 `res.json({ unreadCount: count })` 回傳 200，遇到例外時回傳 500 `{ message: "伺服器錯誤" }`（比照 `listNotifications` 的 try/catch 樣式）；驗證方式：`src/__tests__/notificationController.test.js` 新增測試，涵蓋正常回傳 `{ unreadCount: n }` 與 `prisma.notification.count` reject 時回 500 兩種情境並通過。

## 4. Route 註冊：Unread notification count endpoint

- [x] 4.1 實作 Requirement「Unread notification count endpoint」：在 `src/routes/notifications.js` 新增 `router.get("/unread-count", authenticate, getUnreadCount)`；驗證方式：`src/__tests__/notificationController.test.js` 新增「使用 authenticate middleware 保護未讀數 API」測試，檢查該路由 stack 第一個 handler 名稱為 `authenticate`，並通過。

## 5. Unread count 與已讀狀態同步：Unread count reflects read-state changes

- [x] 5.1 驗證 Requirement「Unread count reflects read-state changes」：呼叫 `PATCH /api/notifications/:id/read` 後，`countUnreadNotifications` 回傳值反映 mocked `prisma.notification.count` 的最新結果（以 mock 依序回傳不同數值模擬狀態變化）；驗證方式：`src/__tests__/notificationController.test.js` 新增測試「單筆已讀後未讀數應遞減」並通過。
- [x] 5.2 驗證 Requirement「Unread count reflects read-state changes」：呼叫 `PATCH /api/notifications/read-all` 後，`GET /api/notifications/unread-count` 回傳 `{ unreadCount: 0 }`；驗證方式：`src/__tests__/notificationController.test.js` 新增測試「全部已讀後未讀數歸零」並通過。

## 6. API 文件更新

- [x] 6.1 在 `API_DOCS.md` 的「## Notifications」章節新增 `GET /api/notifications/unread-count` 說明，包含狀態碼表格（200/401）與 response JSON 範例 `{ "unreadCount": 3 }`；驗證方式：人工檢視 `API_DOCS.md` 該章節內容與實際 API 行為一致（欄位名稱、狀態碼皆吻合）。

## 7. End-to-End 驗證

- [x] 7.1 執行 `npm test -- notificationService notificationController`，確認新增與既有測試全數通過；驗證方式：測試指令 exit code 為 0，且輸出無 failing tests。
- [x] 7.2 啟動本地伺服器並以已登入 cookie 呼叫 `GET /api/notifications/unread-count`，確認回傳的 `unreadCount` 與資料庫中該使用者 `is_read = false` 筆數一致；再呼叫 `PATCH /api/notifications/read-all` 後重打一次，確認變成 `{ "unreadCount": 0 }`；驗證方式：手動 curl 驗證兩次呼叫結果符合預期。
