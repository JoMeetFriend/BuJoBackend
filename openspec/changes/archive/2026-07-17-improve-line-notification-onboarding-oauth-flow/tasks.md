## 1. 先建立失敗測試鎖定 OAuth 契約

- [x] 1.1 在 `src/__tests__/lineService.test.js` 為 **Authorization prompt is selected by OAuth entry point** 與 **Validate an explicit botPrompt at the authorization service boundary** 建立 service 測試：驗證 `normal`、`aggressive` 出現在 URL，attempt 分別保存 null／指定 user ID，非法值在任何 Prisma write 前拒絕；以 `npm test -- --runTestsByPath src/__tests__/lineService.test.js` 確認新案例先因尚未實作而失敗。
- [x] 1.2 在 `src/__tests__/lineService.test.js` 為既有 state 與 identity guard 建立回歸測試：有效 state 只消耗一次，缺失／未知／過期／已消耗 state 拒絕，其他帳號已使用的 LINE provider ID 不得建立 identity、同帳號重綁維持 idempotent；以同一 targeted test 指令確認 assertions 能觀察 Prisma update/create 呼叫。
- [x] 1.3 在 `src/__tests__/lineAuthController.test.js` 為 **OAuth attempt authoritatively determines callback mode** 與 **Use OAuthAttempt as the authoritative callback mode** 建立 controller 測試：login/link 入口分別傳入 `normal`／`aggressive`，callback 在取消與缺 code 時仍先驗證 state，invalid state 不呼叫 exchange/verify/link 且回 login failure；以 `npm test -- --runTestsByPath src/__tests__/lineAuthController.test.js` 確認未實作前的失敗結果。
- [x] 1.4 在 `src/__tests__/lineAuthController.test.js` 為 **Login callback preserves login outcomes**、**Link callback remains in the authenticated settings context**、**Preserve mode-specific redirects through all callback outcomes** 與 **Preserve identity conflict enforcement in linkLineUser** 建立成功／取消／處理失敗／provider 已屬其他帳號測試；驗證 redirect query、login 成功才簽 cookie、link 永不簽新 cookie且有效 link 失敗不回登入頁，並以 targeted test 指令確認完整 outcome matrix。

## 2. 實作受限 prompt 與可信 callback 分流

- [x] 2.1 在 `src/services/lineService.js` 實作 `createLineAuthorizationUrl(userId = null, botPrompt = 'normal')` allowlist，在 state 產生與 attempt 寫入前拒絕非 `normal`／`aggressive`，並保留 state 雜湊、10 分鐘過期、一次性消耗及 `linkLineUser` identity 衝突行為；以 `npm test -- --runTestsByPath src/__tests__/lineService.test.js` 驗證 1.1、1.2 全部通過。
- [x] 2.2 在 `src/controllers/lineAuthController.js` 讓 `/api/auth/line` 明確要求 `normal`、`/api/auth/line/link` 明確要求 `aggressive`，並重排 callback 為先驗證 attempt、再依 `user_id` 處理 login/link 的成功、`access_denied`、缺 code 與例外；以 `npm test -- --runTestsByPath src/__tests__/lineAuthController.test.js` 驗證 login 回首頁／登入頁、link 回個人設定頁，以及 invalid state 安全 fallback。

## 3. 文件與整體驗證

- [x] 3.1 更新 `README.md` 與 `API_DOCS.md`，讓既有三個 LINE OAuth endpoint 的 normal/aggressive prompt、callback mode 來源及 success/cancel/failure redirect query 可被前後端整合者直接核對，並以 `rg -n "bot_prompt|line_link_cancelled|line_link_failed" README.md API_DOCS.md` 驗證文件包含完整 contract 且明載沒有新增 endpoint、schema 或推播 delivery 行為。
- [x] 3.2 執行 `npm test -- --runTestsByPath src/__tests__/lineService.test.js src/__tests__/lineAuthController.test.js`、完整 `npm test` 與 `git diff --check`，確認 prompt、state、login/link outcome、identity 衝突回歸全部通過，且 diff 僅包含 proposal Impact 列出的 OAuth service/controller、測試與文件，沒有 schema、migration、route、webhook、推播訊息、notification preference 或 delivery service 變更。
