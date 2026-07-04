# LINE Official Account 推播設定

這份文件是給要實際測 LINE 通知的人看的。程式碼只能呼叫 LINE Messaging API，不能自動幫你建立 LINE Official Account、LINE provider、Messaging API channel 或 channel access token；這些都要先在 LINE 後台手動設定。

## 先看結論

- 使用者要先有 BuJo 的 LINE Login identity，也就是 `user_identities.provider = "line"` 且有 `provider_user_id`。
- LINE Login channel 與 Messaging API channel 必須在 same provider，這樣 LINE Login 拿到的 LINE user ID 才能拿去做官方帳號 push。
- 使用者也要加入官方帳號，不然 Messaging API push 可能會失敗或送不到。
- 本地預設 `LINE_PUSH_ENABLED=false`，避免開發時誤打真實 LINE API、消耗官方帳號訊息額度。

## 後台設定 checklist

1. 建立 LINE Official Account
   - 到 LINE Official Account Manager 建立官方帳號。
   - 建好後進入官方帳號後台，準備啟用 Messaging API。

2. 啟用 Messaging API
   - 在官方帳號後台啟用 Messaging API。
   - 啟用時選擇與 BuJo LINE Login channel 相同的 LINE Developers provider，也就是 same provider。
   - 不要另外選一個新 provider；provider 選錯時，LINE Login identity 可能不能當 Messaging API push recipient 使用。

3. 取得 channel access token
   - 到 LINE Developers Console，打開這個官方帳號對應的 Messaging API channel。
   - 在 Messaging API 設定頁產生或複製 channel access token。
   - 把 token 放進後端 `.env`：

```env
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=你的_messaging_api_channel_access_token
LINE_PUSH_ENABLED=false
```

正式整合測試前才把 `LINE_PUSH_ENABLED=true`。本地開發與自動測試請維持 `LINE_PUSH_ENABLED=false`。

4. 讓測試帳號加入官方帳號
   - 在 LINE Official Account Manager 找到 add friend URL 或 QR code。
   - 用測試手機掃 QR code，或打開 add friend 連結加入官方帳號。
   - 測試帳號也要完成 BuJo 的 LINE Login，讓資料庫有 `provider = "line"` 的 identity。

5. 可選：在 LINE Login 流程提示加好友
   - LINE Login channel 可以 link a bot，把官方帳號連到 LINE Login channel。
   - 登入授權 URL 可使用 add friend option：`bot_prompt=normal` 或 `bot_prompt=aggressive`。
   - `bot_prompt=normal` 會在同意畫面提示加好友；`bot_prompt=aggressive` 會在登入後更積極提示。
   - 這只是幫使用者加入官方帳號，不會取代後端的 Messaging API 設定。

## 後端環境變數

| 變數 | 用途 | 本地預設 |
| ---- | ---- | -------- |
| `LINE_CHANNEL_ID` | LINE Login channel id | 空 |
| `LINE_CHANNEL_SECRET` | LINE Login channel secret | 空 |
| `LINE_CALLBACK_URL` | LINE Login callback URL | `http://localhost:3000/api/auth/line/callback` |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Messaging API channel access token，用來讓 LINE Official Account 推播 | 空 |
| `LINE_PUSH_ENABLED` | 是否真的呼叫 LINE Messaging API | `false` |

## BuJo 目前怎麼判斷誰能收到 LINE

符合以下條件才會嘗試推播：

- 收件者有 LINE Login identity：`user_identities.provider = "line"`。
- 該 identity 有 `provider_user_id`，後端會把它當 Messaging API `to`。
- `notification_preferences` 沒有關閉該通知類型的 `line`；沒有 preference row 時視為允許。
- `LINE_PUSH_ENABLED=true` 且 `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` 有設定。

目前支援三種通知：

- `friend_request_created`：`{requesterName} 向你發送好友邀請`
- `friend_request_accepted`：`{receiverName} 接受了你的好友邀請`
- `activity_created`：`{creatorName} 建立了新活動：{activityTitle}`

LINE 推播是 best-effort。也就是 LINE API 失敗、token 沒設、使用者沒加入官方帳號、或使用者沒有 LINE identity，都不會讓原本的好友邀請、接受好友、建立活動失敗；站內通知仍然是主要資料來源。

## 參考文件

- [LINE Messaging API getting started](https://developers.line.biz/en/docs/messaging-api/getting-started/)
- [Share your LINE Official Account](https://developers.line.biz/en/docs/messaging-api/sharing-bot/)
- [Add a LINE Official Account as a friend when logged in](https://developers.line.biz/en/docs/line-login/link-a-bot/)
