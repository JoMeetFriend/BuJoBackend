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

### 情境四（候選日期・各自時段）— 參與者自選子區間

> 情境四的候選時段是建立者為每個候選日開的獨立時段，**每個候選日期只能對應一組時段**（`POST /api/activities` 建立時若 `dateSlots` 出現重複日期會回 `400`，訊息「每個候選日期只能設定一組時段」）。參與者報名時除了勾選 `candidateSlotIds`，還可以附上在該時段窗口內自選的子區間 `candidateSlotRanges`。子區間不影響「哪個候選時段勝出」的 `is_selected`／票數二元計票邏輯，但**會**餵給該候選時段的交集運算（見下方 `GET /api/activities/:id` 的 `decision_candidates`），用來算出這個候選時段內大家實際上重疊的窄窗口。

**POST `/api/activities/:id/join` — Request Body（情境四新增欄位）**

| 欄位                 | 類型                                             | 必填 | 說明                                                                     |
| -------------------- | ------------------------------------------------ | ---- | ------------------------------------------------------------------------ |
| `candidateSlotRanges` | `{candidateSlotId, rangeStart, rangeEnd}[]`（`rangeStart`/`rangeEnd` 為 ISO 字串） | 選填 | 每筆對應 `candidateSlotIds` 中的一個時段，記錄參與者在該時段窗口內自選的子區間 |

- 每筆 `rangeStart`/`rangeEnd` 必須落在對應 `candidateSlotId` 的 `slot_start`～`slot_end` 之間，否則整個請求回 `400`、不寫入任何資料
- `candidateSlotIds` 中沒有對應 `candidateSlotRanges` 條目的時段，仍正常計票，只是不記錄子區間
- 已報名參與者在 `recruiting` 階段重新呼叫此 API（比照情境三的重送邏輯）一樣適用，會先刪除舊的 `ActivityAvailability` 再寫入新的

**GET `/api/activities/:id` — Response（`candidate_slots[]` 新增欄位）**

| 欄位        | 類型                            | 說明                                                             |
| ----------- | ------------------------------- | ------------------------------------------------------------------ |
| `my_range`  | `{start, end}`（ISO 字串）或 `null` | 目前使用者自己存的子區間；沒投該時段或投了但沒存子區間時為 `null` |

### POST `/api/activities` — 建立情境二活動 🔒

**Request Body（情境二專屬欄位）**

| 欄位              | 類型   | 必填 | 說明                                              |
| ----------------- | ------ | ---- | ------------------------------------------------- |
| `singleDate`      | string | ✅   | 活動固定日期                                       |
| `timeWindowStart` | string | 選填 | 允許回報的時間範圍起點；不設 = 當天全天皆可         |
| `timeWindowEnd`   | string | 選填 | 允許回報的時間範圍終點；不設 = 當天全天皆可         |

> 不需要 `slots`（候選時段列表）——建立活動時不會產生任何 `ActivityCandidateSlot`。`creatorSlotIndexes` 欄位已整個移除（情境三／四也一樣），建立者不會在任何情境的重疊排序/票數計算中被算進去——建立者對自己建立的候選時段有空是結構性保證的事實，不需要額外資料佐證，也不該算進「這個時段有多少人支持」的計票裡。

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

`decision_candidates` 依 `activity.schedule_variant` 分四種格式，前端需依此判斷，不能只看 `availability_mode`：

```json
// availability_mode: "range"（情境二）
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

// schedule_variant: "find_date"（情境三）—扁平陣列，包含每一個候選日期，依票數由高到低排序
{
  "activity": {
    "schedule_variant": "find_date",
    "decision_candidates": [
      { "id": "slot-a", "slot_start": "...", "slot_end": "...", "count": 3, "is_unanimous": false },
      { "id": "slot-b", "slot_start": "...", "slot_end": "...", "count": 1, "is_unanimous": false }
    ]
  }
}

// schedule_variant: "find_date_time"（情境四）—扁平陣列，包含每一個候選時段，每筆各自附上該時段內的子區間交集運算結果，依總票數由高到低排序
{
  "activity": {
    "schedule_variant": "find_date_time",
    "decision_candidates": [
      {
        "id": "slot-a",
        "slot_start": "...",
        "slot_end": "...",
        "count": 3,
        "perfect_overlap": [{ "id": "temp-...", "slot_start": "...", "slot_end": "...", "count": 3 }],
        "partial_overlap": []
      }
    ]
  }
}
```

- **BREAKING**：情境三／四的 `decision_candidates` 不再只回傳並列最高票的候選時段，改成回傳**所有**候選時段，依支持度由高到低排序——前端要能顯示完整清單，不能假設只有一筆或只有並列最高票那幾筆
- 情境三每筆新增 `is_unanimous`（`count` 等於真人參與者人數且大於 0——分母**不含建立者**，建立者對自己建立的候選時段有空是結構性保證的事實，不算主動投票）
- 情境四每筆新增 `perfect_overlap`／`partial_overlap`：對這個候選時段自己的 `slot_start`～`slot_end` 範圍，把投給它的真人參與者子區間（沒填子區間視為整個候選時段都覆蓋）做跟情境二一樣的切格交集運算；`count` 是投給這個候選時段的真人參與者總人數（不是交集運算的重疊人數，也不含建立者）
- `perfect_overlap`／`partial_overlap` 裡的 `id` 一樣是 `temp-` 前綴、非真實 `ActivityCandidateSlot.id`

### POST `/api/activities/:id/confirm-formation` — 建立者確認成團 🔒

> 情境二改用 `{ slotStart, slotEnd }`（而非 `candidateSlotId`）指定要確認的格子，須與目前 `decision_candidates` 中的某一筆完全相符。後端會在確認的當下才臨時建立一筆 `ActivityCandidateSlot` 並寫入 `confirmed_slot_id`。

**Request Body（情境二）**

| 欄位        | 類型               | 必填 | 說明                                  |
| ----------- | ------------------ | ---- | ------------------------------------- |
| `slotStart` | string（ISO 字串） | ✅   | 須與 `decision_candidates` 中某筆一致 |
| `slotEnd`   | string（ISO 字串） | ✅   | 須與 `decision_candidates` 中某筆一致 |

**Request Body（情境三）**

| 欄位             | 類型   | 必填 | 說明                                                       |
| ---------------- | ------ | ---- | ------------------------------------------------------------ |
| `candidateSlotId` | string | ✅   | 任何屬於這個活動的候選時段皆可，**不再限制必須是並列最高票** |

**Request Body（情境四）**

| 欄位             | 類型               | 必填 | 說明                                                                 |
| ---------------- | ------------------ | ---- | ---------------------------------------------------------------------- |
| `candidateSlotId` | string             | ✅   | 要確認的候選時段（決定要用哪個候選時段的交集運算結果）                  |
| `slotStart`       | string（ISO 字串） | ✅   | 須與該候選時段 `decision_candidates[].perfect_overlap`／`partial_overlap` 中某一筆完全相符 |
| `slotEnd`         | string（ISO 字串） | ✅   | 同上                                                                   |

> **BREAKING**：情境四不再直接採用候選時段的原始邊界當最終時間，改成從交集運算結果裡選一個窄窗口，比照情境二在確認當下才臨時建立新的 `ActivityCandidateSlot`。

**Response**

| 狀態碼 | 說明                                             |
| ------ | ------------------------------------------------ |
| `200`  | 成團成功                                         |
| `400`  | 此活動狀態不允許確認成團 / 時段不在候選名單中     |

### 人數滿額不再自動成團

> **BREAKING**：`POST /api/activities/:id/join` 讓報名人數達到 `participant_target` 時，四個情境皆不再自動把活動狀態設為 `confirmed`。免投票（情境一）維持 `recruiting`；投票制（情境三／四）不論票數或交集是否一致，一律轉為 `voting`。兩種情況都會發送 `time_to_pick` 通知給建立者，最終成團一律要建立者手動呼叫 `POST /api/activities/:id/confirm-formation`。情境二本來就是如此，不受影響。
