## Context

情境二（日期固定・時間讓大家選）目前用 `ActivityCandidateSlot` + `ActivityAvailability` 實作成「創建者手動列出候選時段、參與者勾選投票」的模式。這跟原始規劃文件（`揪團活動流程設計.html`、`Mode-BCD-設計決策.md`）描述的「參與者自由回報連續可用時間、系統動態算重疊」完全不同，文件的做法從未被實作，兩份文件已與現況脫節。

這次要把情境二換成「參與者自由回報可用時間，系統計算重疊排序」。情境一（全固定）、情境三（候選日期・時間固定）、情境四（候選日期・各自時段）這次不動，但情境三、四未來也會做同樣方向的改造，這次的資料表設計需要預留給它們共用。

## Goals / Non-Goals

**Goals:**

- 情境二參與者可自由回報一段或多段可用時間，不受限於創建者預先列出的候選選項
- 新資料表設計成情境三、四未來遷移時可直接共用，不需重挖
- 修正兩個既有缺陷：`vote_deadline_at` 逾時未實作、`POST /:id/join` 未檢查 `deadline_at`

**Non-Goals:**

- 不動情境一／三／四的既有勾選投票邏輯與資料表
- 不支援情境二的多天固定日期範圍（例如多天露營），僅支援單一固定日期
- 不開放創建者自訂重疊排序的切格間隔（固定 60 分鐘）
- 不做 `listActivities`（列表頁）的 lazy check 補強——這是全系統既有缺陷，非情境二專屬，建議另開獨立 change 處理
- 不把 `ActivityAvailability`（舊的勾選投票 join 表）整個移除——要等情境三、四都遷移完成才有意義

## Decisions

### 新增 ActivityAvailabilityRange 表，不重用既有的 ActivityCandidateSlot／ActivityAvailability

新增 `ActivityAvailabilityRange(activity_id, user_id, range_start, range_end)`，一人可多筆。命名不綁定情境二，情境三／四未來遷移時共用同一張表（情境三的「勾選哪幾天」可視為每天套用固定時段的一筆 range；情境四的「選日期＋填時間」直接就是一筆 range）。

考慮過的替代方案：讓參與者自己生成一筆屬於自己的 `ActivityCandidateSlot`，透過 `ActivityAvailability` 掛勾。放棄理由：`ActivityCandidateSlot`／`ActivityAvailability` 的 join 語意是「多人共用同一個候選選項、count 有意義」，參與者各自生成專屬 slot 後這個 count 語意會失效，且完全不會省下重寫重疊演算法的成本，只是把同樣的問題換一個地方發生。

### `ActivitySchedule` 新增 `availability_mode` 區分 slot／range 模式

新增 enum `AvailabilityMode { slot, range }`，情境二寫入 `range`，其他情境維持 `slot`。同時新增 `fixed_date`、`time_window_start`、`time_window_end`、`vote_deadline_at` 四個欄位，皆為情境二使用；`time_window_start/end` 選填，不設 = 全天皆可（降低創建者的決策負擔，參與者填時間時會自然避開不合理時段，不需要系統強制擋）。

### `confirmed_slot_id` 沿用既有機制，只在確認成團時才建立 `ActivityCandidateSlot`

情境二建立活動時不產生任何 `ActivityCandidateSlot`。創建者最終確認成團時，才為選定的那一格時間臨時建立一筆 `ActivityCandidateSlot`，寫入 `ActivitySchedule.confirmed_slot_id`——用法與現行情境一（永遠只有一筆、從不投票）一致。好處是 `formatCard()`、通知邏輯完全不用改，因為它們讀的都是 `schedule.confirmedSlot` 關聯，不管這筆 row 是何時建立的。

### 重疊排序演算法：固定基準範圍切 60 分鐘一格，分 Section 1／2 顯示

基準範圍＝`fixed_date` 當天的 `time_window_start`～`time_window_end`（沒設就是 00:00–23:59），切成 60 分鐘一格（沿用原規劃文件的預設值）。每格檢查 `range.start ≤ 格.end AND range.end ≥ 格.start` 判定重疊，創建者永遠算「有空」不需要真實資料列。依人數排序、同分依時間先後排序，分 Section 1「完全符合」（人數=總報名人數，全部顯示）與 Section 2「最多人有空」（前 3，排除 Section 1）。即時計算、不存資料庫。

### `GET /:id` 的 `decision_candidates` 回傳格式：range 模式改回傳 `{perfect_overlap, partial_overlap}`

現行 `decision_candidates` 對 slot 模式（情境一/三/四）是一個扁平陣列（`getLeaderSlots()` 只回傳最高票那組）。range 模式因為要區分 Section 1／2，改回傳物件：

```json
{
  "decision_candidates": {
    "perfect_overlap": [{ "id": "temp-<slot_start_iso>", "slot_start": "...", "slot_end": "...", "count": 3 }],
    "partial_overlap": [{ "id": "temp-<slot_start_iso>", "slot_start": "...", "slot_end": "...", "count": 2 }]
  }
}
```

`id` 欄位不是真實的 `ActivityCandidateSlot.id`（這些候選格是即時計算、不存資料庫），改用 `temp-` 前綴加上 `slot_start` 的 ISO 字串當作前端 `:key` 與選取用的識別碼；創建者選定後，`confirm-formation` 改用 `{ slotStart, slotEnd }`（而非 `candidateSlotId`）指定要確認的格子，後端再據此建立真正的 `ActivityCandidateSlot`。前端需依 `activity.availability_mode` 判斷 `decision_candidates` 是陣列（slot 模式）還是 `{perfect_overlap, partial_overlap}` 物件（range 模式）。

### `vote_deadline_at` 逾時自動取消（新增，原文件規劃但從未實作）

進入 `voting` 狀態後，若 `vote_deadline_at` 已到、創建者仍未確認任何時段 → lazy check 自動轉為 `cancelled`。計算規則：`fixed_date` 當天的 `time_window_start`（沒設時段範圍就是當天 00:00）。

### 情境二零提交自動取消（新增，修正既有缺陷）

現行 lazy check 邏輯在 `participant_target` 為 `null`（不限人數）時，`deadline_at` 到期會跳過「人數不足」判斷，不論實際有沒有人回應都直接進入配對流程。這次針對情境二補上：`deadline_at < now && 未設 participant_target && 已報名者（不含創建者）中沒有任何人提交過 ActivityAvailabilityRange` → 直接 `cancelled`。此修正僅套用於情境二，情境一／三／四維持現行行為不變。

### `joinActivity` 補上 `deadline_at` 檢查（全情境適用的安全修正）

現行 `POST /:id/join` 完全不檢查 `deadline_at`，只看 `status` 欄位是否為 `recruiting`——若還沒有人打開過該活動詳情頁觸發 lazy check，理論上仍可報名已過期的活動。四個情境皆適用此修正，不改變 a/c/d 原有的其他行為。

### `deadline_at` 錨點沿用現行機制，不改回規劃文件的自動公式

規劃文件描述 `deadline_at` 應自動計算（`window_start` 今天 → −1 小時；非今天 → 前一天同時間），但現行實作是創建者自選「提前 N 天/小時」（四個情境共用的元件）。這次維持現行機制不變，只調整情境二計算錨點的來源：從「候選時段裡最早的開始時間」改為「`fixed_date` + `time_window_start`（沒設就是當天最早）」。不改回文件公式的理由：現行機制已上線且更符合實際使用彈性，且屬於四情境共用元件，改動範圍會超出這次的情境二範圍。

## Risks / Trade-offs

- [風險：情境二不再產生 `ActivityCandidateSlot`，`GET /activities` 列表卡片渲染邏輯（`formatCard()`）在活動尚未成團時可能沒有可顯示的候選時段] → 緩解：`formatCard()` 對 `requires_voting=true` 的活動本來就顯示「投票中」文字而非實際時段，情境二切換後行為不變，已在既有邏輯覆蓋範圍內
- [風險：`ActivityAvailabilityRange` 與舊的 `ActivityAvailability` 並存，未來維護者可能混淆兩者用途] → 緩解：透過 `availability_mode` 欄位明確區分，並在 code comment 註明「情境二專用，情境一/三/四請見 ActivityAvailability」
- [風險：`joinActivity` 補上 `deadline_at` 檢查屬於全情境行為變更，可能有既有測試假設「過期活動仍可報名」] → 緩解：實作時先跑一次既有測試套件確認無隱性依賴，若有需一併更新該測試案例

## Migration Plan

1. `prisma migrate dev` 新增 `ActivityAvailabilityRange` 表、`AvailabilityMode` enum、`ActivitySchedule` 四個新欄位（皆為選填或有預設值，不影響既有資料）
2. 部署後端（新舊邏輯以 `availability_mode` 分流，不影響情境一/三/四既有活動）
3. 部署前端（`BuJo` repo 同名 change）
4. 無需回填既有資料——新欄位僅影響情境二「之後新建」的活動，既有情境二活動維持舊有勾選制直到自然結束（`recruiting`/`voting` 走完既有流程）

## Open Questions

（無——本次討論已涵蓋所有已知邊界情況；情境三、四的遷移細節留待各自的 change 處理）
