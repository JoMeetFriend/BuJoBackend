## Context

`prisma/seed.js` 已改為呼叫拆分後的 seed 模組，但 `seedUsers(prisma)` 目前只回傳空物件。後續 friendships、activities、notifications seed 需要穩定的角色物件，本地 Demo 也需要可實際登入的帳號。

## Goals / Non-Goals

**Goals:**

- 建立五位資料固定、可用共用密碼登入的 Demo 使用者。
- 為五位角色上傳固定 Cloudinary 頭像並保存可管理的 public ID。
- 讓五位 User 與各自的 local identity 在同一個 transaction 中建立。
- 提供 `{ alice, bob, carol, dave, eve }` 作為後續 seed 的穩定介面。

**Non-Goals:**

- 不建立 Google 或 LINE identity。
- 不修改 schema、migration、認證 API、legacy seed 或其他 seed 模組。
- 不讓 seed 支援重複執行；預期由 `prisma migrate reset` 在空資料庫執行。

## Decisions

### 單一 transaction 與 nested identity create

使用 Prisma interactive transaction，transaction callback 內建立五位 User；每次 User create 透過 nested create 同時建立唯一的 local identity。這能確保任一帳號建立失敗時不留下部分資料。相較先建立 Users 再 createMany identities，此方式直接維持 User 與登入身分的原子性。

### 共用密碼只雜湊一次

在 transaction 前以 `bcrypt.hash("BujoDemo#2026", 10)` 產生一次 hash，五筆 identity 共用該 hash。明文只作為 seed 輸入，不寫入資料庫或 console。

### 固定角色鍵與完整 nullable 欄位

帳號資料以固定 key 定義，建立完成後回傳 `{ alice, bob, carol, dave, eve }`。無 bio 角色明確使用 `bio: null`，頭像欄位則使用對應 Cloudinary 上傳結果，讓 seed 契約可直接測試。

### Repo 內固定頭像資產

五張 PNG 以角色 key 正規化為 `alice.png` 至 `eve.png`，存放在 `prisma/seed-assets/avatars/`。不使用桌面絕對路徑，確保其他開發者與 CI 能執行同一份 seed。

### 可覆寫的 Cloudinary public ID

擴充既有 `uploadAvatarImage(file, options)`，讓 seed 傳入 `publicId: "demo-users/<key>"`；服務將其交給 Cloudinary 的 `public_id`，並啟用 overwrite 與 invalidate。API 現有單參數呼叫維持隨機 public ID，不改變上傳端點行為。固定 public ID 避免每次 reset 產生重複資產。

### 先上傳頭像再建立資料庫 transaction

`seedUsers` 先讀取五張資產並完成 Cloudinary 上傳，取得每位角色的 URL 與 public ID 後才開始既有 User transaction。任一讀檔或上傳失敗時函式直接拋錯，不建立任何 User；若資料庫 transaction 失敗，固定 public ID 資產留待下次 seed 覆寫。

## Implementation Contract

- `seedUsers(prisma)` SHALL 在單一 transaction 中建立 Alice、Bob、Carol、Dave、Eve 五位 User。
- Alice、Bob、Carol SHALL 使用規劃的繁體中文 bio；Dave、Eve SHALL 使用 `bio: null`。
- seed SHALL 從 repo 內讀取五張角色 PNG，使用 `demo-users/<key>` 固定 public ID 上傳 Cloudinary，並將回傳值寫入對應 User 的 `avatar_url` 與 `avatar_public_id`。
- 每位 User SHALL 以 nested create 建立且只建立一筆 local identity；`provider_user_id` 與 `email` SHALL 等於該角色的 `<name>@example.com`。
- 五筆 identity SHALL 共用以 bcrypt cost 10 產生的 `BujoDemo#2026` hash；明文密碼 SHALL NOT 被寫入資料庫或 console。
- 函式 SHALL 回傳五個固定小寫角色 key，值為對應的 Prisma User create 結果；Prisma 或 bcrypt 失敗 SHALL 原樣拋出並由 seed 入口既有錯誤處理接手。
- 任一頭像讀取或上傳失敗 SHALL 阻止 User transaction 開始並將原始錯誤拋出；既有 API 頭像上傳呼叫 SHALL 維持原行為。
- Jest 測試 SHALL 驗證資產 mapping、Cloudinary options、transaction、五筆 create payload、hash 可比對且非明文，以及回傳 mapping。

## Risks / Trade-offs

- [共用密碼不適用正式使用者] → 僅限可重置的本機或 Demo 資料庫，文件與程式不將其描述為正式帳號。
- [非 idempotent，重跑會觸發 identity unique constraint] → 以 `prisma migrate reset` 後 seed 作為唯一支援流程。
- [bcrypt 使測試稍慢] → 僅雜湊一次並在單一 focused test suite 驗證。
- [seed 開始依賴 Cloudinary 憑證與網路] → 缺少設定或上傳失敗時 fail fast，不建立部分使用者資料。
- [PNG 資產增加 repo 大小] → 僅納入五張 Demo 必要圖片，不在 seed 內產生衍生尺寸。
