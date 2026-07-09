# BuJo Backend — API 文檔

Base URL：`http://localhost:3000`  
Production：`https://bujo-backend.onrender.com`

> 所有需要登入的 API 均透過 **httpOnly cookie** 驗證，前端不需手動帶 token header，但 fetch / axios 需設定 `credentials: 'include'`。

---

## 認證 Auth

### POST `/api/auth/signup` — 註冊

**Request Body**

| 欄位           | 類型   | 必填 | 說明            |
| -------------- | ------ | ---- | --------------- |
| `email`        | string | ✅   | 有效 email 格式 |
| `password`     | string | ✅   | 至少 8 個字元   |
| `display_name` | string | ✅   | 顯示名稱        |

```json
{
  "email": "user@example.com",
  "password": "password123",
  "display_name": "小明"
}
```

**Response**

| 狀態碼 | 說明                                 |
| ------ | ------------------------------------ |
| `201`  | 註冊成功，設置 `token` cookie        |
| `400`  | 缺少欄位 / email 格式錯誤 / 密碼太短 |
| `409`  | email 已被註冊                       |

```json
// 201
{
  "user": {
    "id": "uuid",
    "display_name": "小明",
    "created_at": "2026-06-22T00:00:00.000Z"
  }
}
```

```json
// 400
{ "message": "email 格式不正確" }

// 409
{ "message": "email 已被註冊" }
```

---

### POST `/api/auth/login` — 登入

**Request Body**

| 欄位       | 類型   | 必填 |
| ---------- | ------ | ---- |
| `email`    | string | ✅   |
| `password` | string | ✅   |

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response**

| 狀態碼 | 說明                          |
| ------ | ----------------------------- |
| `200`  | 登入成功，設置 `token` cookie |
| `400`  | 缺少欄位                      |
| `401`  | 帳號不存在 / 密碼錯誤         |

```json
// 200
{
  "user": {
    "id": "uuid",
    "display_name": "小明"
  }
}
```

```json
// 401
{ "message": "帳號或密碼錯誤" }
```

---

### POST `/api/auth/logout` — 登出

無需 Request Body，無需登入狀態。

**Response**

| 狀態碼 | 說明                          |
| ------ | ----------------------------- |
| `200`  | 登出成功，清除 `token` cookie |

```json
{ "message": "已登出" }
```

---

### GET `/api/auth/me` — 取得當前用戶 🔒

> 需要登入（cookie 中有效的 `token`）

**Response**

| 狀態碼 | 說明                        |
| ------ | --------------------------- |
| `200`  | 回傳登入用戶資料            |
| `401`  | 未登入 / token 無效或已過期 |

```json
// 200
{
  "user": {
    "id": "uuid",
    "display_name": "小明",
    "avatar_url": null,
    "created_at": "2026-06-22T00:00:00.000Z"
  }
}
```

```json
// 401
{ "message": "未登入" }
```

---

## 前端使用範例

```js
// 登入
const res = await fetch("http://localhost:3000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include", // ← 必須加，才能帶 / 存 cookie
  body: JSON.stringify({ email, password }),
});

// 取得當前用戶（cookie 自動帶上）
const me = await fetch("http://localhost:3000/api/auth/me", {
  credentials: "include",
});
```

---

## 錯誤格式

所有錯誤回應統一格式：

```json
{ "message": "錯誤說明" }
```

## Friend

### GET `/api/users/search` — 搜尋使用者 🔒

> 需要登入（cookie 中有效的 `token`）

**Request Query**

| 欄位 | 類型   | 必填 | 說明                                              |
| ---- | ------ | ---- | ------------------------------------------------- |
| `q`  | string | ✅   | 必須為精準 5 碼的 16 進位字串 (使用者 ID 後 5 碼) |

**Response**

| 狀態碼 | 說明                                   |
| ------ | -------------------------------------- |
| `200`  | 回傳符合的使用者陣列                   |
| `400`  | 無效的搜尋格式 (非 5 碼或包含非法字元) |
| `401`  | 未登入                                 |

```json
// 200
[
  {
    "id": "uuid",
    "display_name": "朋友1號",
    "avatar_url": "https://..."
  }
]
```

```json

// 400
{ "message": "無效的搜尋格式" }

// 401
{ "message": "未登入" }
```

### PATCH `/api/users/me/avatar` — 更換目前使用者頭像 🔒

> 需要登入（cookie 中有效的 `token`）。前端需用 `multipart/form-data` 上傳圖片檔，欄位名稱固定為 `avatar`。後端會將圖片上傳到 Cloudinary，並把新的 `avatar_url` 寫回使用者資料；若使用者原本已有 Cloudinary 頭像，更新成功後會嘗試刪除舊圖。

**Request FormData**

| 欄位     | 類型 | 必填 | 說明                            |
| -------- | ---- | ---- | ------------------------------- |
| `avatar` | file | ✅   | JPG、PNG 或 WebP 圖片，最大 2MB |

```js
const formData = new FormData();
formData.append("avatar", file);

const res = await fetch("http://localhost:3000/api/users/me/avatar", {
  method: "PATCH",
  credentials: "include",
  body: formData,
});
```

**Response**

| 狀態碼 | 說明                        |
| ------ | --------------------------- |
| `200`  | 頭像更新成功                |
| `400`  | 未附檔案 / 檔案格式不支援   |
| `401`  | 未登入 / token 無效或已過期 |
| `413`  | 圖片超過 2MB                |
| `404`  | 用戶不存在                  |

```json
// 200
{
  "user": {
    "id": "uuid",
    "display_name": "小明",
    "avatar_url": "https://res.cloudinary.com/demo/image/upload/v1780000000/bujo/avatars/avatar-public-id.png"
  }
}
```

```json
// 400
{ "message": "請上傳頭像圖片" }

// 400
{ "message": "頭像只支援 JPG、PNG 或 WebP 圖片" }

// 413
{ "message": "頭像圖片不可超過 2MB" }
```

### POST `/api/friends/request` — 發送好友請求 🔒

> 需要登入（cookie 中有效的 `token`）

**Request Body**

| 欄位        | 類型   | 必填 | 說明           |
| ----------- | ------ | ---- | -------------- |
| `target_id` | string | ✅   | 對方的 User ID |

**Response**

| 狀態碼 | 說明                        |
| ------ | --------------------------- |
| `201`  | 請求發送成功                |
| `400`  | 缺少欄位 / 不能加自己為好友 |
| `401`  | 未登入 / token 無效或已過期 |
| `404`  | 找不到目標使用者            |
| `409`  | 已經是好友或已發送過請求    |

```json
// 201 成功
{ "message": "好友請求已發送" }

// 400
{ "message": "不能加自己為好友" }

// 400
{ "message": "缺少目標使用者 ID" }

// 401
{ "message": "未登入" }

// 404
{ "message": "找不到目標使用者" }

// 409 衝突
{ "message": "已經是好友或已發送過請求" }
```

### POST `/api/friendships/request` — 發送好友邀請並通知對方 🔒

> 需要登入（cookie 中有效的 `token`）。A 邀請 B 時，會建立 `pending` friendship，並建立給 B 的 `friend_request_created` 站內通知。若 B 有 LINE Login identity、LINE 通知偏好未關閉，且 `LINE_PUSH_ENABLED=true`，後端會用 LINE Official Account 的 Messaging API 嘗試推播同一則通知。

**Request Body**

| 欄位          | 類型   | 必填 | 說明           |
| ------------- | ------ | ---- | -------------- |
| `receiver_id` | string | ✅   | 對方的 User ID |

**Response**

| 狀態碼 | 說明                        |
| ------ | --------------------------- |
| `201`  | 好友邀請已送出              |
| `400`  | 缺少欄位 / 不能加自己為好友 |
| `401`  | 未登入 / token 無效或已過期 |
| `404`  | 找不到使用者                |
| `409`  | 已經是好友 / 已有 pending   |

```json
// 201
{
  "message": "好友邀請已送出",
  "friendship": {
    "id": "uuid",
    "requester_id": "user-a",
    "receiver_id": "user-b",
    "status": "pending"
  }
}
```

### POST `/api/friendships/:id/accept` — 接受好友邀請並通知邀請者 🔒

> 需要登入（cookie 中有效的 `token`）。只有被邀請者可以接受。B 接受 A 的邀請後，friendship 狀態會改成 `accepted`，並建立給 A 的 `friend_request_accepted` 站內通知。若 A 有 LINE Login identity、LINE 通知偏好未關閉，且 `LINE_PUSH_ENABLED=true`，後端會用 LINE Official Account 的 Messaging API 嘗試推播同一則通知。

**Response**

| 狀態碼 | 說明                         |
| ------ | ---------------------------- |
| `200`  | 已接受好友邀請               |
| `400`  | 此好友邀請無法接受           |
| `401`  | 未登入 / token 無效或已過期  |
| `403`  | 不是被邀請者，不能接受此邀請 |
| `404`  | 找不到好友邀請               |

```json
// 200
{
  "message": "已接受好友邀請",
  "friendship": {
    "id": "uuid",
    "requester_id": "user-a",
    "receiver_id": "user-b",
    "status": "accepted"
  }
}
```

### POST `/api/friendships/:id/reject` — 拒絕好友邀請 🔒

> 需要登入（cookie 中有效的 `token`）。只有被邀請者可以拒絕。拒絕後 friendship 狀態會改成 `rejected`，不會建立通知。

**Response**

| 狀態碼 | 說明                         |
| ------ | ---------------------------- |
| `200`  | 已拒絕好友邀請               |
| `400`  | 此好友邀請無法拒絕           |
| `401`  | 未登入 / token 無效或已過期  |
| `403`  | 不是被邀請者，不能拒絕此邀請 |
| `404`  | 找不到好友邀請               |

```json
// 200
{
  "message": "已拒絕好友邀請",
  "friendship": {
    "id": "uuid",
    "requester_id": "user-a",
    "receiver_id": "user-b",
    "status": "rejected"
  }
}
```

### GET `/api/friends` — 取得好友列表 🔒

> 需要登入（cookie 中有效的 `token`）

**Response**

| 狀態碼 | 說明                   |
| ------ | ---------------------- |
| `200`  | 成功，回傳好友資料陣列 |
| `401`  | 未登入 / token 無效    |

```json
// 200 成功
[
  {
    "id": "uuid",
    "display_name": "朋友的暱稱",
    "avatar_url": "https://..."
  }
]
```

```json
// 401
{ "message": "未登入" }
```

## Notifications

### GET `/api/notifications` — 取得通知列表 🔒

> 需要登入（cookie 中有效的 `token`）。後端會組好通知文字、分類與可操作 action，前端可直接渲染。

**Response**

| 狀態碼 | 說明                          |
| ------ | ----------------------------- |
| `200`  | 成功，回傳目前登入者通知列表  |
| `401`  | 未登入 / token 無效或已過期   |

```json
// 200
{
  "notifications": [
    {
      "id": "notification-id",
      "type": "friend_request_created",
      "category": "friend",
      "message": "A 向你發送好友邀請",
      "timeText": "10 分鐘前",
      "isRead": false,
      "createdAt": "2026-07-02T00:00:00.000Z",
      "reference": {
        "type": "friendship",
        "id": "friendship-id",
        "status": "pending"
      },
      "actions": ["accept", "reject"]
    }
  ]
}
```

**通知類型**

| type                      | category   | message 格式                              | actions              |
| ------------------------- | ---------- | ----------------------------------------- | -------------------- |
| `friend_request_created`  | `friend`   | `{requesterName} 向你發送好友邀請`        | pending 時可接受/拒絕 |
| `friend_request_accepted` | `friend`   | `{receiverName} 接受了你的好友邀請`       | 無                   |
| `activity_created`        | `activity` | `{creatorName} 建立了新活動：{activity}`  | 無                   |

**LINE 推播**

- 目前 LINE 推播沒有新增 API；它是建立站內通知後的 best-effort side effect。
- LINE Login identity 是 v1 binding source：後端用 `user_identities.provider = "line"` 的 `provider_user_id` 當 Messaging API `to`。
- Messaging API channel access token 只用於 LINE Official Account 推播，設定在 `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`。
- LINE Login channel 與 Messaging API channel 必須在 same provider，否則 LINE Login 拿到的 user id 不一定能用於官方帳號推播。
- 本地與測試預設 `LINE_PUSH_ENABLED=false`；只有正式整合測試或部署時才改成 true。
- 後端不會自動建立 LINE Official Account、provider、Messaging API channel 或 token；請依 `docs/line-official-account-setup.md` 手動設定，也要讓使用者透過 QR code、add friend 連結或 `bot_prompt` 加入官方帳號。
- `src/services/lineService.js` 只處理 LINE Login/OAuth；官方帳號推播由 `src/services/lineMessagingService.js` 呼叫 Messaging API。

### PATCH `/api/notifications/:id/read` — 標記單筆通知已讀 🔒

> 需要登入（cookie 中有效的 `token`）。只能標記自己的通知。

**Response**

| 狀態碼 | 說明                        |
| ------ | --------------------------- |
| `200`  | 已標記為已讀                |
| `401`  | 未登入 / token 無效或已過期 |
| `404`  | 找不到通知                  |

```json
// 200
{ "message": "已標記為已讀" }

// 404
{ "message": "找不到通知" }
```

### PATCH `/api/notifications/read-all` — 全部通知已讀 🔒

> 需要登入（cookie 中有效的 `token`）。只會更新目前登入者的未讀通知。

**Response**

| 狀態碼 | 說明                        |
| ------ | --------------------------- |
| `200`  | 已全部標記為已讀            |
| `401`  | 未登入 / token 無效或已過期 |

```json
// 200
{
  "message": "已全部標記為已讀",
  "count": 3
}
```

## Activity — 情境二（日期固定・時間讓大家選）range 模式

> 情境一（全固定）、情境三（候選日期・時間固定）、情境四（候選日期・各自時段）維持既有的候選時段勾選投票制不變，不在此列出。情境二改為「參與者自由回報可用時間範圍，系統計算重疊排序」，`ActivitySchedule.availability_mode` 為 `'range'` 時即為情境二。
>
> `deadline_at`（報名截止時間）錨點沿用現行機制（創建者自選提前 N 天/小時），情境二計算錨點的來源從「候選時段裡最早的開始時間」改為「`fixed_date` + `time_window_start`（沒設就是當天最早）」——這是前端錨點計算的調整（`BuJo` repo 同名 change 負責），後端本次不需改動。

### POST `/api/activities` — 建立情境二活動 🔒

**Request Body（情境二專屬欄位）**

| 欄位              | 類型   | 必填 | 說明                                              |
| ----------------- | ------ | ---- | ------------------------------------------------- |
| `singleDate`      | string | ✅   | 活動固定日期                                       |
| `timeWindowStart` | string | 選填 | 允許回報的時間範圍起點；不設 = 當天全天皆可         |
| `timeWindowEnd`   | string | 選填 | 允許回報的時間範圍終點；不設 = 當天全天皆可         |

> 不再需要 `slots`（候選時段列表）與 `creatorSlotIndexes`（建立者候選時段索引）——建立活動時不會產生任何 `ActivityCandidateSlot`，建立者在重疊排序中永遠視為有空。

**Response**：同其他情境，`201` 回傳 `{ "activity": { "id": "uuid" } }`。

### POST `/api/activities/:id/join` — 報名並回報可用時間 🔒

> **BREAKING**：情境二的 body 從 `{candidateSlotIds}` 改為 `{ranges: [{start, end}]}`。已報名者可在 `recruiting`／`voting` 狀態重新呼叫此 API 送出新的 `ranges`，後端會先刪除該使用者舊的回報再寫入新的。

**Request Body（情境二）**

| 欄位     | 類型                          | 必填 | 說明                     |
| -------- | ----------------------------- | ---- | ------------------------ |
| `ranges` | `{start, end}[]`（ISO 字串）  | ✅   | 一段或多段可用時間，不可為空 |

**Response**

| 狀態碼 | 說明                                                         |
| ------ | ------------------------------------------------------------ |
| `200`  | 報名 / 重新回報成功                                           |
| `400`  | `ranges` 為空 / 超出 `time_window_start`／`time_window_end` / 活動已截止報名（`deadline_at` 已過，四情境皆適用） |

### GET `/api/activities/:id` — 取得活動詳情 🔒

情境二的 `decision_candidates` 格式與情境一/三/四（扁平陣列）不同，前端需依 `activity.availability_mode` 判斷：

```json
// availability_mode: "range"
{
  "activity": {
    "availability_mode": "range",
    "decision_candidates": {
      "perfect_overlap": [
        { "id": "temp-2026-08-01T10:00:00.000Z", "slot_start": "...", "slot_end": "...", "count": 3 }
      ],
      "partial_overlap": [
        { "id": "temp-2026-08-01T09:00:00.000Z", "slot_start": "...", "slot_end": "...", "count": 2 }
      ]
    }
  }
}
```

- `perfect_overlap`：重疊人數＝總報名人數的所有格子
- `partial_overlap`：其餘格子中人數最多的前 3 筆
- `id` 為 `temp-` 前綴加上該格 `slot_start` 的 ISO 字串，非真實的 `ActivityCandidateSlot.id`（這些候選格是即時計算、不存資料庫）

### POST `/api/activities/:id/confirm-formation` — 建立者確認成團 🔒

> 情境二改用 `{ slotStart, slotEnd }`（而非 `candidateSlotId`）指定要確認的格子，須與目前 `decision_candidates` 中的某一筆完全相符。後端會在確認的當下才臨時建立一筆 `ActivityCandidateSlot` 並寫入 `confirmed_slot_id`。

**Request Body（情境二）**

| 欄位        | 類型               | 必填 | 說明                                  |
| ----------- | ------------------ | ---- | ------------------------------------- |
| `slotStart` | string（ISO 字串） | ✅   | 須與 `decision_candidates` 中某筆一致 |
| `slotEnd`   | string（ISO 字串） | ✅   | 須與 `decision_candidates` 中某筆一致 |

**Response**

| 狀態碼 | 說明                                             |
| ------ | ------------------------------------------------ |
| `200`  | 成團成功                                         |
| `400`  | 此活動狀態不允許確認成團 / 時段不在候選名單中     |
