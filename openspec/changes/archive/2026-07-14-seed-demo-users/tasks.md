## 1. TDD 契約測試

- [x] 1.1 在 `src/__tests__/seedUsers.test.js` 先建立失敗測試，涵蓋「Seed five fixed demo users」「Create local-only login identities」「Share one securely generated demo password hash」「Preserve planned profile data」，並以 focused Jest 證明現有空實作尚未符合契約。

## 2. Demo 使用者實作

- [x] 2.1 在 `prisma/seeds/users.js` 實作「單一 transaction 與 nested identity create」「共用密碼只雜湊一次」「固定角色鍵與完整 nullable 欄位」三項決策，使 focused Jest 全數通過且 `seedUsers(prisma)` 回傳五個固定角色。

## 3. 完整驗證

- [x] 3.1 依 Implementation Contract 執行完整 `npm test`、`node --check prisma/seeds/users.js` 與 `git diff --check`；若 `DATABASE_URL` 經確認屬可清除的本機或 Demo 資料庫，再以 migrate reset、資料查詢及 auth API 驗證五組登入、錯誤密碼與 `/api/auth/me` provider 契約。

## 4. 頭像 TDD 契約

- [x] 4.1 在 Jest 測試先覆蓋「Seed fixed Cloudinary avatar images」「Abort before database writes when avatar preparation fails」「Preserve existing API avatar upload behavior」，驗證 Repo 內固定頭像資產、可覆寫的 Cloudinary public ID、先上傳頭像再建立資料庫 transaction，並以 focused Jest 確認現有實作因缺少頭像行為而失敗。

## 5. 頭像資產與 Seed 實作

- [x] 5.1 將 Repo 內固定頭像資產加入 `prisma/seed-assets/avatars/`，並擴充 `uploadAvatarImage(file, options)` 支援可選 `publicId` 的 overwrite/invalidate 上傳，同時以 `cloudinaryAvatarService.test.js` 證明無 options 的既有 API 行為不變。
- [x] 5.2 更新 `seedUsers(prisma)`，先讀取並上傳五張角色頭像，再於單一 User transaction 寫入各自 `avatar_url` 與 `avatar_public_id`；以 `seedUsers.test.js` 證明角色 mapping、失敗時不啟動 transaction 與固定角色回傳皆符合契約。

## 6. 頭像整合驗證

- [x] 6.1 執行 focused Jest、完整 `npm test`、JavaScript 語法與 `git diff --check`；確認 Cloudinary 設定存在後重跑本機 `npm run prisma:reset`，查驗五位 User 皆有 HTTPS `avatar_url`、`avatar_public_id` 為設定資料夾下的 `demo-users/<key>`，且登入與 `/api/auth/me` 回傳對應頭像。
