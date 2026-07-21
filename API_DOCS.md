# BuJo Backend — API 文檔

> 互動式 Swagger 文件：伺服器啟動後開啟 `/api-docs`（本地為 `http://localhost:3000/api-docs`），
> 內容跟著程式碼的 JSDoc 註解自動產生，異動時較不易與實作脫節。本檔案保留完整的商業規則與情境說明。

Base URL：`http://localhost:3000`  
Production（main）：`https://api.bujo.live`  
測試版本（dev）：`https://bujobackend-bkef.onrender.com`

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

### GET `/api/auth/google` — 開始 Google 登入

後端建立 `user_id = null` 的一次性 OAuth attempt，導向 Google 授權頁。

### GET `/api/auth/google/link` — 綁定 Google 帳號 🔒

> 需要登入（cookie 中有效的 `token`）

後端以目前登入者 ID 建立一次性 OAuth attempt，導向 Google 授權頁。

### GET `/api/auth/google/callback` — Google OAuth callback

callback 會先驗證並消耗 `state`，再由 OAuth attempt 的 `user_id` 判斷 login 或 link；query string 不可自行指定 mode。缺失、不存在、過期或已消耗的 state 固定導向 `/login?error=google_login_failed`，且不交換 token、不建立 identity 或簽發 cookie。

| Mode  | 結果 | 前端 redirect | Cookie / identity 行為 |
| ----- | ---- | ------------- | ---------------------- |
| login | 成功 | `/` | 建立或取得使用者並簽發 `token` cookie |
| login | 取消 | `/login?error=google_cancelled` | 不簽發 cookie |
| login | 失敗 | `/login?error=google_login_failed` | 不簽發 cookie |
| link | 成功 | `/profile/edit?linked=google` | 綁定 attempt 指定的使用者，不簽發新 cookie |
| link | 取消 | `/profile/edit?error=google_link_cancelled` | 不建立 identity、不回登入頁 |
| link | 失敗或 Google identity 已屬其他帳號 | `/profile/edit?error=google_link_failed` | 不建立、移動或複製 identity，不回登入頁 |

> **BREAKING**：Google 登入/連結已改為跟 LINE 相同的後端 OAuth redirect 流程。舊的 `POST /api/auth/google`、`POST /api/auth/google/link`（前端直接帶 Google ID Token credential、後端回傳 JSON）已移除，不再回傳 `{ user }` 或任何 JSON 錯誤訊息——三個 endpoint 一律是 302 redirect，前端需比照 LINE 登入改成 `window.location.href` 導頁，並改從 redirect 後的 URL query（`?error=...`、`?linked=google`）判斷結果。

---

### GET `/api/auth/line` — 開始 LINE 登入

後端建立 `user_id = null` 的一次性 OAuth attempt，並以 `bot_prompt=normal` 導向 LINE 授權頁。

### GET `/api/auth/line/link` — 綁定 LINE 帳號 🔒

> 需要登入（cookie 中有效的 `token`）

後端以目前登入者 ID 建立一次性 OAuth attempt，並以 `bot_prompt=aggressive` 導向 LINE 授權頁。

### GET `/api/auth/line/callback` — LINE OAuth callback

callback 會先驗證並消耗 `state`，再由 OAuth attempt 的 `user_id` 判斷 login 或 link；query string 不可自行指定 mode。缺失、不存在、過期或已消耗的 state 固定導向 `/login?error=line_login_failed`，且不交換 token、不建立 identity 或簽發 cookie。

| Mode  | 結果 | 前端 redirect | Cookie / identity 行為 |
| ----- | ---- | ------------- | ---------------------- |
| login | 成功 | `/` | 建立或取得使用者並簽發 `token` cookie |
| login | 取消 | `/login?error=line_cancelled` | 不簽發 cookie |
| login | 失敗 | `/login?error=line_login_failed` | 不簽發 cookie |
| link | 成功 | `/profile/edit?linked=line` | 綁定 attempt 指定的使用者，不簽發新 cookie |
| link | 取消 | `/profile/edit?error=line_link_cancelled` | 不建立 identity、不回登入頁 |
| link | 失敗或 LINE identity 已屬其他帳號 | `/profile/edit?error=line_link_failed` | 不建立、移動或複製 identity，不回登入頁 |

這三個既有 endpoint 只處理 LINE Login/OAuth onboarding；本契約沒有新增 endpoint、資料表、migration、webhook、官方帳號好友狀態追蹤，也不修改 LINE 推播訊息、notification preference 或 delivery service。

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

### PATCH `/api/users/me/name` — 更換目前使用者名稱 🔒

> 需要登入（cookie 中有效的 `token`）。前端需傳送 JSON 格式的請求主體。後端會清除前後空白字元，並驗證長度與格式。

**Request Body**

| **欄位**       | **類型** | **必填** | **說明**                                       |
| -------------- | -------- | -------- | ---------------------------------------------- |
| `display_name` | string   | ✅       | 新的顯示名稱，不可為空白，且不可超過 50 個字元 |

```json
{
  "display_name": "超級小明"
}
```

**Response**

| **狀態碼** | **說明**                                       |
| ---------- | ---------------------------------------------- |
| `200`      | 名稱更新成功                                   |
| `400`      | 無效的名稱格式 / 名稱不可為空白 / 超過 50 字元 |
| `401`      | 未登入 / token 無效或已過期                    |
| `500`      | 伺服器內部錯誤                                 |

```json
// 200 成功
{
  "message": "名稱更新成功",
  "user": {
    "id": "uuid",
    "display_name": "超級小明",
    "avatar_url": "https://..."
  }
}

// 400 格式錯誤或空白
{ "message": "無效的名稱格式" }
// 或是
{ "message": "顯示名稱不可為空白" }

// 400 超過長度限制
{ "message": "顯示名稱不可超過 50 個字元" }

// 401 沒登入
{ "message": "未登入" }
```

### PATCH `/api/users/me/bio` — 更新目前使用者的簡介 🔒

> 需要登入（cookie 中有效的 `token`）。前端需傳送 JSON 格式的請求主體。後端會自動清除字串前後的空白，並驗證長度不可超過 150 個字元。允許傳入空字串或純空白字串來清空目前的簡介。

**Request Body**

| 欄位  | 類型   | 必填 | 說明                                      |
| ----- | ------ | ---- | ----------------------------------------- |
| `bio` | string | ✅   | 新的使用者簡介，長度限制為 150 個字元以內 |

```json
{
  "bio": "這是我熱愛寫程式的新簡介。"
}
```

**Response**

| **狀態碼** | **說明**                             |
| ---------- | ------------------------------------ |
| `200`      | 簡介更新成功                         |
| `400`      | 無效的簡介格式 / 簡介超過 150 個字元 |
| `401`      | 未登入 / token 無效或已過期          |
| `500`      | 伺服器內部錯誤                       |

```json
// 200 成功
{
  "message": "簡介更新成功",
  "user": {
    "id": "uuid",
    "display_name": "超級小明",
    "bio": "這是我熱愛寫程式的新簡介。"
  }
}

// 400 格式錯誤
{ "message": "無效的簡介格式" }

// 400 超過長度限制
{ "message": "簡介不可超過 150 個字元" }

// 401 沒登入
{ "message": "未登入" }

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

### DELETE `/api/friendships/:id` — 刪除好友 (軟刪除) 🔒

> 需要登入（cookie 中有效的 `token`）。
> **注意：** 網址上的 `:id` 必須是 **`friendship` 的 ID**，而不是對方的 `user ID`。
> 只有該好友關係的雙方當事人可以執行刪除，且該關係的狀態必須為 `accepted`。刪除後狀態將變更為 `deleted`。

**Response**

| 狀態碼 | 說明                              |
| ------ | --------------------------------- |
| `200`  | 已刪除好友                        |
| `400`  | 此狀態無法刪除好友 (非 accepted)  |
| `401`  | 未登入 / token 無效或已過期       |
| `403`  | 無權操作此好友關係 (非雙方當事人) |
| `404`  | 找不到該好友關係                  |

```json
// 200 成功
{
  "message": "已刪除好友",
  "friendship": {
    "id": "uuid",
    "status": "deleted"
  }
}

// 400 狀態不對
{ "message": "此狀態無法刪除好友" }

// 401 沒登入
{ "message": "未登入" }

// 403 越權操作 (IDOR 防禦)
{ "message": "無權操作此好友關係" }

// 404 找不到
{ "message": "找不到該好友關係" }
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

> 需要登入（cookie 中有效的 `token`）。後端會組好通知文字、分類、actor 與可操作 action，前端可直接渲染。列表會排除 `dismissed_at` 已有值的通知；一般已讀但尚未 dismissal 的通知仍會回傳，既有欄位與排序行為不變。

**Response**

| 狀態碼 | 說明                         |
| ------ | ---------------------------- |
| `200`  | 成功，回傳目前登入者通知列表 |
| `401`  | 未登入 / token 無效或已過期  |

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
      "actor": {
        "id": "user-a",
        "displayName": "A",
        "avatarUrl": "https://example.com/a.png"
      },
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

| type                      | category   | message 格式                                         | actor                | actions              |
| ------------------------- | ---------- | ---------------------------------------------------- | -------------------- | -------------------- |
| `friend_request_created`  | `friend`   | `{requesterName} 向你發送好友邀請`                   | friendship requester | pending 時可接受/拒絕 |
| `friend_request_accepted` | `friend`   | `{receiverName} 接受了你的好友邀請`                  | friendship receiver  | 無                   |
| `activity_created`        | `activity` | `{creatorName} 建立了新活動：{activity}`             | activity creator     | 無                   |
| `formation_ready`         | `activity` | `「{activity}」人數已滿，請確認成團`                 | `null`               | 無                   |
| `time_to_pick`            | `activity` | `「{activity}」候選時段票數不相上下，請選擇最終時段` | `null`               | 無                   |
| `activity_confirmed`      | `activity` | `「{activity}」已確認成團`                           | `null`               | 無                   |
| `activity_cancelled`      | `activity` | `「{activity}」已取消`                               | `null`               | 無                   |

**actor 規則**

- 每筆通知固定包含 `actor` 欄位；非 `null` 時只包含 camelCase 的 `id`、`displayName`、`avatarUrl`。
- `friend_request_created` 的 actor 是 friendship requester；`friend_request_accepted` 的 actor 是 friendship receiver。
- `activity_created` 的 actor 是 referenced activity creator。
- requester、receiver 或 activity creator 沒有頭像時仍保留 actor，並回傳 `avatarUrl: null`。
- friendship reference 遺失或查不到 friendship 時回傳 `actor: null`；通知本身仍會使用既有 fallback message、reference 與 actions 規則回傳。
- `activity_created` 的 activity reference 遺失、查不到 activity 或 creator 遺失時回傳 `actor: null`，並保留既有活動 fallback message 與 reference。
- 其他 activity lifecycle notification（`formation_ready`、`time_to_pick`、`activity_confirmed`、`activity_cancelled`）與一般 notification 固定回傳 `actor: null`。

- `formation_ready`：報名人數達到 `participant_target` 時通知建立者（收件人：建立者）。
- `time_to_pick`：報名截止、活動進入決策緩衝期時通知建立者（收件人：建立者）。
- `activity_confirmed`：建立者確認成團時通知其他參與者（收件人：建立者以外的參與者）。
- `activity_cancelled`：活動取消時通知參與者——建立者手動取消（收件人：建立者以外的參與者）、截止未達標或決策期逾期自動取消（收件人：全體參與者）。

**LINE 推播**

- 目前 LINE 推播沒有新增 API；它是建立站內通知後的 best-effort side effect。
- 好友邀請兩種通知、`activity_created`，以及四種活動生命週期通知（`formation_ready`、`time_to_pick`、`activity_confirmed`、`activity_cancelled`）都會在站內通知建立後嘗試 LINE 推播，文案與站內通知相同；未綁定 LINE 或該型別偏好關閉的使用者只收站內通知。
- LINE Login identity 是 v1 binding source：後端用 `user_identities.provider = "line"` 的 `provider_user_id` 當 Messaging API `to`。
- Messaging API channel access token 只用於 LINE Official Account 推播，設定在 `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`。
- LINE Login channel 與 Messaging API channel 必須在 same provider，否則 LINE Login 拿到的 user id 不一定能用於官方帳號推播。
- 本地與測試預設 `LINE_PUSH_ENABLED=false`；只有正式整合測試或部署時才改成 true。
- 後端不會自動建立 LINE Official Account、provider、Messaging API channel 或 token；請依 `docs/line-official-account-setup.md` 手動設定，也要讓使用者透過 QR code、add friend 連結或 `bot_prompt` 加入官方帳號。
- `src/services/lineService.js` 只處理 LINE Login/OAuth；官方帳號推播由 `src/services/lineMessagingService.js` 呼叫 Messaging API。

### GET `/api/notifications/unread-count` — 取得未讀通知數 🔒

> 需要登入（cookie 中有效的 `token`）。回傳目前登入者的未讀通知數，供通知按鈕/頁面顯示 badge，不需要拉取整個通知列表。

**Response**

| 狀態碼 | 說明                          |
| ------ | ----------------------------- |
| `200`  | 成功，回傳目前登入者未讀通知數  |
| `401`  | 未登入 / token 無效或已過期   |

```json
// 200
{ "unreadCount": 3 }
```

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

### PATCH `/api/notifications/:id/dismiss` — 永久隱藏通知 🔒

> 需要登入（cookie 中有效的 `token`）。只能操作自己的尚未隱藏通知。成功時會在同一次更新將通知設為已讀並寫入 `dismissed_at`；資料列仍保留於資料庫供稽核，但不再出現在正常通知列表，也不提供復原入口。
>
> `friend_request_created` 對應的 friendship 仍為 `pending` 時不可 dismissal；必須先接受或拒絕，待 friendship 狀態改為 `accepted` 或 `rejected` 後才能移除通知。

**Response**

| 狀態碼 | 說明                                  |
| ------ | ------------------------------------- |
| `200`  | 已將通知標記已讀並永久隱藏            |
| `401`  | 未登入 / token 無效或已過期           |
| `404`  | 通知不存在、不屬於使用者或已經 dismissal |
| `409`  | 待處理的好友邀請尚不可移除            |
| `500`  | 伺服器或資料庫錯誤                    |

```json
// 200
{ "message": "已移除通知" }

// 404
{ "message": "找不到通知" }

// 409
{ "message": "待處理的好友邀請無法移除" }

// 500
{ "message": "伺服器錯誤" }
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

### `POST /api/activities` 的 `deadline` 欄位語意（四情境統一，`deadline-model-redesign`）

> **BREAKING**：`deadline` 欄位不再是決策硬截止天花板，改成代表「建立者選擇的報名截止時間」，寫入 `ActivitySchedule.vote_deadline_at`。決策硬截止天花板 `deadline_at` 完全由伺服器依情境公式計算，不接受客戶端輸入，且保證不晚於活動實際發生時間：
>
> | 情境 | `deadline_at`（伺服器計算，天花板） |
> | --- | --- |
> | A 固定時段 | 活動本身的開始時間（`slot_start`） |
> | B range 模式 | `time_window_start`；未提供時間窗則為 `fixed_date` |
> | C find_date | 所有候選時段中最晚一筆的 `slot_start` |
> | D find_date_time | 所有候選時段中最晚一筆的 `slot_start` |
>
> `POST /api/activities` 會依序驗證：① 伺服器算出的 `deadline_at` 必須晚於現在，否則 `400`；② 送出的 `deadline`（即將寫入 `vote_deadline_at`）必須早於算出的 `deadline_at`，否則 `400`。兩項皆通過才會建立活動。四個情境的 `GET /api/activities/:id` 回應都會有非 null 的 `vote_deadline_at`（情境一過去完全沒有這個欄位，這次補上）。
>
> `POST /:id/join` 的報名截止檢查改讀 `vote_deadline_at`，不再是 `deadline_at`。`confirmFormation` 新增「所選候選時段的開始時間不能已經過去」的檢查，四情境皆適用，錯誤訊息為「此時段已經過去，請重新選擇」。任何情境到期都不再自動 `confirmed`——一律先轉入 `voting`（決策緩衝狀態）並通知建立者，`voting` 狀態逾期（`deadline_at` 已到）且建立者尚未手動確認時，系統才會自動轉為 `cancelled`，並通知建立者與所有已報名參與者。

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
| `co_participants` | `{user_id, display_name, avatar_url}[]` | 非建立者才有意義：跟自己在這個候選時段有時間重疊的其他真人參與者，詳見下方 `GET /api/activities/:id` 的 `co_participants` 說明 |

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
| `400`  | `ranges` 為空 / 超出 `time_window_start`／`time_window_end` / 活動已截止報名（`vote_deadline_at` 已過，四情境皆適用） |

### GET `/api/activities/:id` — 取得活動詳情 🔒

> **BREAKING**：`decision_candidates` 只有建立者（`is_creator: true`）的回應才會附上完整資料；非建立者（已報名的參與者）的回應一律是 `null`。參與者要知道「跟自己同時段的人」，改看 `my_ranges[]`（情境二）／`candidate_slots[]`（情境三／四）裡新增的 `co_participants` 欄位——只列出跟自己已回報/已選的時段有時間重疊的其他真人參與者，不含建立者、不含自己，範圍窄很多，不是完整的投票排名。

`decision_candidates` 依 `activity.schedule_variant` 分三種格式，前端需依此判斷，不能只看 `availability_mode`。情境二／三是單一排序陣列；情境四是「候選時段」外層陣列，每筆再帶一個內層 `segments` 陣列。三種格式裡的 segment 都統一帶 `is_unanimous`／`supporters`，不再有「完全重疊」「部分重疊」的分類鍵名，後端也不再自行限制回傳筆數（以下範例皆為建立者視角的回應）：

```json
// availability_mode: "range"（情境二）—單一排序陣列，依 count 由高到低排序；相鄰、count 相同、
// 支持者集合完全相同的切格區段已經合併成一筆
{
  "activity": {
    "availability_mode": "range",
    "decision_candidates": [
      {
        "id": "temp-2026-08-01T09:00:00.000Z",
        "slot_start": "...",
        "slot_end": "...",
        "count": 3,
        "is_unanimous": true,
        "supporters": [{ "user_id": "u1", "display_name": "Alice", "avatar_url": null }]
      }
    ]
  }
}

// schedule_variant: "find_date"（情境三）—扁平陣列，包含每一個候選日期，依票數由高到低排序
{
  "activity": {
    "schedule_variant": "find_date",
    "decision_candidates": [
      {
        "id": "slot-a",
        "slot_start": "...",
        "slot_end": "...",
        "count": 3,
        "is_unanimous": false,
        "supporters": [{ "user_id": "u1", "display_name": "Alice", "avatar_url": null }]
      },
      { "id": "slot-b", "slot_start": "...", "slot_end": "...", "count": 1, "is_unanimous": false, "supporters": [] }
    ]
  }
}

// schedule_variant: "find_date_time"（情境四）—外層是候選時段陣列，依候選時段自己的總票數 count 由高到低排序；
// 內層 segments 是該候選時段窗口內子區間交集運算的合併結果，同樣依 count 由高到低排序
{
  "activity": {
    "schedule_variant": "find_date_time",
    "decision_candidates": [
      {
        "id": "slot-a",
        "slot_start": "...",
        "slot_end": "...",
        "count": 3,
        "segments": [
          {
            "id": "temp-...",
            "slot_start": "...",
            "slot_end": "...",
            "count": 3,
            "is_unanimous": true,
            "supporters": [{ "user_id": "u1", "display_name": "Alice", "avatar_url": null }]
          }
        ]
      }
    ]
  }
}
```

- **BREAKING**：情境三／四的 `decision_candidates` 不再只回傳並列最高票的候選時段，改成回傳**所有**候選時段，依支持度由高到低排序——前端要能顯示完整清單，不能假設只有一筆或只有並列最高票那幾筆
- **BREAKING**：情境二不再回傳 `{perfect_overlap, partial_overlap}` 雙陣列，改成單一排序陣列；情境四內層也不再是 `perfect_overlap`／`partial_overlap`，改成單一 `segments` 陣列。三種情境的 segment 都新增 `supporters`（投給該筆的參與者 `user_id`／`display_name`／`avatar_url`）
- 情境二／四相鄰、`count` 相同、且 `supporters` 對應的參與者集合完全相同的切格區段會合併成一筆，`slot_start`／`slot_end` 分別取最早／最晚——避免一個人連續一大段可用時間被拆成好幾筆幾乎相同的列
- `is_unanimous`：情境二的分母是真人送出者依 `user_id` 去重數；情境三／四的分母是真人參與者人數，兩者皆**不含建立者**（建立者對自己建立的候選時段/活動有空是結構性保證的事實，不算主動投票）
- 情境四每個候選時段的 `count` 是投給這個候選時段的真人參與者總人數（不是內層 `segments` 交集運算的重疊人數，也不含建立者）；`segments` 是對這個候選時段自己的 `slot_start`～`slot_end` 範圍，把投給它的真人參與者子區間（沒填子區間視為整個候選時段都覆蓋）做跟情境二一樣的切格交集運算
- `decision_candidates`（情境二／情境四 `segments`）裡的 `id` 是 `temp-` 前綴、非真實 `ActivityCandidateSlot.id`；情境三／情境四外層的 `id` 是真實 `ActivityCandidateSlot.id`

**非建立者的 `co_participants`（`my_ranges[]`／`candidate_slots[]` 新增欄位）**

```json
// 情境二（range 模式）——my_ranges[] 每筆新增 co_participants
{
  "activity": {
    "my_ranges": [
      {
        "start": "2026-08-01T18:00:00.000Z",
        "end": "2026-08-01T20:00:00.000Z",
        "co_participants": [{ "user_id": "u2", "display_name": "Bob", "avatar_url": null }]
      }
    ]
  }
}

// 情境三／四——candidate_slots[] 每筆新增 co_participants
{
  "activity": {
    "candidate_slots": [
      {
        "id": "slot-a",
        "is_selected": true,
        "co_participants": [{ "user_id": "u2", "display_name": "Bob", "avatar_url": null }]
      },
      { "id": "slot-b", "is_selected": false, "co_participants": [] }
    ]
  }
}
```

- `co_participants` 只有非建立者的回應才有意義；建立者的回應裡這個欄位固定是空陣列（建立者直接看完整的 `decision_candidates`，不需要這個欄位）
- 情境二：跟這筆 `my_ranges` 條目自己的 `start`～`end` 有時間實際重疊的其他真人參與者（不含建立者、不含自己）
- 情境三：候選時段本身沒有子區間，顆粒度是「選了同一天」——同一個候選時段的其他真人參與者
- 情境四：跟自己在這個候選時段的子區間（`my_range`，沒填視為整個候選時段窗口）有時間實際重疊的其他真人參與者，用該候選時段自己的交集運算結果篩選，不是整個候選時段隨便算
- `candidate_slots[]` 裡 `is_selected: false` 的項目，`co_participants` 一律是空陣列——不會洩漏使用者自己沒選的候選時段裡別人選了誰
- 「有時間重疊」是嚴格判斷（交接情境，例如一人 9:00-10:00、另一人 10:00-11:00，不算重疊），不是「選了同一個候選時段就算」

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
| `slotStart`       | string（ISO 字串） | ✅   | 須與該候選時段 `decision_candidates[].segments` 中某一筆完全相符 |
| `slotEnd`         | string（ISO 字串） | ✅   | 同上                                                                   |

> **BREAKING**：情境四不再直接採用候選時段的原始邊界當最終時間，改成從交集運算結果裡選一個窄窗口，比照情境二在確認當下才臨時建立新的 `ActivityCandidateSlot`。

**Response**

| 狀態碼 | 說明                                             |
| ------ | ------------------------------------------------ |
| `200`  | 成團成功                                         |
| `400`  | 此活動狀態不允許確認成團 / 時段不在候選名單中     |

### 人數滿額不再自動成團

> **BREAKING**：`POST /api/activities/:id/join` 讓報名人數達到 `participant_target` 時，四個情境皆不再自動把活動狀態設為 `confirmed`，一律轉為 `voting`（決策緩衝狀態）並發送 `formation_ready` 通知給建立者（`time_to_pick` 保留給報名截止進入決策期的情境），最終成團一律要建立者手動呼叫 `POST /api/activities/:id/confirm-formation`。

---

## 活動聊天室 Chat

### Socket.io 即時連線

後端在 `server.listen` 時一併啟動 Socket.io 服務。連線時會從 `cookie` 自動解析 JWT 並查詢使用者已加入的活動，自動加入對應的聊天室房間。前端不需手動 emit join 事件。

**連線 URL**：與 REST API 同主機／埠

**Socket Event — 伺服器 → 用戶端**

| 事件              | 說明                     | Payload                                                                 |
| ----------------- | ------------------------ | ----------------------------------------------------------------------- |
| `chat:new_message` | 新訊息廣播（所有同房成員） | `{ id, chat_id, sender: { id, display_name, avatar_url }, content, created_at }` |

---

### POST `/api/activities/:id/messages` — 傳送訊息

需要登入，且僅限活動的 joined 參與者。

**Rate Limit**：30 次 / 15 分鐘（以 `userId:activityId` 計算）

**Request Body**

| 欄位      | 類型   | 必填 | 說明             |
| --------- | ------ | ---- | ---------------- |
| `content` | string | ✅   | 長度 1–2000 字元 |

```json
{
  "content": "明天幾點集合？"
}
```

**Response**

| 狀態碼 | 說明                     |
| ------ | ------------------------ |
| `201`  | 傳送成功，回傳訊息物件   |
| `400`  | content 格式不正確       |
| `403`  | 你不是此活動的參與者     |
| `404`  | 活動或聊天室不存在       |
| `429`  | 傳送訊息太頻繁           |

```json
// 201
{
  "id": "uuid",
  "chat_id": "uuid",
  "sender_id": "uuid",
  "content": "明天幾點集合？",
  "created_at": "2026-07-21T10:00:00.000Z",
  "sender": {
    "id": "uuid",
    "display_name": "小明",
    "avatar_url": null
  }
}
```

```json
// 403
{ "message": "你不是此活動的參與者" }
```

---

### GET `/api/activities/:id/messages` — 取得歷史訊息

需要登入，且僅限活動的 joined 參與者。

**Query Parameters**

| 參數     | 類型   | 必填 | 預設 | 說明                                              |
| -------- | ------ | ---- | ---- | ------------------------------------------------- |
| `before` | string | 否   | —    | ISO8601 時間，回傳比此時間更舊的訊息（cursor）     |
| `limit`  | number | 否   | 20   | 單頁筆數（1–100）                                 |

**Response**

| 狀態碼 | 說明                   |
| ------ | ---------------------- |
| `200`  | 成功，回傳分頁結果     |
| `403`  | 你不是此活動的參與者   |
| `404`  | 活動或聊天室不存在     |

```json
// 200
{
  "data": [
    {
      "id": "uuid",
      "chat_id": "uuid",
      "sender_id": "uuid",
      "content": "明天幾點集合？",
      "created_at": "2026-07-21T10:00:00.000Z",
      "sender": {
        "id": "uuid",
        "display_name": "小明",
        "avatar_url": null
      }
    }
  ],
  "next_cursor": "2026-07-21T09:59:00.000Z"
}
```

首次請求不帶 `before` 參數即取得最新訊息。若有 `next_cursor`，將其值帶入下一次請求的 `before` 參數即可取得下一頁（更舊的訊息）。
