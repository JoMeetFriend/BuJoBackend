## Why

活動生命週期通知（進入決選、成團確認、活動取消）目前只寫入站內通知，繞過了既有的 LINE 推播管線，使用者不打開 App 就不會知道活動狀態變化。同時「人數達標」情境誤用 `time_to_pick` 型別，通知文案「候選時段票數不相上下，請選擇最終時段」與實際情境不符；語意正確的 `formation_ready` 型別（文案「人數已滿，請確認成團」）已定義卻從未被觸發。

## What Changes

- 人數達標時通知建立者的站內通知型別由 `time_to_pick` 改為 `formation_ready`；招募截止進入決選期的通知維持 `time_to_pick` 不變
- 四種活動生命週期通知（`formation_ready`、`time_to_pick`、`activity_confirmed`、`activity_cancelled`）在站內通知建立後補發 LINE 推播，沿用既有的推播資格檢查（LINE 綁定、通知偏好）與錯誤吞噬行為
- LINE 推播一律在資料庫交易提交成功後才發送；樂觀鎖競爭失敗的請求不發送推播，避免重複通知
- LINE 推播文案與站內通知文案一致（重用同一組活動通知文案）

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `line-push-notifications`: 新增活動生命週期四種通知型別（formation_ready、time_to_pick、activity_confirmed、activity_cancelled）的 LINE 推播要求與文案
- `activity-formation-confirmation`: 人數達標通知建立者的通知由「與票數不相上下情境相同的通知」改為專屬的 formation_ready 通知

## Impact

- Affected specs: `line-push-notifications`、`activity-formation-confirmation`
- Affected code:
  - New: (none)
  - Modified:
    - src/services/notificationService.js
    - src/controllers/activityController.js
    - src/__tests__/notificationService.test.js
    - src/__tests__/activityStateMachine.test.js
    - src/__tests__/scenarioBRange.test.js
    - API_DOCS.md
  - Removed: (none)
