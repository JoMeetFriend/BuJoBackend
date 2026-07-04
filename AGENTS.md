<!-- SPECTRA:START v1.0.2 -->

# Spectra Instructions

This project uses Spectra for Spec-Driven Development(SDD). Specs live in `openspec/specs/`, change proposals in `openspec/changes/`.

## Use `$spectra-*` skills when:

- A discussion needs structure before coding → `$spectra-discuss`
- User wants to plan, propose, or design a change → `$spectra-propose`
- Tasks are ready to implement → `$spectra-apply`
- There's an in-progress change to continue → `$spectra-ingest`
- User asks about specs or how something works → `$spectra-ask`
- Implementation is done → `$spectra-archive`
- Commit only files related to a specific change → `$spectra-commit`

## Workflow

discuss? → propose → apply ⇄ ingest → archive

- `discuss` is optional — skip if requirements are clear
- Requirements change mid-work? `ingest` → resume `apply`

## Parked Changes

Changes can be parked（暫存）— temporarily moved out of `openspec/changes/`. Parked changes won't appear in `spectra list` but can be found with `spectra list --parked`. To restore: `spectra unpark <name>`. The `$spectra-apply` and `$spectra-ingest` skills handle parked changes automatically.

<!-- SPECTRA:END -->

# AGENTS.md

給 Claude Code、Codex、Gemini PR 審閱等工具共用的規則。個人工具（如 graphify）的細節規則不放在這裡，請寫在本機 `CLAUDE.md`（不進版控，見 `CLAUDE.md.example`）。

## 目錄結構重點

```
src/
  app.js          Express app 組裝：CORS、middleware 掛載、路由掛載
  server.js       進入點，啟動 HTTP server
  routes/         路由定義，只掛 controller + middleware，不寫商業邏輯
  controllers/    處理 req/res，呼叫 service 或 prisma
  services/       商業邏輯（例如 lineService.js、notificationService.js）
  middleware/     authenticate.js（JWT 驗證）、rateLimiter.js
  lib/            共用工具：prisma.js（client 實例）、jwt.js（簽發/驗證）、cookieOptions.js
  __tests__/      Jest + Supertest 測試，__mocks__/prisma.js 提供 mock
prisma/
  schema.prisma   資料模型定義
  migrations/     正式 migration 歷史
  seed.js         種子資料
```

## 開發指令

- `npm run dev` — nodemon 啟動開發伺服器
- `npm start` — 正式啟動
- `npm test` / `npm run test:watch` / `npm run test:coverage` — 執行測試
- `npm run prisma:generate` — 重新產生 Prisma Client
- `npm run prisma:migrate` — 建立並套用 migration
- `npm run prisma:push` — 僅限本地快速原型使用，見下方邊界規則

## 共用規則（跨 repo，與前端 BuJo repo 一致）

- 分支命名：kebab-case，格式 `feature/描述-描述`
- Commit 訊息：無嚴格格式，動詞開頭或分類開頭皆可，比照現有 `git log` 風格，不要發明新格式
- Issue 格式：功能 + 預期結果
- PR 會有 Gemini 自動審閱，異動盡量聚焦單一目的，避免一個 PR 混雜多個不相關改動

## 後端特有邊界

- `JWT_SECRET` 絕不可外洩，不可出現在程式碼、log 或提交到版控
- 密碼一律以 `bcrypt` 雜湊後存入 `password_hash`，絕不可明文儲存或印出
- 變更 `prisma/schema.prisma` 必須搭配對應的 migration（`npm run prisma:migrate`），不可只改 schema 不產生 migration；`prisma db push` 僅適合本地原型測試，不可用來取代正式 migration 流程
- 現有 rate limiter（登入 15 分鐘 10 次、註冊 1 小時 5 次）為既定安全設計，如需調整請先與維護者確認，勿逕自修改或移除
- LINE 登入的 OAuth 流程（`state` 驗證、code 換 token）必須完全在後端處理，不可移至前端
- httpOnly cookie 設定（`secure`、`sameSite`，見 `src/lib/cookieOptions.js`）涉及跨網域認證安全性，不要在未理解影響下隨意改動

## 測試要求

新增或修改認證（auth）相關邏輯務必附上對應的 Jest 測試，參考 `src/__tests__/` 現有模式（Supertest 打 API + mock Prisma Client）。
