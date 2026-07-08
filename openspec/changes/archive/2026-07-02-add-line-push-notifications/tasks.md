## 1. LINE Messaging API delivery service

- [x] 1.1 建立 `src/services/lineMessagingService.js`，落實 Keep Messaging API delivery in lineMessagingService：`sendLinePushMessage({ to, text }, fetchImpl = fetch)` 在 LINE push delivery for supported notifications 需要送出時回傳 `sent`、`skipped` 或 `failed` delivery result；以 `npm test -- --runTestsByPath src/__tests__/lineMessagingService.test.js` 驗證 disabled、sent、failed 三種結果。
- [x] 1.2 落實 Gate real push calls with LINE_PUSH_ENABLED 與 LINE Messaging API request shape：只有 `LINE_PUSH_ENABLED === "true"` 且 token 存在時才 POST `https://api.line.me/v2/bot/message/push`，body 為 `{ to, messages: [{ type: "text", text }] }` 並帶 Bearer token；以 `lineMessagingService.test.js` 驗證 disabled 不呼叫 `fetch`、enabled 呼叫正確 endpoint/header/body、缺 token 回傳 failed。

## 2. Notification eligibility and fanout wiring

- [x] 2.1 在 `src/services/notificationService.js` 實作 Use LINE Login identity as the v1 binding source 與 LINE recipient eligibility：依 recipient user id 查 `userIdentity` 的 `provider="line"` 與 `provider_user_id`，並依通知 type 查 `NotificationPreference.line`，沒有 preference row 時視為允許；以 `notificationService.test.js` 驗證有 LINE identity 且未關閉偏好會進入 LINE delivery，無 LINE identity 或 `line=false` 會略過。
- [x] 2.2 在好友邀請與好友接受流程落實 Reuse notificationService as the fanout coordinator：建立站內通知後，eligible recipient 會收到「{requesterName} 向你發送好友邀請」或「{receiverName} 接受了你的好友邀請」LINE 文字；以 `notificationService.test.js` 驗證兩種通知的訊息文字、recipient id、站內通知仍照原本欄位寫入。
- [x] 2.3 在活動建立通知流程落實 LINE push delivery for supported notifications：`notifyFriendsActivityCreated` 對每個 eligible accepted friend 送出「{creatorName} 建立了新活動：{activityTitle}」LINE 文字，ineligible friend 只保留站內通知或被跳過 LINE delivery；以 `notificationService.test.js` 驗證多好友 fanout、訊息文字與 createMany 站內通知行為維持不變。
- [x] 2.4 落實 Treat LINE delivery as best-effort side effect 與 LINE delivery failures do not break core notification flows：LINE API failed、missing token、fetch throw、無 LINE identity、偏好關閉都不會讓好友邀請、好友接受、活動建立流程失敗；以 `notificationService.test.js` 與 `friendshipController.test.js` 驗證原 API 回應與 notification create/createMany 仍成功。

## 3. LINE setup documentation and configuration

- [x] 3.1 更新 `.env.example`，新增 `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=` 與 `LINE_PUSH_ENABLED=false`，讓本地預設不呼叫真實 LINE API；以內容檢查確認兩個變數存在且 `LINE_PUSH_ENABLED` 預設為 false。
- [x] 3.2 建立 `docs/line-official-account-setup.md`，落實 Document LINE Official Account setup as an operator checklist 與 LINE Official Account setup documentation：文件以白話 checklist 教使用者建立 LINE Official Account、啟用 Messaging API、選擇與 LINE Login channel 相同 provider、取得 channel access token、設定 `.env`、用 QR code 或加好友連結加入官方帳號、可選擇使用 LINE Login add friend option 的 `bot_prompt=normal` 或 `bot_prompt=aggressive`；以內容檢查確認上述每個設定項都存在。
- [x] 3.3 更新 `API_DOCS.md` 與 `AGENT.md` 的 LINE 通知說明，明確寫出 LINE Login identity 是 v1 binding source、Messaging API channel access token 是官方帳號推播用途、兩個 LINE channel 必須在同一 provider、後端不會自動建立 LINE Official Account / provider / Messaging API channel / token；以文件內容檢查確認沒有把 `src/services/lineService.js` 描述成推播 service。

## 4. Verification

- [x] 4.1 執行 focused regression：`npm test -- --runTestsByPath src/__tests__/lineMessagingService.test.js src/__tests__/notificationService.test.js src/__tests__/friendshipController.test.js`，確認 LINE Messaging API request shape、LINE recipient eligibility、LINE delivery failures do not break core notification flows 三個規格都被測到且通過。
- [x] 4.2 執行文件驗證：用 `rg -n "LINE Official Account|Messaging API|same provider|channel access token|LINE_MESSAGING_CHANNEL_ACCESS_TOKEN|LINE_PUSH_ENABLED=false|QR code|add friend|bot_prompt" docs/line-official-account-setup.md API_DOCS.md AGENT.md` 確認 LINE Official Account setup documentation 的必要設定詞都有被寫入。
- [x] 4.3 執行 Spectra verification：`spectra validate add-line-push-notifications`，確認 proposal、design、spec 與 tasks artifact 在 implementation 前仍一致。
