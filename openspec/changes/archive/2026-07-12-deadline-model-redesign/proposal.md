## Why

四個排程情境（固定時段／候選時段投票／候選日期投票／候選日期+時段投票）目前共用一個單一的 `deadline` 欄位，語意在四個情境裡各自被拿來當不同的東西用：情境三／四另外用伺服器算出的 `vote_deadline_at`（錨定在最早候選日）當招募截止，卻讓 `joinActivity` 自己拿舊的 `deadline_at` 做另一套獨立、不同步的報名截止判斷，導致「畫面顯示揪團中、報名卻被拒絕」。追查後進一步發現，四個情境在「決策緩衝期逾期未確認」「提早達標時的狀態轉換」兩件事上做法互相不一致：只有情境二有逾期自動取消的安全網（而且觸發欄位本身就用錯了），情境一／三／四完全沒有；提早達標時只有情境三／四正確轉入決策緩衝狀態，情境一停在原狀態、情境二整個被排除在外。同時，情境一（免投票）到期會直接自動 `confirmed`，`decideFormationOutcome` 在候選時段全員一致時也會自動 `confirmed`——這代表活動有可能在建立者完全不知情的狀況下自動成團。

這次要把 `deadline_at`／`vote_deadline_at` 兩個欄位的語意在四個情境裡統一成同一套公式，修掉上述所有不一致，並移除所有會讓活動在建立者不知情下自動成團的路徑。

## What Changes

- **BREAKING**：`POST /activities` 的 `deadline` 欄位語意反轉。現在 `deadline` 直接寫入 `deadline_at`（決策硬截止）；改成 `deadline` 代表建立者選擇的報名截止時間，寫入 `vote_deadline_at`。`deadline_at`（決策硬截止天花板）改成完全由伺服器依情境公式計算，不再接受用戶端輸入：情境 A＝活動本身開始時間；情境 B（range 模式）＝`fixed_date` + `time_window_start`；情境 C（`find_date`）＝所有候選日中最晚一天 + 統一開始時間；情境 D（`find_date_time`）＝所有候選時段中最晚一個的開始時間。
- 建立活動時新增驗證：客戶端送出的 `deadline`（即將成為 `vote_deadline_at`）必須早於伺服器算出的 `deadline_at` 天花板，且 `deadline_at` 天花板本身必須晚於目前時間；任一條件不成立則拒絕建立。
- 情境一（固定時段，`requires_voting=false`）新增 `vote_deadline_at` 欄位——目前完全沒有這個欄位。
- `getActivity` 的 lazy status check：招募截止判斷（`recruitingDeadline`）統一改用 `vote_deadline_at`，四個情境一致（目前只有 C／D 用 `vote_deadline_at`，A／B 用 `deadline_at`）。
- 移除所有自動 `confirmed` 的路徑：情境一 `!requires_voting` 到期直接 `confirmed` 的分支、`decideFormationOutcome`／`getLeaderSlots` 全員一致自動 `confirmed` 的邏輯，兩者都改成一律轉入 `voting`（決策緩衝狀態），等待建立者呼叫 `confirmFormation` 手動確認。`decideFormationOutcome`／`getLeaderSlots` 移除後恆定回傳同一結果，直接刪除這兩個函式。
- 新增涵蓋四個情境的統一 lazy check：`voting` 狀態下 `deadline_at` 已到期、建立者仍未確認 → 自動轉為 `cancelled`，並通知建立者與所有已報名參與者。取代現有只覆蓋情境二（range 模式）、且觸發欄位用錯（誤用 `vote_deadline_at`）的區塊。
- 統一提早達標（`participant_target` 提前滿額）時的行為到四個情境：一律轉入 `voting`（決策緩衝狀態）並通知建立者。目前情境一提早達標時停留在 `recruiting` 不轉狀態，情境二（range 模式）整個被排除在判斷式外、連通知都沒有。
- `confirmFormation` 新增檢查：建立者選定要確認的候選時段/時段起點若已經是過去式，拒絕確認（四個情境皆適用）。
- `confirmFormation` 情境一（`!requiresVoting`）分支的狀態檢查放寬，接受 `recruiting` 與 `voting` 兩種狀態（目前只接受 `recruiting`）——因為情境一之後也會在到期未確認時轉入 `voting`，若不放寬，一旦情境一活動進入 `voting`，建立者將完全無法呼叫 `confirmFormation`，會直接卡死走向自動取消。
- `joinActivity` 的報名截止檢查（目前誤用 `deadline_at`）改用 `vote_deadline_at`，跟 `getActivity` 的招募截止判斷邏輯保持一致。

## Non-Goals

- 「`vote_deadline_at` 到期時人數未達標，通知建立者要不要手動成團」這個新通知情境不在這次 change 範圍內，屬於另一位組員的通知功能工作。所有既有的「通知建立者」「通知建立者和報名者」動作，一律沿用現有的 `tx.notification.create`／`createMany` 呼叫模式與既有型別（`time_to_pick`／`activity_cancelled`／`activity_confirmed`），不新增通知型別或機制。
- 前端 `EventPage.vue`、`ActivityDetailModal.vue`、`AvailabilityPickerModal.vue` 的對應調整（三行常駐顯示、智慧預設演算法、過期候選時段灰階呈現等）不在這份後端 change 範圍內，會在 `BuJo` repo 另開對應的前端 change。
- 報名截止後把活動卡片隱藏給非報名者／非建立者的存取限制功能，是另一個獨立計畫，不在這份 change 範圍內。
- 不改變 `confirmFormation` 現有的候選時段選擇邏輯本身（情境三可任選候選時段、情境四從交集運算窄窗口挑選等），只新增「已過期時段不可確認」這一項檢查。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `activity-deadline-validation`：`deadline` 欄位的驗證對象從「必須是未來的 `deadline_at`」改成「必須早於伺服器計算出的 `deadline_at` 天花板、且該天花板本身必須晚於目前時間」；新增情境一 `vote_deadline_at` 欄位、四情境天花板公式的規範。
- `activity-formation-confirmation`：新增「`confirmFormation` 拒絕已過去的候選時段」需求；修改「提早達標不自動成團」需求中情境一與情境二（range 模式）的狀態轉換行為（從維持原狀態／完全不處理，改成統一轉入 `voting` 並通知建立者）；新增「四情境統一的決策緩衝期逾期自動取消」需求（觸發依據為 `deadline_at`），取代原本只涵蓋情境二、且觸發欄位用 `vote_deadline_at` 的行為。
- `scenario-b-availability-reporting`：既有「Vote deadline auto-cancellation」需求（情境二專屬、觸發依據 `vote_deadline_at`）移除，由 `activity-formation-confirmation` 新增的四情境統一需求取代；「Zero-submission cancellation without a participant cap」與「Join rejects activities past their deadline」兩項需求的觸發依據從 `deadline_at` 改成 `vote_deadline_at`，對應招募截止判斷統一改用 `vote_deadline_at` 的變更。
- `scenario-d-availability-picker-api`：既有「Scenario D vote deadline anchored to latest candidate slot」需求描述的「`vote_deadline_at` 錨定最晚候選時段、`deadline_at` 錨定最早候選時段」語意整個反轉——新模型下 `deadline_at`（天花板）才是錨定最晚候選時段的那個欄位，`vote_deadline_at`（報名截止）改成從 `deadline_at` 往前推建立者選擇的量。

## Impact

- Affected specs：`activity-deadline-validation`、`activity-formation-confirmation`、`scenario-b-availability-reporting`、`scenario-d-availability-picker-api`
- Affected code：
  - Modified：`src/controllers/activityController.js`（`createActivity`、`getActivity`、`joinActivity`、`confirmFormation`；移除 `decideFormationOutcome`、`getLeaderSlots`）
  - Modified：`API_DOCS.md`（`POST /activities` 的 `deadline` 欄位語意說明、四情境 `deadline_at`/`vote_deadline_at` 計算公式）
