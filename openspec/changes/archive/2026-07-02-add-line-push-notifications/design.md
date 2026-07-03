## Context

BuJoBackend 已有站內通知資料表與 notification service，好友邀請、好友接受、好友建立活動都會寫入 `notifications`。專案也已有 LINE Login flow，LINE identity 存在 `user_identities`，但目前的 `src/services/lineService.js` 只負責 OAuth 登入，不負責官方帳號訊息推播。

LINE 官方帳號推播屬於 LINE Messaging API。v1 使用既有 LINE Login identity 作為 BuJo user 到 LINE user ID 的綁定來源，前提是 LINE Login channel 與 Messaging API channel 放在同一 LINE provider。開發與測試期間需避免打真實 LINE API，因為 push message 會計入官方帳號訊息額度。

這個功能同時需要 LINE 後台設定：建立 LINE Official Account、啟用 Messaging API、選擇與 LINE Login 相同的 provider、取得 Messaging API channel access token，並讓測試帳號加入官方帳號。這些步驟無法由後端程式自動完成，必須被寫成可操作的設定教學。

## Goals / Non-Goals

**Goals:**

- 讓好友邀請、好友接受、好友建立活動三種既有站內通知可同步送出 LINE 文字推播。
- 以 `user_identities.provider = "line"` 的 `provider_user_id` 作為 LINE push recipient id。
- 尊重 `NotificationPreference.line`；沒有 preference row 時採用目前 schema default 語意，視為允許 LINE。
- 以 `LINE_PUSH_ENABLED` 控制是否呼叫真實 LINE API，本地與測試預設不呼叫。
- LINE 推播失敗不影響原本 API 成功與站內通知寫入。
- 提供 `docs/line-official-account-setup.md`，用白話 checklist 教使用者完成 LINE Official Account 與 Messaging API 設定。

**Non-Goals:**

- 不實作 Messaging API account linking、follow webhook、unfollow webhook 或只加入官方帳號的綁定流程。
- 不新增 LINE delivery log table、重試排程、背景 worker 或批次補送。
- 不新增 Flex Message、rich menu、deep link、template message 或可點擊 actions。
- 不擴充活動成團、活動取消、排程提醒到 LINE。
- 不改 Prisma schema，不新增 authenticated API endpoint。
- 不自動建立或管理 LINE Official Account、LINE provider、Messaging API channel、channel access token。

## Decisions

### Use LINE Login identity as the v1 binding source

收件者 LINE user ID 從 `userIdentity.findFirst({ provider: "line", user_id: recipientId })` 取得，使用 `provider_user_id` 作為 Messaging API `to`。這比先做 account linking/webhook 簡單，且符合 v1 已選定的「LINE 登入綁定」路線。

Alternative considered: Messaging API account linking 能支援「只加官方帳號」後再綁定 BuJo 帳號，但需要 webhook、link token、nonce 與解除綁定流程，超出這次三種通知同步推播的範圍。

### Keep Messaging API delivery in lineMessagingService

新增 `src/services/lineMessagingService.js` 封裝官方帳號推播：讀取 `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`、檢查 `LINE_PUSH_ENABLED`、呼叫 `https://api.line.me/v2/bot/message/push`、回傳 delivery result。既有 `lineService.js` 保持只處理 LINE Login/OAuth，避免把登入 channel 與 Messaging API channel 的責任混在一起。

Alternative considered: 直接在 `notificationService.js` 呼叫 `fetch`。這會讓通知 fanout、偏好查詢、LINE API HTTP 細節混在同一層，後續加入 mock、錯誤分類或額度保護會更難測。

### Gate real push calls with LINE_PUSH_ENABLED

只有 `LINE_PUSH_ENABLED === "true"` 時才呼叫真實 LINE endpoint。未啟用時 `sendLinePushMessage` 回傳 skipped result，並且不可呼叫 `fetch`。這保護開發與 CI 不消耗官方帳號訊息額度。

Alternative considered: 只靠 token 是否存在判斷是否送出。這容易在本地 `.env` 放入真實 token 後誤送，因此 explicit feature flag 較安全。

### Treat LINE delivery as best-effort side effect

站內通知仍是主要資料來源。LINE delivery 失敗、LINE identity 不存在、preference 關閉、feature flag 關閉、token 未設定，都不回滾已建立的通知，也不讓好友邀請、好友接受或建立活動 API 回傳失敗。

Alternative considered: 將 LINE delivery 與通知寫入放在同一 transaction。外部 HTTP API 不適合放進資料庫 transaction，且推播暫時失敗不應讓核心社交與活動流程失敗。

### Reuse notificationService as the fanout coordinator

`notificationService.js` 已知道通知類型、reference 與活動好友 fanout 規則，因此它負責在建立站內通知後決定是否呼叫 LINE delivery helper。LINE 訊息文字沿用目前通知列表 formatter 的語意，v1 使用純文字。

Alternative considered: 新增完整 notification dispatcher。這次只處理三種既有同步通知，新增 dispatcher 會提前引入背景佇列與 delivery log 設計，不符合 v1 範圍。

### Document LINE Official Account setup as an operator checklist

新增 `docs/line-official-account-setup.md`，用可執行 checklist 說明如何建立 LINE Official Account、啟用 Messaging API、在啟用時選擇與既有 LINE Login channel 相同的 provider、取得 channel access token、設定 `.env`、用 QR code 或加好友連結加入官方帳號，以及可選擇把官方帳號 link 到 LINE Login channel 並使用 `bot_prompt=normal` 或 `bot_prompt=aggressive` 提醒使用者加好友。

Alternative considered: 只在 `AGENT.md` 或 `API_DOCS.md` 補一句「請建立官方帳號」。這不足以支援實作後的人工驗證，尤其 provider 選錯後不能移動 channel，會讓 LINE user ID 綁定失效。

## Implementation Contract

Behavior: 當好友邀請、好友接受、好友建立活動成功建立站內通知後，BuJoBackend 會對每位符合條件的收件者嘗試送出一則 LINE text push。符合條件表示收件者有 LINE identity、通知類型對應的 `NotificationPreference.line` 不是 false，且 `LINE_PUSH_ENABLED` 為 true。

Interface / data shape: 新 service 匯出 `sendLinePushMessage({ to, text }, fetchImpl = fetch)`，回傳物件至少包含 `status`，值為 `sent`、`skipped` 或 `failed`。送出時 HTTP body 使用 `{ to, messages: [{ type: "text", text }] }`，Authorization header 使用 `Bearer ${LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`。

Message text: 好友邀請為「{requesterName} 向你發送好友邀請」；好友接受為「{receiverName} 接受了你的好友邀請」；活動建立為「{creatorName} 建立了新活動：{activityTitle}」。缺少名稱時沿用站內通知 fallback：「有人」、「對方」、「新活動」。

Setup documentation: `docs/line-official-account-setup.md` 必須包含「後台設定順序」、「同 provider 原因」、「必要環境變數」、「讓使用者加入官方帳號的方法」、「可選的 LINE Login add friend option」、「本地測試與正式測試切換」。文件要明確說明 LINE Official Account / Messaging API 無法由後端自動建立。

Failure modes: 若 feature flag 關閉，LINE delivery 回傳 skipped 且不呼叫 `fetch`。若 token 缺少、LINE API 非 2xx、fetch throw、收件者無 LINE identity、或 preference 關閉，原本 API response 與站內通知寫入維持成功；系統記錄可診斷錯誤但不拋到 controller。

Acceptance criteria: Jest tests 驗證 disabled flag 不呼叫 `fetch`、enabled flag 送出正確 endpoint/header/body、API 失敗回傳 failed、三種通知流程只對 eligible recipient 呼叫 LINE service、ineligible recipient 不推播。文件檢查確認 `docs/line-official-account-setup.md` 包含建立官方帳號、啟用 Messaging API、同 provider、channel access token、QR code / 加好友連結、`bot_prompt`、`LINE_PUSH_ENABLED=false` 等設定項。執行 `npm test -- --runTestsByPath src/__tests__/lineMessagingService.test.js src/__tests__/notificationService.test.js src/__tests__/friendshipController.test.js` 應通過。

Scope boundaries: 本 change 僅建立即時 best-effort LINE text push 與人工設定教學。任何 webhook/account linking、重試 job、delivery log table、活動成團/取消通知、正式額度查詢、前端設定頁 UI、後台自動化建立 LINE 官方帳號都不在本次 apply 範圍。

## Risks / Trade-offs

- [Risk] LINE Login channel 與 Messaging API channel 若不在同一 LINE provider，`provider_user_id` 不能當官方帳號 push recipient 使用 → Mitigation: 文件明確標註 provider 前提，正式整合測試使用同 provider 測試帳號驗證。
- [Risk] provider 選錯後不容易修正，導致需要重建 channel 或重新綁定使用者 → Mitigation: 設定教學把「先確認 provider」放在啟用 Messaging API 前的必檢項。
- [Risk] 使用者完成 LINE Login 但沒有加入官方帳號時，LINE API 可能拒絕或無法送達 → Mitigation: v1 視為 delivery failed，不影響站內通知；文件提供 QR code、加好友連結與 LINE Login add friend option 三種加入方式。
- [Risk] 開發中誤送真實訊息消耗額度 → Mitigation: `LINE_PUSH_ENABLED` 預設 false，tests 驗證 disabled 時不呼叫 `fetch`，文件要求只有正式整合測試才改成 true。
- [Risk] notification service 查詢 identity/preference 會增加每次通知的資料庫查詢 → Mitigation: v1 通知量小且同步處理可接受；若後續量變大再導入 dispatcher 或 background worker。
