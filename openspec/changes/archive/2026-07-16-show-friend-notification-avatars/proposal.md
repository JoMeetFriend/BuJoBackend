## Summary

讓通知列表 API 為好友邀請與活動建立通知回傳可直接顯示的 actor 使用者資料，同時以批次查詢避免好友通知造成 N+1 database queries。

## Motivation

前端通知頁需要顯示好友邀請發起者、接受者，以及活動建立者的頭像與名稱，但原始 GET /api/notifications 只有文字訊息與 reference，缺少穩定的 actor contract。好友 actor 與批次查詢完成後，activity_created 仍回傳 actor: null，無法顯示已由 activity formatter 載入的 creator 頭像。

## Proposed Solution

- 為 GET /api/notifications 的每筆通知新增 actor 欄位。
- friend_request_created 的 actor 對應 friendship requester；friend_request_accepted 的 actor 對應 friendship receiver。
- activity_created 的 actor 對應 activity creator，直接重用 activity formatter 已載入的 creator 資料。
- actor 固定使用 camelCase 的 id、displayName、avatarUrl；使用者沒有頭像時仍回傳 actor，且 avatarUrl 為 null。
- friendship 或 activity 遺失時回傳 actor: null；activity_created 以外的活動生命週期通知與一般通知也回傳 actor: null。
- 列表服務先收集好友通知的 friendship reference IDs，再以單次 friendship.findMany 載入 requester 與 receiver，建立 lookup map 後格式化，避免逐筆 friendship.findUnique。
- 同步擴充 service/controller 測試與 API 文件，保留既有通知欄位及行為。

## Non-Goals

- 不變更 Prisma schema、migration 或 notifications 儲存格式。
- 不新增或改名 API endpoint。
- 不替 activity_created 以外的活動生命週期通知或一般通知提供非 null actor。
- 不改變通知排序、dismissal 過濾、reference、actions、message、已讀狀態或分頁行為。
- 不變更 LINE 推播建立 friendship 訊息時既有的查詢流程。

## Alternatives Considered

- 由前端根據 friendship reference 逐筆取得使用者資料：會增加前端耦合與額外 HTTP requests，且無法提供一致的 notification response contract。
- 在每筆通知 formatter 內繼續使用 friendship.findUnique：實作直接，但保留 N+1 query 問題。
- 將 actor snapshot 寫入 notification row：需要 schema、migration 與寫入流程變更，超出本次 response enhancement 範圍。

## Capabilities

### New Capabilities

- `friend-notification-actors`: 定義通知列表中好友邀請與 activity_created actor 的選擇規則、camelCase response contract、缺失資料 fallback，以及 friendship 批次載入要求。

### Modified Capabilities

（無）

## Impact

- Affected specs: friend-notification-actors
- Affected API: GET /api/notifications response
- Affected code:
  - Modified:
    - src/services/notificationService.js
    - src/__tests__/notificationService.test.js
    - src/__tests__/notificationController.test.js
    - API_DOCS.md
  - New:
    - openspec/changes/show-friend-notification-avatars/specs/friend-notification-actors/spec.md
  - Removed: none
- Database and dependencies: no schema, migration, storage format, or package changes
