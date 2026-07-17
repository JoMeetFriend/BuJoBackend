# BuJo Backend

BuJo 應用的後端 API，提供帳號認證、好友系統與活動揪團功能。

前端 repo：[JoMeetFriend/BuJo](https://github.com/JoMeetFriend/BuJo)（Vue 3 + Vite + Pinia）

## 技術棧

- **Node.js + Express** — HTTP 路由與請求處理
- **Prisma + PostgreSQL** — ORM 與資料庫
- **JWT（httpOnly cookie）+ bcrypt** — 本地帳密認證
- **Google Identity Services / LINE Login** — 第三方登入
- **Jest + Supertest** — 測試

## 環境變數

複製 `.env.example` 為 `.env` 後依下表填入：

| 變數                 | 說明                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL 連線字串，格式 `postgresql://USER:PASSWORD@HOST:5432/DB?schema=public` |
| `ALLOW_DEMO_SEED`    | 遠端資料庫或 `NODE_ENV=production` 執行 Demo seed 的明確授權；僅確認為可重置的 Demo DB 時設為 `true` |
| `PORT`               | 後端監聽的 port，預設 `3000`                                       |
| `JWT_SECRET`         | 簽發 / 驗證登入 JWT 用的密鑰，**絕不可外洩或提交到版控**           |
| `GOOGLE_CLIENT_ID`   | Google 登入用的 OAuth Client ID（驗證 ID Token 的 audience）       |
| `FRONTEND_URL`       | 前端網址，LINE 登入完成後導回前端使用                              |
| `ALLOWED_ORIGINS`    | CORS 白名單，允許的來源網址，多個以逗號分隔                        |
| `LINE_CHANNEL_ID`    | LINE Login channel ID                                              |
| `LINE_CHANNEL_SECRET`| LINE Login channel secret                                          |
| `LINE_CALLBACK_URL`  | LINE OAuth 完成後的 callback 網址（需與 LINE Developers 後台設定一致）|
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | LINE Messaging API 推播用 channel access token |
| `LINE_PUSH_ENABLED`  | 是否啟用 LINE Push API；本地與測試預設 `false`                     |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name，頭像上傳使用                          |
| `CLOUDINARY_API_KEY` | Cloudinary API key，頭像上傳使用                                   |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret，頭像上傳使用，**不可提交到版控**        |
| `CLOUDINARY_AVATAR_FOLDER` | Cloudinary 頭像資料夾，預設 `bujo/avatars`                  |

## 安裝與啟動

```bash
npm install

# 設定資料庫（見下方「Prisma / 資料庫設定」）
npm run prisma:migrate
npm run prisma:generate

npm run dev   # 本地開發，nodemon 自動重啟
npm start     # 正式啟動
```

## Prisma / 資料庫設定

- `npm run prisma:migrate`（`prisma migrate dev`）— 本地開發時建立並套用新 migration，異動 `schema.prisma` 後應使用這個指令產生對應的 migration 檔案
- `npm run prisma:generate`（`prisma generate`）— 依 `schema.prisma` 重新產生 Prisma Client，修改 schema 或 clone 專案後需要執行
- `npm run prisma:push`（`prisma db push`）— 直接將 schema 同步到資料庫、不產生 migration 歷史，僅適合本地快速原型測試，**不可用於取代正式 migration 流程**
- `npx prisma db seed` — 執行 `prisma/seed.js` 灌入種子資料

## 認證流程

三種登入方式最終都會簽發同一組 JWT，寫入 httpOnly cookie `token`（7 天效期），後續請求由 `authenticate` middleware 驗證此 cookie。同一個使用者可以同時綁定多種登入方式（見 `UserIdentity` 資料表）。

- **本地帳密**：註冊時以 `bcrypt`（cost 10）雜湊密碼存入 `password_hash`，登入時以 `bcrypt.compare` 驗證，皆有 rate limit 防護
- **Google 登入**：前端取得 Google ID Token 後送至 `POST /api/auth/google`，後端以 `google-auth-library` 驗證 Token 有效性與 audience
- **LINE Login / 綁定**：`GET /api/auth/line` 使用 `bot_prompt=normal`；已登入使用者由 `GET /api/auth/line/link` 使用 `bot_prompt=aggressive`。LINE 導回 `GET /api/auth/line/callback` 後，後端會先驗證並一次性消耗 `state`（存於 `OAuthAttempt` 表，雜湊儲存、10 分鐘過期），再由 attempt 的 `user_id` 判斷這次是 login 或 link。login 成功會簽發 `token` cookie 並回前端首頁；link 成功回 `/profile/edit?linked=line`；link 取消或失敗分別回 `/profile/edit?error=line_link_cancelled`、`/profile/edit?error=line_link_failed`，不會把已登入使用者送回登入頁。整個 OAuth 流程（state 驗證、code 交換）完全在後端處理

詳細 request/response 格式見 [API_DOCS.md](./API_DOCS.md)。

## 測試

```bash
npm test            # 執行全部測試
npm run test:watch  # watch 模式
npm run test:coverage
```

測試以 Jest + Supertest 撰寫，位於 `src/__tests__/`；Prisma Client 以 `src/lib/__mocks__/prisma.js` mock，不會連到真實資料庫。專案為 ESM（`"type": "module"`），指令已內建 `NODE_OPTIONS=--experimental-vm-modules`，不需額外設定。

## API 文件

完整 API 規格（endpoint、request/response 格式、錯誤碼）見 [API_DOCS.md](./API_DOCS.md)。

## 部署

- 後端部署於 Render：https://bujo-backend.onrender.com
- 前端部署於 Vercel：https://bujofe.vercel.app
- 合併進 `dev` 分支會自動觸發 Render 重新部署

Render 上需手動設定以下環境變數（正式環境的值，非本地開發值）：

`DATABASE_URL`、`JWT_SECRET`、`GOOGLE_CLIENT_ID`、`LINE_CHANNEL_ID`、`LINE_CHANNEL_SECRET`、`LINE_CALLBACK_URL`、`LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`、`LINE_PUSH_ENABLED`、`ALLOWED_ORIGINS`、`FRONTEND_URL`、`CLOUDINARY_CLOUD_NAME`、`CLOUDINARY_API_KEY`、`CLOUDINARY_API_SECRET`、`CLOUDINARY_AVATAR_FOLDER`
