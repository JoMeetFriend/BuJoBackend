## Why

`decision-view-ux-redesign` 讓非建立者（已報名的參與者）也能在決選階段（`voting`）看到完整的 `decision_candidates`——所有候選時段的完整支持度排名與每個人的頭像。實際上線測試後發現這帶來兩個問題：(1) 資訊量對只能旁觀、不能投票的參與者來說過大；(2) 這是資料揭露層級的問題，不只是前端要不要渲染——回應本身就整包含有所有人的投票明細，開發者工具打開就看得到全部，不是真正的資料隔離。這次把 `decision_candidates` 限定成只有建立者的回應才附上，改成讓參與者在自己已經選過的候選時段/時間旁邊，看到「跟自己時間有重疊的其他真人參與者」（`co_participants`），把資訊範圍從「全部聚合資料」收斂成「跟我有關的」。

## What Changes

- **BREAKING**：`GET /api/activities/:id` 的 `decision_candidates`，非建立者在 `recruiting`（投票制）或 `voting` 狀態下的回應改成 `null`；只有 `is_creator: true` 的回應才附上完整排名（維持現有格式與行為不變）
- 情境二（range 模式）：`my_ranges[]` 每筆新增 `co_participants: [{user_id, display_name, avatar_url}]`——跟這段自己送出的 range 有時間重疊的其他真人參與者（不含建立者、不含自己）
- 情境三（find_date）：`candidate_slots[]` 每筆（`is_selected === true` 時）新增 `co_participants`——同一天（同一個候選時段）的其他真人參與者（不含建立者、不含自己）；未選的候選時段一律回空陣列
- 情境四（find_date_time）：`candidate_slots[]` 每筆（`is_selected === true` 時）新增 `co_participants`——用既有的子區間交集運算（`computeSlotOverlapRanking`）算出的 segments，篩出跟自己的子區間（或整個候選時段，若自己沒填子區間）有時間重疊的 segment，聯集這些 segment 的 supporters 後扣掉自己；未選的候選時段一律回空陣列
- 移除 `scenario-b-availability-reporting` 規格裡一則過時、跟目前程式碼行為矛盾的既有需求文字「Creator is treated as always available」（這條在更早的幽靈投票修復裡程式碼行為已經改了，但規格文字沒有同步移除，這次順手清掉，避免跟緊鄰的「Overlap ranking computation」需求互相矛盾）

## Non-Goals

- 不改建立者視角的任何行為——建立者仍然拿到完整、不受這次改動影響的 `decision_candidates`
- 不改情境一（`fixed`，免投票）——這個情境本來就沒有 `decision_candidates`，不受影響
- 不改前端渲染邏輯——前端消費新格式的部分在 `BuJo` repo 開對應的 change 處理
- `co_participants` 的顆粒度統一用「時間有實際重疊」判斷（情境三因為候選時段本身就是整天、沒有子區間，顆粒度自然等同於「同一天」），不做「只要同一個候選時段就算」的粗顆粒版本

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `activity-formation-confirmation`：新增「`decision_candidates` 只回傳給建立者」的需求
- `scenario-b-availability-reporting`：`my_ranges[]` 新增 `co_participants` 欄位；移除過時的「建立者視為永遠有空」需求
- `scenario-c-date-picker-api`：`candidate_slots[]` 新增 `co_participants` 欄位（同一天顆粒度）
- `scenario-d-availability-picker-api`：`candidate_slots[]` 新增 `co_participants` 欄位（子區間重疊顆粒度）

## Impact

- Affected specs: `activity-formation-confirmation`, `scenario-b-availability-reporting`, `scenario-c-date-picker-api`, `scenario-d-availability-picker-api`
- Affected code:
  - Modified: src/controllers/activityController.js
  - Modified: API_DOCS.md
