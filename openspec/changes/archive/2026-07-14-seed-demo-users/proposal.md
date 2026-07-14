## Why

新版模組化 seed 尚未建立可登入的 Demo 使用者，使好友、活動與通知 seed 缺少穩定的角色來源，也無法以真實本地帳密驗證展示流程。

## What Changes

- 建立 Alice、Bob、Carol、Dave、Eve 五位固定 Demo 使用者。
- 每位使用者只建立 local identity，並共用一份以 bcrypt cost 10 產生的密碼雜湊。
- 在單一 transaction 中建立使用者與 nested identity，回傳固定角色 key 供後續 seed 使用。
- 將五張固定頭像資產納入 repo，seed 時上傳至 Cloudinary 並保存 URL 與 public ID。
- 新增 seed 單元測試，驗證角色資料、登入身分與密碼雜湊契約。

## Capabilities

### New Capabilities

- `demo-user-seeding`: 定義可重置 Demo 資料庫中的五位本地帳密使用者及其穩定角色介面。

### Modified Capabilities

(none)

## Impact

- Affected specs: demo-user-seeding
- Affected code:
  - Modified: `prisma/seeds/users.js`, `src/services/cloudinaryAvatarService.js`
  - New: `prisma/seed-assets/avatars/alice.png`, `prisma/seed-assets/avatars/bob.png`, `prisma/seed-assets/avatars/carol.png`, `prisma/seed-assets/avatars/dave.png`, `prisma/seed-assets/avatars/eve.png`, `src/__tests__/seedUsers.test.js`, `src/__tests__/cloudinaryAvatarService.test.js`
- 不變更 Prisma schema、migration、認證 API、legacy seed 或其他新版 seed 模組。
