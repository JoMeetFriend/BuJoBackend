## Why

使用者目前無法從通知列表永久隱藏已處理或不再需要的通知，列表會持續累積。需要提供保留資料列以供稽核的 soft dismissal，同時確保待處理好友邀請必須先接受或拒絕，不能直接略過。

## What Changes

- 在通知資料加入 nullable dismissal 時間；既有資料維持未隱藏。
- 通知列表只回傳目前使用者且尚未 dismissal 的資料，既有 response shape 不變。
- 新增受登入驗證保護的 PATCH /api/notifications/:id/dismiss，將通知同時標記已讀並寫入 dismissal 時間，不刪除資料列。
- dismissal 僅能操作目前使用者的尚未隱藏通知；不存在、他人通知、已隱藏通知回傳 404。
- 待處理的好友邀請由後端拒絕 dismissal 並回傳 409；接受或拒絕後才允許操作。
- 同步補齊 Prisma migration、API 文件與 Jest 測試。

## Capabilities

### New Capabilities

- `notification-dismissal`: 定義通知 soft dismissal、列表過濾、所有權保護、待處理好友邀請限制與 HTTP response contract。

### Modified Capabilities

（無）

## Impact

- Affected specs: notification-dismissal
- Affected code:
  - New: Prisma migration directory for add_notification_dismissed_at
  - Modified: `prisma/schema.prisma`, `src/services/notificationService.js`, `src/controllers/notificationController.js`, `src/routes/notifications.js`, `src/__tests__/notificationService.test.js`, `src/__tests__/notificationController.test.js`, `API_DOCS.md`
  - Removed: none
