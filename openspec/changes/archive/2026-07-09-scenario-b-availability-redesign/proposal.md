## Why

情境二（日期已固定，時間讓大家選）目前用「創建者手動列出候選時段、參與者勾選投票」的方式運作，跟參與者實際想表達「我這幾段時間有空」的需求不符，也讓創建者要先幫大家想好選項才能開活動。同時，重寫這段流程時發現既有的 `POST /:id/join` 完全沒有檢查 `deadline_at`，理論上可以報名到已過期的活動，一併修正。對應的前端改動在 `BuJo` repo 的同名 change。

## What Changes

- 情境二報名方式從「勾選候選時段」改為「參與者自由回報可用時間範圍」（可回報多段）
- 新增 `ActivityAvailabilityRange` 資料表，儲存參與者回報的時間範圍；情境一/三/四維持原本的 `ActivityCandidateSlot` + `ActivityAvailability` 勾選制不變
- `ActivitySchedule` 新增 `availability_mode`（`slot` / `range`）、`fixed_date`、`time_window_start`、`time_window_end`、`vote_deadline_at` 欄位
- 建立活動時，情境二不再產生 `ActivityCandidateSlot`；改成即時計算排序，只在創建者確認成團時才建立一筆代表最終選定時段的 `ActivityCandidateSlot`
- 新增重疊排序演算法：以 60 分鐘為間隔切候選格，計算重疊人數，分「完全符合」／「最多人有空（前 3）」兩區
- 新增 `vote_deadline_at` 逾時自動取消（創建者進入 voting 後逾期未選定時段）
- 新增情境二專屬的零提交自動取消判斷（沒設人數上限、`deadline_at` 到期、且沒有任何人提交過可用時間 → 自動取消）
- **BREAKING**：`POST /:id/join` 情境二的 body 從 `{candidateSlotIds}` 改為 `{ranges: [{start, end}]}`
- `POST /:id/join` 補上 `deadline_at` 檢查（四個情境皆適用）：已過期但尚未被 lazy check 轉換狀態的活動，报名會被拒絕

## Capabilities

### New Capabilities

- `scenario-b-availability-reporting`：情境二活動的參與者可自由回報一段或多段可用時間（限制在創建者設定的日期與選填時間窗口內），系統依回報結果計算重疊排序，供創建者選定最終成團時段。

## Impact

- Affected code:
  - Modified: `prisma/schema.prisma`, `src/controllers/activityController.js`
  - New: 情境二專屬的重疊排序輔助函數（併入 `src/controllers/activityController.js`，暫不拆檔）
- Affected specs: `scenario-b-availability-reporting`（新增）
- 資料庫需要一次 `prisma migrate dev` 新增 `ActivityAvailabilityRange` 表與 `ActivitySchedule` 新欄位
