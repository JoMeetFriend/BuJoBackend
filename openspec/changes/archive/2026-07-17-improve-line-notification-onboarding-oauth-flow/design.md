## Context

目前 `createLineAuthorizationUrl(userId)` 會把 `bot_prompt=normal` 固定寫入 LINE authorize URL，login 與 link 共用同一提示強度。`lineCallback` 又在驗證 `state` 前先處理 `error=access_denied` 與缺少 `code`，因此 callback 尚未取得可信任的 OAuth attempt 就固定回 `/login`；已登入使用者取消或綁定失敗時會脫離個人設定流程，也沒有消耗該 attempt。

既有 `OAuthAttempt` 已以 `user_id` 區分 login（null）與 link（非 null），並提供 state 雜湊、10 分鐘過期與 `consumed_at` 一次性消耗。這份資料已足以作為 callback mode 的可信來源，不需要 schema 或 migration。

## Goals / Non-Goals

**Goals:**

- 一般 LINE login 使用 `bot_prompt=normal`，已登入帳號 link 使用 `bot_prompt=aggressive`。
- callback 只根據已驗證且已消耗的 OAuth attempt 判斷 login 或 link，讓各自的成功、取消與失敗回到正確前端頁面。
- 保留既有 state 防護與 LINE identity 唯一性，且以 service/controller 測試鎖定安全與 redirect contract。

**Non-Goals:**

- 不新增或更名 `/api/auth/line`、`/api/auth/line/link`、`/api/auth/line/callback`。
- 不變更 `OAuthAttempt`、`UserIdentity` 或其他 Prisma model，不建立 migration。
- 不追蹤 LINE Official Account friend、blocked 或 unfollow 狀態，也不新增 webhook。
- 不修改 LINE Messaging API 推播內容、notification preference、delivery service 或前端 onboarding UI。

## Decisions

### Validate an explicit botPrompt at the authorization service boundary

`createLineAuthorizationUrl(userId = null, botPrompt = 'normal')` 保留現有一般登入的預設行為，但在產生 state 與寫入 OAuth attempt 前檢查 `botPrompt` 是否嚴格等於 `normal` 或 `aggressive`。合法值才會寫入 authorize URL 的 `bot_prompt` query；其他型別、空字串或任意字串一律拋錯，且不得建立 attempt。

採用受限參數而不是讓 controller 傳入任意 query map，避免呼叫端改寫 `client_id`、`redirect_uri`、`scope` 或 `state` 等安全敏感欄位。另一個方案是把 prompt mode 寫進資料表，但 callback mode 已由 `user_id` 完整表達，新增欄位只會製造重複狀態。

### Use OAuthAttempt as the authoritative callback mode

`lineCallback` 必須先呼叫 `verifyLineState(state)`；成功回傳的 attempt 以 `user_id === null` 表示 login，以非 null `user_id` 表示 link。只有完成這一步後，才處理 provider `error`、缺少 `code`、token exchange、ID token verify 或 identity 寫入。

這個順序會讓有效 attempt 在成功、取消與失敗路徑都一次性消耗。不得新增 `mode=link` query、cookie 或前端 state 作為分流依據，因為未驗證輸入可把失敗導向偽造的流程。若 state 缺失、不存在、已使用或過期，後端無法可信分類，固定回 `/login?error=line_login_failed`。

### Preserve mode-specific redirects through all callback outcomes

驗證 attempt 後，login 與 link 使用以下固定 redirect contract：

| Mode | Outcome | Redirect |
| --- | --- | --- |
| login | success | `FRONTEND_URL/`，並簽發既有 `token` httpOnly cookie |
| login | `access_denied` | `FRONTEND_URL/login?error=line_cancelled` |
| login | 其他錯誤、缺 code 或處理例外 | `FRONTEND_URL/login?error=line_login_failed` |
| link | success | `FRONTEND_URL/profile/edit?linked=line`，不簽發新登入 cookie |
| link | `access_denied` | `FRONTEND_URL/profile/edit?error=line_link_cancelled` |
| link | 其他錯誤、缺 code、identity 衝突或處理例外 | `FRONTEND_URL/profile/edit?error=line_link_failed` |

controller 在 try/catch 外保留已驗證的 mode，讓 exchange、verify 或 `linkLineUser` 拋錯後仍能回到對應頁面。另一個方案是為每個階段分散 catch，但容易讓某條 link 失敗路徑退回 login fallback。

### Preserve identity conflict enforcement in linkLineUser

link callback 繼續把 attempt 的 `user_id` 傳給 `linkLineUser`。當同一 LINE `provider_user_id` 已屬於其他 BuJo 使用者時，service 必須拒絕寫入；controller 將此例外轉為 `line_link_failed` redirect。若 identity 已屬於目前使用者，維持 idempotent success，不建立重複 identity。

這項決策沿用資料庫 unique constraint 與既有 service 檢查，不把 identity 衝突細節暴露在 query string，也不改成帳號合併流程。

## Implementation Contract

- **Behavior:** `/api/auth/line` 明確以 normal prompt 建立 login attempt；`/api/auth/line/link` 在既有 authenticate middleware 後以 aggressive prompt 建立含目前 user ID 的 link attempt。callback 先驗證並消耗 state，再依 attempt mode 套用上表 redirect；link 取消或失敗不得導向登入頁。
- **Interface:** service signature 為 `createLineAuthorizationUrl(userId = null, botPrompt = 'normal')`，只接受 `normal`、`aggressive`。公開 HTTP endpoint 不變；新增可觀察的 link query 結果為 `linked=line`、`error=line_link_cancelled`、`error=line_link_failed`。
- **Failure modes:** invalid/expired/consumed state 固定視為無法分類的 login failure；有效 link attempt 的 provider 取消、缺 code、token/ID token 錯誤與 provider identity 已綁其他帳號全部回個人設定的綁定錯誤。錯誤路徑不建立或改綁 identity，不簽發新 cookie。
- **Acceptance criteria:** `src/__tests__/lineService.test.js` 驗證 normal/aggressive URL、非法 prompt 拒絕且不建立 attempt、state 有效與無效條件、identity 防重複綁定；`src/__tests__/lineAuthController.test.js` 驗證兩個入口的 prompt、login/link 成功、取消、缺 code、invalid state 與 provider 已屬其他帳號的 redirect/cookie 行為。執行 `npm test -- --runTestsByPath src/__tests__/lineService.test.js src/__tests__/lineAuthController.test.js` 與完整 `npm test` 必須通過。
- **Scope boundaries:** apply 只修改 LINE OAuth service/controller、對應測試與既有文件；不觸及 route topology、middleware 安全設定、Prisma schema/migration、webhook、官方帳號好友狀態、推播訊息、通知偏好或 delivery service。

## Risks / Trade-offs

- [無效 state 無法判斷原始 mode] → 固定採 login failure fallback，絕不信任額外 query 來宣稱 link；有效 link attempt 的所有結果仍會留在個人設定頁。
- [先消耗 state 代表暫時性 token exchange 失敗不能重試同一 callback] → 維持一次性 state 的安全語意，使用者可從 login 或 profile edit 重新發起 OAuth。
- [aggressive prompt 仍不能證明使用者已加官方帳號] → 只改善 LINE 授權時的加好友引導，不儲存或回傳好友狀態。
- [前端尚未顯示新的 link error query] → redirect 仍回正確頁面且保留穩定錯誤碼，前端可在自己的 change 中接上顯示，不阻擋 profile edit。

## Migration Plan

1. 先發布後端 service/controller 與測試；既有 endpoint 與資料表相容，不需停機或資料遷移。
2. 再發布前端 `add-line-notification-onboarding`，讓未連接 LINE 的 CTA 使用既有 link endpoint。
3. 回滾時可還原後端程式碼與文件；既有未消耗 OAuth attempt 仍符合舊 schema，無資料清理需求。

## Open Questions

無；prompt 值、redirect query、無效 state fallback 與 scope 已定義。
