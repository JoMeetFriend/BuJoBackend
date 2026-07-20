## Context

`activityController.js` 裡的 `formatCard`（組出活動卡片給前端顯示，內含候選時段的 `time` 欄位）跟 `parseDateTime`（把前端送來的時間字串解析回 `Date` 物件）目前都用「上午/下午 H:MM」格式。實作時發現後端其實**已經有** `formatHHMM(date)` 這個既有函式（原本就用在情境二 `time_window_start`/`time_window_end` 的輸出，輸出格式就是零填充 24 小時制 `HH:MM`）——代表這個格式在後端本來就不是全新的東西，只是沒有套用到 `formatCard` 顯示候選時段的地方。前端（`BuJo` repo 的對應 change）要把時間字串格式改成 24 小時制零填充格式，這份 change 負責後端這一側的對應調整。

## Goals / Non-Goals

**Goals:**

- 後端輸出候選時段時間（`formatCard` 裡的 `time` 欄位）改成用既有的 `formatHHMM` 零填充 24 小時制格式，跟情境二的 `time_window_start`/`time_window_end` 用同一個函式，不要新增第二個功能重複的格式化函式
- 後端輸入解析（`parseDateTime`）過渡期同時接受舊格式與新格式，讓前後端不需要同一秒切換部署
- 新格式的輸出（`formatHHMM`）與輸入解析（`parseDateTime` 新格式分支）要能互相 round-trip

**Non-Goals:**

- 不涵蓋前端實作（見 `BuJo` repo 的對應 change）
- 這次不移除舊格式解析分支（列為 Open Question，安排下一個小改動處理）

## Decisions

### `formatCard` 顯示候選時段時間，改成呼叫既有的 `formatHHMM`，不新增函式

理由：實作前先搜尋既有程式碼，發現 `formatHHMM` 已經存在且輸出格式跟這次要的完全一樣（零填充 24 小時制 `HH:MM`），只是原本只用在情境二的時間窗顯示，候選時段的 `time` 欄位另外用了一個獨立的 `formatTime` 函式重複實作同樣的事。這次直接刪掉 `formatTime`，`formatCard` 改呼叫 `formatHHMM`，消除重複，不新增 `pad2` 或其他補零工具函式。

### `parseDateTime` 過渡期同時接受舊格式與新格式

理由：`parseDateTime` 解析的是前端建立活動時送出的 payload，這是真正的協定，前後端如果同一秒切換部署，中間任何時間差都會讓活動建立失敗。改成「先接受兩種格式」讓部署順序可以錯開：這份 change 先上線（後端雙格式相容）→ `BuJo` 的對應 change 再上線（前端切換成只送新格式）→ 之後再排一個小改動移除舊格式分支。

判斷順序：先嘗試新格式的正規表達式（`/^(\d{2}):(\d{2})$/`），沒有 match 才 fallback 到舊格式（`/^(上午|下午)\s+(\d+):(\d+)$/`）。這個新格式正規表達式刻意跟 `formatHHMM` 輸出的樣式（兩位數:兩位數）對齊，確保 round-trip 一致。

## Implementation Contract

**Behavior**：後端回傳給前端顯示的活動時間（候選時段 `time` 欄位、情境二時間窗）一律是 `HH:MM` 24 小時制零填充格式；後端能同時解析前端送來的舊格式（`上午/下午 H:MM`）與新格式（`HH:MM`）兩種時間字串，兩者解析出的 `Date` 物件在同一小時輸入下完全相同。

**Interface / data shape**：
- `formatHHMM(date: Date): string`（既有函式，不變動簽章）— 回傳 `HH:MM`（例如 `09:00`、`23:00`），`formatCard` 新增呼叫這個函式取代已刪除的 `formatTime`
- `parseDateTime(dateStr: string, timeStr: string): Date` — `timeStr` 可以是 `HH:MM` 或 `上午/下午 H:MM` 任一格式，皆能正確解析

**Failure modes**：`timeStr` 不符任何一種格式時，`parseDateTime` 維持現有行為（回傳只設定日期、未設定時分的 `Date`，不拋例外）——這次不改變錯誤處理策略。

**Acceptance criteria**：
- `formatHHMM(hour=9 的 Date) === '09:00'`、`formatHHMM(hour=23 的 Date) === '23:00'`（既有行為，不用新增測試，但候選時段顯示要新增測試確認改呼叫這個函式後輸出正確）
- `parseDateTime('2026/08/01', '上午 9:00')` 與 `parseDateTime('2026/08/01', '09:00')` 解析出的 `Date` 小時數字相同
- 既有的 `activityStateMachine.test.js`、`scenarioBRange.test.js` 測試案例更新字面值後全數通過

**Scope boundaries**：範圍限定在 `activityController.js` 裡 `formatCard`（候選時段顯示）跟 `parseDateTime`；不新增獨立的格式化工具函式；不包含前端（見 `BuJo` 對應 change）、不包含任何情境判斷邏輯、資料庫欄位、API 端點路徑或參數名稱的變動。

## Risks / Trade-offs

- [Risk] 舊格式解析分支如果忘記清除，會變成永久技術債 → Mitigation：在 Open Questions 中明確記錄，作為下一個小改動的待辦
- [Risk] `formatHHMM` 輸出格式跟 `parseDateTime` 新格式解析規則如果不同步，會造成前端顯示的字串自己都解析不回來 → Mitigation：用同一個 acceptance criteria 測試（`formatHHMM` 輸出的字串要能被 `parseDateTime` 新格式分支解析回相同小時數字）

## Migration Plan

1. 這份 change 先部署：`parseDateTime` 支援雙格式，`formatCard` 改呼叫既有 `formatHHMM`
2. 確認上線後，通知/協調 `BuJo` repo 的對應 change 可以開始部署前端切換
3. 前端確認上線穩定後，安排後續小改動移除本次新增的舊格式解析分支（不在這次任務範圍內）

Rollback：只回退這份 change 本身不影響前端（前端在這份 change 上線前都還在送舊格式，後端舊格式分支持續有效）；如果前端已經切換上線後才需要回退後端，需要協調前端一起回退，避免後端變回只認舊格式導致新前端送出的新格式解析失敗。

## Open Questions

- 舊格式解析分支要保留多久、由誰／何時排入下一個改動移除——這次不處理，只在這裡記錄成待辦
