## Context

`getActivity` 目前不分角色，只要 `currentStatus === 'voting' || (recruiting && requires_voting)` 就組出完整的 `decisionCandidates` 並附在回應裡，前端才依 `activity.is_creator` 決定要不要渲染成排名清單。這不是真正的資料隔離——回應本身已經含有所有候選時段的完整支持度與所有人的頭像，任何看得到這個活動的已報名參與者都能從網路回應裡讀到全部資料。

情境二／三／四各自已經有「回報之後的唯讀回顧區塊」：情境二的 `my_ranges[]`（`getJoinedAvailabilityRanges` 篩出來、只屬於目前使用者自己的 range）、情境三/四共用的 `candidate_slots[]`（每筆已經帶 `is_selected`／`my_range`，是目前使用者自己跟這個候選時段的關係）。這次要在這兩個既有結構上加一個新欄位 `co_participants`，而不是新開一個資料結構。

情境二／四的切格重疊運算（`computeRangeRanking`／`computeSlotOverlapRanking`）已經算出「每個時間片段被哪些真人參與者覆蓋」（`supporters`，已排除建立者），這次只是新增一個步驟：從這些已經算好的 segments 裡，篩出跟目前使用者自己的時間範圍有重疊的 segment，再聯集這些 segment 的 supporters、扣掉自己。情境三沒有子區間概念，直接篩 `candidate_slot_id` 相同的 availabilities 即可。

## Goals / Non-Goals

**Goals:**

- `decision_candidates` 只有建立者的回應才附上；非建立者的回應是 `null`
- 情境二／三／四的「自己已回報/已選」區塊（`my_ranges[]`／`candidate_slots[]`）各自新增 `co_participants`，只列出跟自己時間有重疊的其他真人參與者（不含建立者、不含自己）
- 情境三／四未選的候選時段，`co_participants` 一律是空陣列，不洩漏使用者沒選的時段裡有誰
- 清除 `scenario-b-availability-reporting` 規格裡過時、跟現行程式碼矛盾的「建立者視為永遠有空」需求文字

**Non-Goals:**

- 不改建立者視角的任何欄位或行為
- 不改情境一（`fixed`）
- 不改前端渲染（`BuJo` repo 對應 change 負責）
- 不新增 Prisma model／migration，純 controller 邏輯調整
- 不做「同一候選時段就算」的粗顆粒版本——一律用時間實際重疊判斷

## Decisions

### decision_candidates 只回傳給建立者

`getActivity` 組裝 `decisionCandidates` 的三個分支（isRangeMode／find_date_time／find_date 對應的 else）維持現有計算邏輯不變（仍然要完整算出來，因為非建立者的 `co_participants` 要從同一份計算結果裡篩選），只是在最後組裝回應物件時，依 `isCreator` 決定 `decision_candidates` 欄位要不要被替換成 `null`：

```js
activityResponsePayload.decision_candidates = isCreator ? decisionCandidates : null
```

### 共用 helper：從 segments 篩出跟我自己時間重疊的 supporters

情境二／四共用同一套「切格＋supporters」的資料形狀（`computeRangeRanking`／`computeSlotOverlapRanking` 回傳的陣列，每筆都有 `slot_start`／`slot_end`／`supporters`），新增一個共用 helper：

```js
// 從已經算好的 segments 裡，篩出跟 myStart~myEnd 有時間重疊的 segment，
// 把這些 segment 的 supporters 聯集起來、扣掉自己，作為「同時段的人」回傳給非建立者
function collectOverlappingCoParticipants(segments, myStart, myEnd, myUserId) {
  const seen = new Map()
  for (const seg of segments) {
    if (seg.slot_start >= myEnd || seg.slot_end <= myStart) continue
    for (const supporter of seg.supporters) {
      if (supporter.user_id === myUserId) continue
      seen.set(supporter.user_id, supporter)
    }
  }
  return [...seen.values()]
}
```

**情境二**：對 `my_ranges[]` 的每一筆（使用者自己送出的 range），呼叫 `collectOverlappingCoParticipants(decisionCandidates ?? computeRangeRanking(...), range.start, range.end, userId)`——但因為非建立者的回應現在 `decisionCandidates` 是 `null`，這裡要在賦值成 `null` **之前**先用內部算好的完整 segments 陣列來算 `co_participants`，不能等到已經清空之後才算。

**情境四**：對每個 `is_selected === true` 的 candidate slot，用該候選時段自己的 `segments`（`computeSlotOverlapRanking` 的輸出，已排除建立者）、以及使用者自己對這個 slot 的 `my_range`（沒有子區間時，視為整個候選時段的 `slot_start`~`slot_end`，跟 `computeSlotOverlapRanking` 內部「沒填子區間視為整個候選時段都覆蓋」的判斷規則一致），呼叫 `collectOverlappingCoParticipants`。

**情境三**：不需要這個 helper，候選時段本身沒有子區間，直接：

```js
const coParticipants = slot.is_selected
  ? excludeCreator(availabilities, activity.creator_id)
      .filter((a) => a.candidate_slot_id === slot.id && a.user_id !== userId)
      .map((a) => ({ user_id: a.user_id, display_name: ..., avatar_url: ... }))
  : []
```

### 清除過時的規格文字

`scenario-b-availability-reporting` 的「Creator is treated as always available」需求文字（宣稱系統會把建立者視為對每個候選格都有空）跟緊接在後面的「Overlap ranking computation」需求（明確排除建立者）互相矛盾，是先前幽靈投票修復時程式碼已經改掉、但規格文字沒有同步移除的殘留debt。這次一併用 REMOVED 移除，Migration 指向「Overlap ranking computation」需求（該需求已經完整描述現行行為）。

## Implementation Contract

**行為**：非建立者呼叫 `GET /api/activities/:id` 時，回應的 `decision_candidates` 一律是 `null`（不論情境）；情境二的 `my_ranges[]`、情境三/四的 `candidate_slots[]`（已選的項目）各自新增 `co_participants` 陣列，列出跟自己時間有重疊的其他真人參與者（不含建立者、不含自己）。建立者的回應完全不受影響。

**介面／資料形狀**：
- `decision_candidates`：非建立者一律 `null`；建立者維持現有格式不變
- `my_ranges[].co_participants` / `candidate_slots[].co_participants`：`[{user_id, display_name, avatar_url}]`；未選的 `candidate_slots[]` 項目一律是空陣列 `[]`

**失敗模式**：這次不新增任何新的錯誤分支或狀態碼，純粹是既有 `GET /api/activities/:id` 回應內容的調整。

**驗收標準**：
- 情境二／三／四各自新增整合測試，驗證非建立者的 `decision_candidates` 是 `null`
- 情境二／四新增測試，驗證用 design.md 既有的 Alice/Bob 交接情境範例（例如 Alice 9:00-10:00、Bob 10:00-11:00），驗證只有真正時間重疊的人才會出現在對方的 `co_participants` 裡，不重疊的人看不到彼此
- 情境三新增測試，驗證同一天選同一個候選時段的兩人互相看得到對方的 `co_participants`，選不同候選時段的人看不到彼此
- 情境三／四新增測試，驗證使用者沒選的候選時段 `co_participants` 是空陣列
- 建立者視角的既有測試（`decision_candidates` 完整格式）維持全數通過，不受影響
- `API_DOCS.md` 更新反映新的 `decision_candidates` 角色限定與 `co_participants` 欄位

**範圍邊界**：只改 `getActivity` 內 `decision_candidates`／`candidate_slots`／`my_ranges` 的組裝邏輯與新增的 helper 函式；不改 `confirmFormation`、`joinActivity`、`createActivity` 或任何寫入邏輯；不改情境一。

## Risks / Trade-offs

- **[Risk]** `co_participants` 計算依賴「先算完整 segments，再依角色決定要不要回傳完整版」，如果實作時不小心把「排除建立者」的既有計算跟「排除自己＋只回傳給非建立者」的新邏輯順序搞反，可能讓建立者也看到自己的 `co_participants` 或非建立者意外拿到完整 `decision_candidates` → **Mitigation**：新增的整合測試明確涵蓋建立者/非建立者兩種視角的回應差異，任何順序寫反都會讓測試失敗
- **[Risk]** 情境四「沒填子區間視為整個候選時段都覆蓋」這個 fallback 規則，`co_participants` 篩選時要跟 `computeSlotOverlapRanking` 內部用的規則保持一致，如果兩處各自維護一份判斷邏輯，未來其中一處改了容易讓兩者不同步 → **Mitigation**：`co_participants` 篩選時使用的「我的時間範圍」直接沿用 `computeSlotOverlapRanking` 呼叫前就已經算好的同一個 `my_range` 判斷結果，不重新複製一份 fallback 邏輯
- **[Risk]** BREAKING 變更（`decision_candidates` 對非建立者變成 `null`）需要跟 `BuJo` repo 的對應前端 change 同時部署，否則前端還在假設非建立者也能拿到完整排名會壞掉 → **Mitigation**：這個專案還在開發階段，不需要向下相容層；前端 change 會在後端這個 change 完成並驗證後才開始

## Migration Plan

不需要 Prisma migration。純 controller 邏輯調整，跟前端 `BuJo` repo 的對應 change 需要同時部署（BREAKING 變更）。
