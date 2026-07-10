## Problem

創建活動時，`deadline_at` 完全信任前端算好的值，後端不驗證它是否還在未來。實測發現：情境二（日期固定・時間讓大家選）用預設「提前 1 天」建立活動時，算出的 `deadline_at` 常常在建立的當下就已經過期，導致活動第一次被查詢（lazy check）就直接被判定 `cancelled`，創建者完全來不及讓別人報名。

## Root Cause

「提前 N 天/小時」的計算是機械式地從活動日期／時間往回推（`活動日期 − N 天`，固定落在該日 00:00；或當天強制切成小時時，`錨點時間 − N 小時`），從未檢查算出來的結果是否還在「現在」之後。只要創建者的建立時間點晚於回推出來的時間點（活動日期越近、或當天/隔天建立時特別容易發生），`deadline_at` 就會帶著一個已經過去的時間被建立出來。這不是單一情境的問題——四個情境（a/b/c/d）建立活動都共用同一套「流團設定」與 `deadline` 傳遞機制。

實際案例（本地 dev 資料庫）：
- 情境二活動 A：`fixed_date=2026-07-10`，預設「提前 1 天」→ `deadline_at=2026-07-09 00:00`；建立於 2026-07-09 晚間，建立當下即已過期
- 情境二活動 B：`fixed_date=2026-07-09`（當天建立），因 `time_window_start` 為當天 00:00、「提前 1 小時」→ `deadline_at=2026-07-08 23:00`，建立當下即已過期

## Proposed Solution

在 `createActivity` 新增伺服器端驗證：若 `new Date(deadline) <= now`，回傳 400 並提示創建者調整流團設定或活動時間，不寫入任何資料。這是防止繞過前端驗證、確保資料完整性的最後一道防線；對應的前端防呆在 `BuJo` repo 同名 change 處理。

## Non-Goals

- 不改變「提前 N 天/小時」本身的計算公式或預設值（沿用現行機制，這次只加「結果必須在未來」的驗證關卡）
- 不牽動情境二這次重寫的 range 模式邏輯本身，這是四情境共用的既有缺陷，獨立於 `scenario-b-availability-redesign` 之外處理

## Capabilities

### Modified Capabilities

無。

### New Capabilities

- `activity-deadline-validation`：建立活動時，系統驗證流團時間（`deadline_at`）必須晚於當下時間，否則拒絕建立並提示創建者調整。

## Impact

- Affected code:
  - Modified: `src/controllers/activityController.js`（`createActivity`，四個情境分支共用同一個驗證點）
- 不需要 schema migration
