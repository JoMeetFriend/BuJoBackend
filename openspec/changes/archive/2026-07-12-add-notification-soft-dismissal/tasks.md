## 1. 先建立失敗測試

- [x] 1.1 在 `src/__tests__/notificationService.test.js` 建立 service contract 測試，涵蓋「Persist notification soft dismissal」、「Enforce dismissal ownership and visible-state boundaries」、「Exclude dismissed notifications from the normal list」與「Protect pending friend request notifications」；測試須先證明列表需要 `dismissed_at: null`、單次更新兩欄、404 outcome、pending 阻擋及 accepted/rejected 放行，並以 `npm test -- --runTestsByPath src/__tests__/notificationService.test.js` 驗證實作前失敗、實作後通過。
- [x] 1.2 在 `src/__tests__/notificationController.test.js` 建立 HTTP contract 測試，涵蓋「Protect the dismissal endpoint with authentication」與「Return a server error for dismissal failures」，驗證 `PATCH /:id/dismiss` 掛 `authenticate`，且 dismissed/not_found/pending_friend_request/exception 分別映射 200/404/409/500 與精確 JSON；以 `npm test -- --runTestsByPath src/__tests__/notificationController.test.js` 驗證。

## 2. 資料模型與 Service

- [x] 2.1 依「Nullable timestamp 作為 soft dismissal 狀態」在 `prisma/schema.prisma` 新增 `dismissed_at DateTime? @db.Timestamptz`，產生正式 `add_notification_dismissed_at` migration，確認 SQL 只新增 nullable timestamptz 且不刪除或 backfill 既有通知；以 `npx prisma validate`、migration SQL review 與指定開發資料庫 migration apply 驗證。
- [x] 2.2 依「列表在資料庫查詢階段排除已隱藏通知」修改 `listUserNotifications()`，讓 `GET /api/notifications` 只讀取登入者且 `dismissed_at: null` 的資料，同時保留既有 response fields 並繼續包含一般已讀通知；以 1.1 的列表測試驗證。
- [x] 2.3 依「Service 回傳明確的 dismissal outcome」與「後端依 friendship 即時狀態保護待處理邀請」實作 `dismissNotification({ userId, notificationId }, db = prisma)`，只選取 owned、visible 通知並回傳 `dismissed`、`not_found`、`pending_friend_request`；pending `friend_request_created` 不更新，accepted/rejected 可繼續操作，以 1.1 的 ownership、重複 dismissal 與 friendship 狀態測試驗證。
- [x] 2.4 依「單次條件更新完成已讀與 dismissal」讓允許的 dismissal 使用一個 `updateMany`，where 再次限制 `id + user_id + dismissed_at: null`，data 同時寫入 `is_read: true` 與目前時間；count 為 0 回傳 `not_found` 且原 dismissal timestamp 不被覆寫，以 1.1 的 Prisma call assertion 驗證。

## 3. HTTP 介面與文件

- [x] 3.1 依「Controller 維持既有錯誤邊界」在 notification controller 與 router 新增受驗證保護的 `PATCH /api/notifications/:id/dismiss`，精確回傳 200「已移除通知」、404「找不到通知」、409「待處理的好友邀請無法移除」及 generic 500「伺服器錯誤」；以 1.2 的 route 與 controller 測試驗證。
- [x] 3.2 更新 `API_DOCS.md`，記錄 dismissal endpoint、200/401/404/409/500 contract、soft dismissal 資料保留，以及 `GET /api/notifications` 排除 dismissed 但 response shape 不變；以文件內容 review 對照 notification-dismissal spec 驗證沒有未記錄的狀態碼或 body 差異。

## 4. 整合驗證

- [x] 4.1 完成 Implementation Contract 驗收：依序執行兩個 notification targeted test、完整 `npm test`、`npx prisma validate`，並在指定開發或可拋棄資料庫確認既有列 `dismissed_at` 為 null、成功 dismissal 後資料列仍存在且已讀、列表不再回傳、pending 好友邀請仍可見且回傳 409；保存命令結果與 DB read-back 作為完成證據。
