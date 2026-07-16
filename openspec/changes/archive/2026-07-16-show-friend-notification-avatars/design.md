## Context

GET /api/notifications 由 listUserNotifications 查出未 dismissal 的通知，再逐筆交給 formatter。此 change 前 6 個 tasks 已完成好友 actor：列表會先以單次 friendship.findMany 批次載入 requester 與 receiver，並讓 friend_request_created／friend_request_accepted 回傳 actor；所有 notification object 也已固定包含 actor key。

notifications 只保存 type 與 reference，friendship 已經關聯 requester、receiver，而 users 已有 display_name 與可為 null 的 avatar_url。好友 actor 已透過讀取與格式化完成，不需要資料模型或寫入流程變更。

好友 actor 與 friendship 批次查詢完成後，formatActivityNotification 已透過既有 activity.findUnique 查詢載入 creator 的 id、display_name、avatar_url 來組合活動文案，但 buildNotificationResponse 仍使用預設 actor: null。新增 activity_created actor 可以重用這份 creator 資料，不增加 database query。

## Goals / Non-Goals

**Goals:**

- GET /api/notifications 的每個 notification object 固定包含 actor。
- friend_request_created 使用 requester；friend_request_accepted 使用 receiver。
- activity_created 使用 activity creator，讓前端顯示活動建立者頭像。
- actor 對外固定為 { id, displayName, avatarUrl }，且 avatarUrl 可以是 null。
- friendship 找不到時安全回傳 actor: null，同時保留既有 fallback message、reference 與 actions 行為。
- 一次 listing 至多執行一次 friendship.findMany 批次查詢，並完全移除 listing formatter 的 friendship.findUnique。
- 以 service 與 controller 測試鎖定 response contract、fallback 與 query count，並同步 API_DOCS.md。

**Non-Goals:**

- 不為 activity_created 以外的活動生命週期通知或一般通知計算 actor；這些類型固定回傳 null。
- 不最佳化 activity formatter 的查詢策略。
- 不修改 LINE 推播使用的 buildFriendshipLineMessage 或其 friendship.findUnique。
- 不修改 Prisma schema、migration、notification row、routes、authentication、排序、dismissal 過濾、已讀操作或分頁。
- 不新增前端變更。

## Decisions

### 在 listUserNotifications 批次載入 friendship actor context

notification.findMany 完成後，先過濾 reference_type 為 friendship 且 reference_id 非 null 的通知，對 reference_id 去重。清單非空時以一次 friendship.findMany 查詢 id in unique IDs，並在同一查詢選取 id、status、requester 與 receiver；user selection 僅包含 id、display_name、avatar_url。若清單為空，不呼叫 friendship.findMany。

查詢結果轉為以 friendship id 為 key 的 Map，再將 Map 傳入 notification formatting path。好友 formatter 只讀 lookup，不再自行 await friendship.findUnique。這讓多筆相同或不同 friendship 通知都只有一次 friendship query，並保留 notification.findMany 的既有排序結果。

替代方案是在 formatter 內 Promise.all 多個 findUnique；雖然可平行化，但仍是 N 次 database round trip，因此不採用。

### 由通知 type 決定好友 actor

friend_request_created 的行為主體是發出邀請的 requester；friend_request_accepted 的行為主體是接受邀請的 receiver。formatter 從 lookup friendship 選出對應 user，並把 snake_case model fields 映射成 camelCase response：

{
  "id": "user-id",
  "displayName": "顯示名稱",
  "avatarUrl": null
}

avatar_url 為 null 時不丟棄 actor，避免前端失去名稱與 user id。friendship 或對應 user 缺失時 actor 為 null，不嘗試額外查詢。

替代方案是回傳完整 requester/receiver，會外洩不必要欄位並讓前端自行判斷 actor，因此不採用。

### activity_created 重用 activity creator 作為 actor

formatActivityNotification 既有 activity 查詢已 include creator，且 user selection 已限制為 id、display_name、avatar_url。當 notification.type 為 activity_created 且 activity.creator 存在時，formatter 將同一份 creator 資料映射為 { id, displayName, avatarUrl } 並傳給 buildNotificationResponse，不新增 activity 或 user 查詢。

activity_created 的 creator.avatar_url 為 null 時仍保留 actor。activity 或 creator 缺失時 actor 為 null，通知仍使用既有「有人」與「新活動」fallback。formation_ready、time_to_pick、activity_confirmed、activity_cancelled 雖然也使用 activity reference，但不是本次定義的「活動建立通知」，維持 actor: null。

替代方案是讓所有 activity notification 都回傳 creator，會把活動狀態事件錯誤表達成由 creator 發送，且超出使用者要求，因此不採用。

### 所有 notification response 固定包含 actor 欄位

buildNotificationResponse 接收 actor，預設為 null，確保好友、活動與一般 notification object 都有一致 key。兩種好友通知與 activity_created 可以傳入非 null actor；其他活動生命週期通知與一般通知沿用預設 null。

這是 additive API enhancement。既有欄位、message fallback、reference status、pending accept/reject actions、time formatting、isRead 與 createdAt 必須維持原值與 shape。

### 以 service query contract 與 controller HTTP contract 分層驗證

service 測試直接驗證好友與 activity_created actor mapping、null avatar、缺失 friendship/activity、其他 activity/general null，以及多筆好友通知只呼叫一次 friendship.findMany 且 listing path 不呼叫 friendship.findUnique。controller 測試透過 listNotifications 驗證 HTTP response 中完整 camelCase actor object，並以既有欄位 assertions 防止 additive change 誤改舊契約。

API_DOCS.md 的 GET /api/notifications response example 增加 actor，並說明兩種好友通知、activity_created 的 actor 對應與 null 規則。

## Implementation Contract

**Observable behavior**

- 每次成功呼叫 GET /api/notifications，notifications 陣列中的每個物件都包含 actor。
- friend_request_created 且 friendship 存在時，actor 等於 requester 的 id、displayName、avatarUrl。
- friend_request_accepted 且 friendship 存在時，actor 等於 receiver 的 id、displayName、avatarUrl。
- activity_created 且 activity.creator 存在時，actor 等於 creator 的 id、displayName、avatarUrl。
- requester、receiver 或 activity creator 的 avatar_url 為 null 時，actor 仍存在且 avatarUrl 必須為 null。
- friendship、activity 或 activity creator 不存在時，actor 必須為 null；activity_created 以外的活動生命週期通知與一般通知也必須為 null。
- actor enrichment 不得改變通知順序、dismissed_at: null 過濾、category、message、timeText、isRead、createdAt、reference 或 actions。

**Interface and data shape**

- Endpoint 維持 GET /api/notifications。
- 非 null actor 的唯一允許 shape 是 { "id": string, "displayName": string, "avatarUrl": string | null }，key 必須為 camelCase，不得回傳 display_name、avatar_url 或其他 user 欄位。
- listUserNotifications 對至少一筆有效 friendship reference 的 listing 執行一次 friendship.findMany；where 使用去重後的 friendship IDs，查詢同時載入 requester 與 receiver 的 id、display_name、avatar_url。
- listing formatting path 不得呼叫 friendship.findUnique。LINE message 與 dismissal guard 既有的 friendship.findUnique 不在此限制內。
- activity_created actor 必須重用 formatActivityNotification 已取得的 activity.creator，不得新增額外 activity 或 user query。

**Failure and fallback behavior**

- 批次查詢未回傳某個 referenced friendship 時，該通知仍須格式化並回傳，actor 為 null、reference.status 為 null，message 使用既有「有人」或「對方」fallback，actions 為空。
- 沒有 friendship references 時不得執行 friendship.findMany；activity_created 依 creator 規則回傳 actor，其他活動生命週期通知與一般通知仍正常格式化且 actor 為 null。
- activity_created 查不到 activity 或 creator 時仍須回傳通知，actor 為 null，並保留既有活動 message 與 reference fallback。
- 本變更不得新增新的 HTTP error response 或把資料缺失提升為 500。

**Acceptance criteria**

- src/__tests__/notificationService.test.js 覆蓋 created/requester、accepted/receiver、activity_created/creator、null avatar、missing friendship/activity/creator、其他 activity actor null、general actor null、單次 findMany 與 listing path 零次 findUnique。
- src/__tests__/notificationController.test.js 驗證好友與 activity_created 的 200 response 完整 actor camelCase contract，並保留既有 notification fields assertions。
- API_DOCS.md 描述好友與 activity_created 的 actor shape、mapping 與 null cases。
- npm test -- --runTestsByPath src/__tests__/notificationService.test.js src/__tests__/notificationController.test.js 通過。
- npm test 通過。
- git diff --check 通過。

**Scope boundaries**

- In scope: notification listing enrichment、friendship batch loading、activity_created creator actor、相關 Jest 測試與 API 文件。
- Out of scope: database migration、notification writes、LINE notification formatting、其他 activity lifecycle actor、前端 rendering、route 或 authentication 變更。

## Risks / Trade-offs

- [Risk] friendship ID 數量會隨通知列表大小增加，findMany 的 in 條件可能變大。→ Mitigation：只收集當次已由既有 listing 查出的 friendship references 並先去重，不額外擴張資料範圍。
- [Risk] 共用 formatter 改成接受 lookup 後可能意外改變既有 message 或 actions。→ Mitigation：保留現有 formatting branches，只替換 friendship 資料來源並以既有 controller assertions 加上新 actor assertions 驗證。
- [Risk] friendship 被刪除後無法取得歷史 actor。→ Mitigation：明確定義 actor: null 與既有 fallback message；本次不引入 actor snapshot storage。
- [Risk] actor 反映目前 creator profile，而不是通知建立當下的頭像 snapshot。→ Mitigation：沿用現有 reference-based formatting 模式並明確不新增 snapshot storage；creator 或 activity 遺失時回傳 actor: null。

## Migration Plan

不需要 database migration。部署可直接隨 application code 發布；actor 是 additive response field，既有 client 可忽略。若需要 rollback，回退 service、測試與 API 文件變更即可，notification data 不需轉換。

## Open Questions

無；好友與 activity_created actor mapping、null fallback、query strategy 與 scope 已在本設計固定。
