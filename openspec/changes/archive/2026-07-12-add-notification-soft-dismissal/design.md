## Context

目前通知資料只有 `is_read`，`GET /api/notifications` 會列出登入者的全部通知。現有 service 使用 `id + user_id` 的 `updateMany` 保護單筆已讀操作，好友邀請是否仍可操作則由 notification type 與 friendship 即時狀態組出 `actions`。本 change 要沿用既有 routes/controllers/services 分層，新增永久隱藏但保留資料列的 dismissal 行為。

## Goals / Non-Goals

**Goals:**

- 以 nullable `dismissed_at` 保存 soft dismissal 時間，且 dismissal 與標記已讀在同一次資料庫更新完成。
- 只允許登入者操作自己的尚未隱藏通知，並讓列表永久排除已隱藏資料。
- 後端強制保護仍為 pending 的好友邀請，避免直接呼叫 API 繞過前端限制。
- 維持既有通知列表 JSON shape、已讀 API 與通知資料列。

**Non-Goals:**

- 不提供 hard delete、復原、已刪除通知列表或 retention 清理。
- 不實作前端 Pointer Events、動畫或本地陣列更新。
- 不調整通知產生、LINE push、好友接受／拒絕流程。
- 不為本次欄位新增索引；先沿用現有 notification 查詢規模。

## Decisions

### Nullable timestamp 作為 soft dismissal 狀態

`Notification` 新增 `dismissed_at DateTime? @db.Timestamptz`。`null` 代表正常顯示，非 null 代表已永久隱藏；既有資料不需 backfill。相較新增 Boolean，timestamp 同時保留稽核時間，也不需要額外狀態欄位。

### 列表在資料庫查詢階段排除已隱藏通知

`listUserNotifications()` 的 `findMany` 條件同時包含 `user_id` 與 `dismissed_at: null`，避免先載入再由應用程式過濾。response 不加入 `dismissedAt`，所以前端既有列表 contract 不變；一般 `is_read: true` 且未 dismissal 的通知仍會回傳。

### Service 回傳明確的 dismissal outcome

新增 `dismissNotification({ userId, notificationId }, db = prisma)`，回傳 `dismissed`、`not_found` 或 `pending_friend_request` outcome，controller 據此映射 HTTP 狀態。Service 先以 `id + user_id + dismissed_at: null` 找出候選通知；找不到即為 `not_found`，使不存在、他人通知、重複 dismissal 對外維持相同 404 語意。

### 後端依 friendship 即時狀態保護待處理邀請

只有 `type = friend_request_created`、`reference_type = friendship` 且對應 friendship `status = pending` 時回傳 `pending_friend_request`，不執行通知更新。friendship 為 accepted、rejected 或已不存在時，通知的 `actions` 已不再包含接受／拒絕，允許 dismissal。相較只相信前端 `actions`，後端查詢可防止直接呼叫 endpoint 繞過規則。

### 單次條件更新完成已讀與 dismissal

允許 dismissal 時使用一個 `updateMany`，where 再次包含 `id + user_id + dismissed_at: null`，data 同時寫入 `is_read: true` 與 `dismissed_at: new Date()`。若 count 為 0，代表競態下已被 dismissal，回傳 `not_found`。pending 檢查若剛好與好友狀態變更競態，採保守拒絕並讓使用者重新整理後重試，不引入跨 service transaction。

### Controller 維持既有錯誤邊界

新增 `PATCH /api/notifications/:id/dismiss` 並掛載 `authenticate`。成功回傳 200 與「已移除通知」；找不到回傳 404 與「找不到通知」；pending 好友邀請回傳 409 與「待處理的好友邀請無法移除」；未預期 Prisma 例外由 controller 記錄並回傳既有 500「伺服器錯誤」。

## Implementation Contract

- **Behavior:** 一般通知與已完成好友邀請可以 dismissal；成功後資料列仍存在、`is_read` 為 true、`dismissed_at` 有時間值，而且後續列表不再回傳。pending 好友邀請保持可見且不得被更新。
- **Interface:** `PATCH /api/notifications/:id/dismiss` 需要有效登入 cookie；200 body 為 `{ "message": "已移除通知" }`，404 body 為 `{ "message": "找不到通知" }`，409 body 為 `{ "message": "待處理的好友邀請無法移除" }`，資料庫例外回傳 500 `{ "message": "伺服器錯誤" }`。
- **Data shape:** `notifications.dismissed_at` 為 nullable PostgreSQL timestamptz；`GET /api/notifications` 的 response fields 不變。
- **Acceptance:** Jest 要驗證 route authentication、outcome-to-status mapping、ownership、重複 dismissal、pending/accepted/rejected friendship、原子欄位更新與列表過濾；Prisma schema 驗證及正式 migration 套用成功；完整 `npm test` 通過。
- **In scope:** Prisma schema/migration、notification service/controller/route、對應 Jest 與 `API_DOCS.md`。
- **Out of scope:** 前端滑動互動、復原與 hard delete、通知產生與外部推播。

## Risks / Trade-offs

- [Risk] 新欄位上線前若先部署讀取 `dismissed_at` 的程式碼會造成查詢失敗 → 先套用向後相容的 nullable migration，再部署應用程式。
- [Risk] pending 判斷與好友狀態更新同時發生時，本次請求可能保守回傳 409 → 前端完成好友操作後重新取得通知並重試。
- [Risk] 沒有新增複合索引，通知量成長後列表查詢成本可能增加 → 先以既有規模交付，後續依查詢計畫另開效能 change。

## Migration Plan

1. 產生正式 migration `add_notification_dismissed_at`，只新增 nullable timestamptz 欄位，既有列自然為 null。
2. 在指定開發或可拋棄資料庫先執行 migration 並確認 Prisma Client 可產生、schema 可驗證。
3. 部署時先套用 migration，再部署使用新欄位的 API 程式碼。
4. 回滾應用程式時舊版會忽略 nullable 欄位；若確定不再需要且無 dismissal 稽核資料要保留，另以獨立 migration 移除欄位，不在緊急回滾直接刪除資料。

## Open Questions

無。HTTP contract、pending 保護、重複 dismissal 與資料保留策略均已定案。
