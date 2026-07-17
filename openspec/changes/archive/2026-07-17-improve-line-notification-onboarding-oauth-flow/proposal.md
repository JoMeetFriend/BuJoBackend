## Why

BuJo 前端即將提供 LINE 通知 onboarding，但後端目前所有 LINE OAuth 都固定使用一般加好友提示，且 callback 在驗證 OAuth attempt 前就把取消與失敗一律導回登入頁。這會讓已登入使用者的 LINE 綁定流程缺少明確加好友引導，並在取消或失敗時錯誤離開個人設定情境。

## What Changes

- 讓 LINE authorization URL 建立流程接受受限的 `bot_prompt` 選項，只允許 `normal` 或 `aggressive`。
- 一般 LINE 登入使用 `normal`，已登入使用者的 LINE 綁定使用 `aggressive`。
- callback 先驗證並一次性消耗 OAuth state，再以 OAuth attempt 是否包含使用者 ID 判斷 login 或 link，分別處理成功、取消與失敗 redirect。
- 保留 state 雜湊儲存、10 分鐘過期、一次性消耗與 LINE identity 防重複綁定；無法對應有效 attempt 的 state 不得由 query 參數自行宣稱為 link flow。
- 補齊 service 與 controller 測試，鎖定 prompt、redirect、state 與 identity 衝突行為。

## Capabilities

### New Capabilities

- `line-oauth-onboarding-flow`: 規範 LINE login 與已登入帳號綁定使用不同加好友提示，以及 callback 依受信任 OAuth attempt 分流成功、取消與失敗結果。

### Modified Capabilities

(none)

## Impact

- Affected specs: line-oauth-onboarding-flow
- Affected APIs: `GET /api/auth/line`、`GET /api/auth/line/link`、`GET /api/auth/line/callback` 的 redirect 行為；不新增 endpoint。
- Affected code:
  - New: `src/__tests__/lineService.test.js`、`src/__tests__/lineAuthController.test.js`
  - Modified: `src/services/lineService.js`、`src/controllers/lineAuthController.js`、`README.md`、`API_DOCS.md`
  - Removed: none
- Data and external systems: 沿用既有 `oauth_attempts` 與 `user_identities`，不新增資料表、migration、webhook 或 LINE Official Account 好友狀態追蹤。
