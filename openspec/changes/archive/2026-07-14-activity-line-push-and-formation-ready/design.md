## Context

站內通知與 LINE 推播目前是兩條不對稱的路徑：好友邀請與活動建立走 `notificationService` 的完整管線（站內通知 + `deliverLineNotification` 推播，含 LINE 綁定檢查、`notification_preferences` 偏好檢查、錯誤吞噬），而活動生命週期通知（進入決選、成團、取消）是在 `activityController` 的 Prisma 交易內直接以 `tx.notification.create` / `tx.notification.createMany` 寫入，完全沒有 LINE 推播。

另外 `NOTIFICATION_TYPES.FORMATION_READY` 已有型別定義與站內顯示文案「「{活動標題}」人數已滿，請確認成團」，但沒有任何觸發點；「人數達標」情境目前發的是 `time_to_pick`，其文案描述的是票數僵局，與人數達標語意不符。

## Goals / Non-Goals

**Goals:**

- 活動生命週期四種通知（`formation_ready`、`time_to_pick`、`activity_confirmed`、`activity_cancelled`）在站內通知之外補發 LINE 推播
- 人數達標情境改發語意正確的 `formation_ready` 通知
- LINE 推播失敗不影響 API 回應與站內通知的建立

**Non-Goals:**

- 不做排程機制：截止時間類通知維持 lazy 觸發（有人查詢活動時判定），`notification_jobs` 資料表維持閒置
- 不做退出報名（cancelJoin）通知建立者
- 不做通知偏好設定 API（`notification_preferences` 資料表已被推播管線讀取，但使用者設定介面不在本次範圍）
- 不改動好友邀請與活動建立這三種既有推播的行為

## Decisions

### 人數達標改發 formation_ready，截止進決選維持 time_to_pick

`joinActivity` 中人數達到 `participant_target` 時，通知型別由 `time_to_pick` 改為 `NOTIFICATION_TYPES.FORMATION_READY`。招募截止進入決選期（lazy 狀態轉換）維持 `time_to_pick`，因為該情境確實是「需要建立者去決選時段」。替代方案是刪除 `formation_ready` 死碼、統一用 `time_to_pick`，但文案與情境不符，且型別、文案、格式化測試都已存在，啟用成本低。

### 擴充 buildActivityLineMessage 支援型別參數，文案與站內通知共用

`notificationService` 的 `buildActivityLineMessage` 增加 `type` 參數，重用既有 `buildActivityMessage` 的文案產生邏輯，確保 LINE 與站內文案一致。替代方案是為 LINE 另寫一組文案，但兩組文案會漂移，且現有文案已足夠。

### 新增 sendActivityLifecycleLineNotifications 批次推播函式

`notificationService` 新增 export：`sendActivityLifecycleLineNotifications({ userIds, activityId, type }, db)`，比照 `notifyFriendsActivityCreated` 的既有模式——共用一個 lazy 建立的文案 promise，`Promise.all` 對每個 userId 呼叫 `deliverLineNotification`。直接重用 `deliverLineNotification` 的資格檢查（LINE 綁定、偏好）與錯誤吞噬，不另造管線。

### LINE 推播在交易提交後發送，樂觀鎖敗者不推播

`activityController` 各狀態轉換點的推播一律放在 Prisma 交易 commit 之後（`won === true` 或交易正常返回後）才呼叫,不在交易內做外部 HTTP。lazy 轉換與 confirmFormation、cancelActivity 已用 updateMany 樂觀鎖去重，只有搶到轉換的請求建立站內通知，推播跟隨同一分支，天然避免重複推播。替代方案是在交易內發推播，但外部呼叫會拉長交易、且 rollback 時推播無法收回。

## Implementation Contract

**行為：**

- 使用者（已綁定 LINE 且未關閉該型別偏好）在以下事件發生時收到一則 LINE 文字推播，文案與站內通知相同：
  - 人數達標 → 建立者收到「「{活動標題}」人數已滿，請確認成團」（`formation_ready`）
  - 招募截止進入決選期 → 建立者收到「「{活動標題}」候選時段票數不相上下，請選擇最終時段」（`time_to_pick`）
  - 建立者確認成團 → 其他參與者收到「「{活動標題}」已確認成團」（`activity_confirmed`）
  - 活動取消（手動取消、截止未達標、決選期逾期）→ 參與者收到「「{活動標題}」已取消」（`activity_cancelled`）
- 未綁定 LINE 或偏好關閉的使用者只收站內通知，不推播
- 站內通知的建立行為除「人數達標型別改為 formation_ready」外全部不變

**介面：**

- `notificationService.js` 新增 export `sendActivityLifecycleLineNotifications({ userIds, activityId, type }, db = prisma)`，回傳各使用者的送達結果陣列；`userIds` 為空陣列時不做任何事
- `buildActivityLineMessage({ activityId, type }, db)` 依 `type` 回傳對應文案；未知型別 fallback 為既有的活動建立文案

**失敗模式：**

- LINE 推播失敗（無綁定、偏好關閉、HTTP 錯誤、例外）一律靜默：`deliverLineNotification` 回傳 `{ status: "skipped" | "failed", reason }`，不外拋、不影響 API 回應狀態碼與站內通知
- 樂觀鎖競爭失敗（`won === false`）的請求不建立站內通知也不推播

**驗收標準：**

- `npx cross-env NODE_OPTIONS=--experimental-vm-modules jest` 全套通過
- `notificationService.test.js`：涵蓋 `buildActivityLineMessage` 四種型別文案、`sendActivityLifecycleLineNotifications` 的送達／未綁定略過／偏好關閉略過、`sendLinePushMessage` 拋錯時仍正常返回
- `activityStateMachine.test.js` 與 `scenarioBRange.test.js`：人數達標情境斷言通知型別為 `formation_ready`；截止進決選斷言維持 `time_to_pick`
- 控制器層測試斷言：狀態轉換成功後有呼叫 LINE 推播、樂觀鎖敗者分支未呼叫

**範圍邊界：**

- In scope：`src/services/notificationService.js`、`src/controllers/activityController.js` 的推播接線與型別修正、對應測試、`API_DOCS.md` 通知型別說明、兩份 spec delta
- Out of scope：排程／cron、`notification_jobs` 表、通知偏好 API、好友與活動建立推播路徑、前端

## Risks / Trade-offs

- [lazy 轉換發生在 GET 請求路徑，推播的外部 HTTP 會拉長該次 GET 的回應時間] → 推播在交易外以 `Promise.all` 並行送出，且 LINE API 單次呼叫延遲可接受；若未來成為瓶頸再改為 fire-and-forget 或排程
- [同一活動多個參與者的推播其中一人失敗] → `deliverLineNotification` 個別吞錯，不影響其他人送達
- [文案共用後，站內文案調整會同步改變 LINE 推播文案] → 這是刻意設計（單一事實來源），spec 中文案以站內文案為準
