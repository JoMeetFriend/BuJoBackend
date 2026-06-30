# BuJo Backend — API 文檔

Base URL：`http://localhost:3000`  
Production：`https://<your-domain>`

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
