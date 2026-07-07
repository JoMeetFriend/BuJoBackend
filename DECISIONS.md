# DECISIONS

記錄目前程式碼中已知、刻意保留但尚未處理的設計限制，避免這些限制被誤認為是遺漏或 bug。

## NotificationJob 尚未有實作串接

`prisma/schema.prisma` 定義了 `NotificationJob`（`pending` / `sent` / `failed`，關聯 `Activity.pre_notify_hours`），看起來是為了活動開始前的提醒通知設計，但 `src/` 內沒有任何程式碼會寫入或讀取這張表 —— 沒有產生 job 的排程器，也沒有消費 job、寄送提醒、或把狀態標成 `sent`/`failed` 的 worker。

**現況**：這張表目前是死的 schema，`pre_notify_hours` 欄位也還沒有被任何流程使用。

**影響**：活動建立時設定的提前提醒時數目前不會實際觸發任何提醒。

## LINE 推播失敗沒有降級或重試機制

見 `docs/line-official-account-setup.md`：LINE 推播被設計為 best-effort，`sendLinePushMessage`（`src/services/lineMessagingService.js`）失敗時只回傳 `{ status: 'failed', reason, ... }`，呼叫端 `deliverLineNotification`（`src/services/notificationService.js`）會 catch 住任何例外並回傳同樣形狀的結果，確保好友邀請 / 接受好友 / 建立活動等主流程不會因為 LINE 推播失敗而跟著失敗。

**現況**：

- 站內通知（`Notification` 資料表）一定會先建立成功，LINE 推播是附加行為，不影響主流程 —— 這是刻意的設計。
- 但 `sendLinePushMessage` / `deliverLineNotification` 回傳的 `failed` 狀態目前沒有任何呼叫端讀取或記錄，也就是說：
  - 推播失敗時不會自動重試。
  - 沒有寫入任何地方（log、資料表、監控指標），維運者無法得知 LINE 推播的實際成功率或失敗原因（token 過期、使用者未加好友、API 逾時等）。
  - 使用者端沒有任何補償通知或提示「LINE 沒收到，但站內有」。

**影響**：LINE 推播的失敗是完全靜默的，只能靠使用者回報「沒收到通知」來間接發現問題。
