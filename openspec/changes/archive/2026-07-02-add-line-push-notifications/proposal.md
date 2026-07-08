## Why

目前 BuJo 已有站內通知，但使用者離開網頁後無法即時收到好友邀請、好友接受、好友建立活動等通知。加入 LINE 官方帳號推播後，已完成 LINE 登入綁定且允許 LINE 通知的使用者，可以在 LINE 收到同一批重要通知。

這個功能也需要明確的 LINE 後台設定教學；如果沒有官方帳號、Messaging API channel、同 provider 設定與 channel access token，後端實作完成後仍無法實際推播。

## What Changes

- 新增 LINE 官方帳號推播能力，讓既有站內通知在建立後可同步送出 LINE 文字訊息。
- 使用既有 LINE Login identity 作為 BuJo user 與 LINE user ID 的綁定來源，要求 LINE Login channel 與 Messaging API channel 位於同一 LINE provider。
- 新增 Messaging API delivery service，使用 channel access token 呼叫 LINE push message endpoint。
- 新增 LINE push feature flag；本地與測試環境預設不打真實 LINE API，避免消耗官方帳號訊息額度。
- 擴充好友邀請、好友接受、好友建立活動三個既有通知流程，在收件者具備 LINE identity 且偏好允許時送出 LINE 推播。
- 新增 LINE 官方帳號建立與設定教學，涵蓋建立 LINE Official Account、啟用 Messaging API、選擇同一 provider、取得 channel access token、讓測試帳號加入官方帳號，以及可選的 LINE Login add friend option。
- 補充環境變數與文件，清楚區分 LINE Login 與 LINE Messaging API 的責任。

## Non-Goals (optional)

- 不實作只加入官方帳號但未 LINE 登入的 account linking / webhook 綁定流程。
- 不新增 Flex Message、rich menu、deep link 或可點擊按鈕訊息。
- 不處理活動成團、取消、排程提醒或批次重送。
- 不新增通知資料表欄位或 LINE delivery log 資料表。
- 不由後端自動建立 LINE 官方帳號、provider、Messaging API channel 或 channel access token；這些仍是人工後台設定。

## Capabilities

### New Capabilities

- `line-push-notifications`: 既有站內通知可依使用者 LINE identity、通知偏好與 feature flag 同步送出 LINE 官方帳號推播，並提供可操作的 LINE 官方帳號設定教學。

### Modified Capabilities

(none)

## Impact

- Affected specs: line-push-notifications
- Affected code:
  - New: src/services/lineMessagingService.js
  - New: src/__tests__/lineMessagingService.test.js
  - New: docs/line-official-account-setup.md
  - Modified: src/services/notificationService.js
  - Modified: src/__tests__/notificationService.test.js
  - Modified: .env.example
  - Modified: API_DOCS.md
  - Modified: AGENT.md
  - Removed: none
- External systems: LINE Official Account Manager, LINE Developers Console, LINE Messaging API push message endpoint
- Runtime configuration: LINE_MESSAGING_CHANNEL_ACCESS_TOKEN and LINE_PUSH_ENABLED
