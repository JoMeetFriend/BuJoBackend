## Why

通知按鈕與通知頁面需要顯示未讀通知數（badge），但後端目前沒有任何低成本查詢未讀數量的 API。前端只能拉取 `GET /api/notifications` 整個列表再自行計算未讀筆數，無法在多個頁面（不只是通知列表頁）輕量、高頻地顯示未讀數。

## What Changes

- 新增 `GET /api/notifications/unread-count` API，回傳目前登入者的未讀通知數（`{ "unreadCount": n }`），沿用既有的 `authenticate` middleware 保護。
- `src/services/notificationService.js` 新增 `countUnreadNotifications({ userId }, db = prisma)`，用 `db.notification.count({ where: { user_id, is_read: false } })` 計算未讀數，不新增任何快取欄位。
- `prisma/schema.prisma` 的 `Notification` model 新增 `@@index([user_id, is_read])` composite index，並產生對應的 Prisma migration，提升未讀數查詢與既有 `listUserNotifications`／`markAllNotificationsAsRead` 查詢效能。
- 更新 `API_DOCS.md` 的「## Notifications」章節，補上新端點的說明與 response 範例。
- 新增對應的單元測試（service 層與 controller/route 層）。

## Non-Goals

- 不在 `User` model 上新增任何未讀數快取欄位（例如 `unreadNotificationCount`）。理由：目前通知量小，`is_read` 逐筆查詢已足夠；若改用快取欄位，需要在 `createNotification`、`notifyFriendsActivityCreated`、`markNotificationAsRead`、`markAllNotificationsAsRead`，以及 `activityController.js` 內多處直接呼叫 `tx.notification.create[Many]` 的地方同步增減，風險高且容易產生資料不一致，暫不採用。
- 不將未讀數塞進既有 `GET /api/notifications` 回應（不新增 `unreadCount` 欄位到列表 API），改以獨立端點提供，讓通知按鈕可以不拉整個列表就輪詢未讀數。
- 不引入背景任務、事件佇列或 WebSocket 即時推播未讀數；未讀數維持「前端主動輪詢 REST API」的既有互動模式。

## Capabilities

### New Capabilities

- `notification-unread-count`: 提供「查詢目前登入者未讀通知數」的能力，供通知按鈕/頁面即時顯示未讀 badge。

### Modified Capabilities

(none)

## Impact

- Affected specs: `notification-unread-count`（新增）
- Affected code:
  - New: prisma/migrations/ 目錄下新增一個 migration 資料夾（內容為新增 notifications 表的 composite index，資料夾名稱由 `prisma migrate dev` 依時間戳記自動產生）
  - Modified:
    - src/services/notificationService.js
    - src/controllers/notificationController.js
    - src/routes/notifications.js
    - prisma/schema.prisma
    - API_DOCS.md
    - src/__tests__/notificationService.test.js
    - src/__tests__/notificationController.test.js
  - Removed: (none)
