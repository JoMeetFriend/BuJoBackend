## Context

情境二（range 模式）的 `computeRangeRanking`、情境四（find_date_time）的 `computeSlotOverlapRanking`，都是把時間範圍以 60 分鐘為單位切格、算每格支持人數，再分成 `perfect_overlap`（count===總人數）／`partial_overlap`（count<總人數，情境二/四各自有筆數上限）兩個陣列回傳。情境三（find_date）沒有切格，`decision_candidates` 本來就是一天一列的扁平陣列，帶 `count`/`is_unanimous`。

三處呈現方式不一致，且情境二/四的切格結果沒有合併相鄰同票數的格子，一個人送出一段連續時間就會拆成好幾筆幾乎一樣的列。三處都沒有回傳「誰投的」，只有票數/人數。情境一（免投票）建立者查看已報名人數與頭像的功能，實測觀察不到，需要查證。

## Goals / Non-Goals

**Goals:**

- 情境二／三／四的決策結果，統一成同一種資料形狀：單一排序陣列（依支持人數由高到低），每筆帶 `is_unanimous` 與支持者清單（`user_id`/`display_name`/`avatar_url`）
- 情境二／四在組裝結果前，合併相鄰且支持人數完全相同的切格區段
- 後端不再自行限制回傳筆數（拿掉 `partial_overlap` 原本的 `.slice(0, 3)`），完整列表交給前端決定顯示策略
- 情境一：查證並修正建立者看不到已報名人數/頭像的問題

**Non-Goals:**

- 不改切格運算的時間單位（仍是 60 分鐘一格），合併只發生在組裝最終結果時
- 不改資料庫結構，不新增/修改任何 Prisma model 或 migration
- 不處理前端顯示邏輯（收合/展開、頭像 hover/長按）——那是 `BuJo` repo 的對應 change

## Decisions

### 統一的決策項目形狀

情境二／三／四的 `decision_candidates` 陣列，每一筆（後面稱「segment」）統一成：

```js
{
  id: string,              // 情境二/四的合併結果：'temp-<ISO起點>'；情境三：真實 ActivityCandidateSlot.id
  slot_start: Date,
  slot_end: Date,
  count: number,           // 支持人數
  is_unanimous: boolean,   // count === 該情境的真人投票分母（votingParticipantCount，情境二為真人送出者去重數）
  supporters: [{ user_id: string, display_name: string, avatar_url: string | null }, ...],
}
```

**情境二／三**：`decision_candidates` 直接是這種 segment 的陣列，依 `count` 由高到低排序（原本情境二回傳 `{perfect_overlap, partial_overlap}`，改成單一陣列；情境三本來就是這個形狀，只新增 `supporters` 欄位）。

**情境四**：`decision_candidates` 維持「候選時段」外層分組（每個候選時段是建立者提議的不同日期/窗口，不能合併掉），內層原本的 `perfect_overlap`/`partial_overlap` 合併成單一 `segments` 陣列：

```js
{
  id: string,              // 真實 ActivityCandidateSlot.id
  slot_start: Date,        // 候選時段本身的窗口邊界
  slot_end: Date,
  count: number,           // 投給這個候選時段的總人數（不是交集重疊人數）
  segments: [ /* 上面定義的 segment 形狀，依 count 由高到低排序 */ ],
}
```

### 合併相鄰同票數區段的演算法

`computeRangeRanking`／`computeSlotOverlapRanking` 內部切格＋計數的邏輯不變（仍產生「每格 60 分鐘＋count」的陣列）。新增一個共用的合併步驟，在組裝最終 segment 陣列之前執行：

```js
function sameSupporterSet(a, b) {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

function mergeAdjacentSameCount(countedSegments) {
  const merged = []
  for (const seg of countedSegments) {
    if (seg.count === 0) continue
    const last = merged[merged.length - 1]
    if (
      last &&
      last.count === seg.count &&
      last.slot_end.getTime() === seg.slot_start.getTime() &&
      sameSupporterSet(last.supporterIds, seg.supporterIds)
    ) {
      last.slot_end = seg.slot_end
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}
```

合併條件是「票數相同」＋「時間相鄰（前一筆的 `slot_end` === 這一筆的 `slot_start`）」＋「支持者集合完全相同」，三者都成立才合併。**支持者集合這個條件是實作時修正的**：一開始以為「票數相同代表同一群人」，但這個假設不成立——例如 Alice 9:00-10:00、Bob 10:00-11:00 這種交接情境，兩個相鄰小時的票數都是 1，但分別是不同的人，若只靠票數判斷會誤合併成一筆「9:00-11:00，1人」，錯誤地把兩個不同的人顯示成同一個支持者。加上支持者集合比對後，這種情況會正確保持兩筆分開的 entry。票數不同、時間不連續、或支持者不同（即使票數相同）都會斷開成新的一筆。合併後只有 `count > 0` 的格子才會出現在最終回傳的陣列裡（`count === 0` 的格子本來就不該顯示給建立者看）。

### 支持者清單的來源

`getJoinedAvailabilityRanges`（情境二）與 `slot.availabilities`（情境三／四，即 `ActivityAvailability` 查詢結果）都已經有 `user_id`；情境二目前 `.map` 時把 `user_id` 丟掉了，改成保留。組裝 segment 時，一個 segment 涵蓋哪些人的原始 range，就把那些人的 `user_id` 收集起來，最後對照 `activity.participants`（已經 include `user: {display_name, avatar_url}`）組成 `supporters` 陣列。合併相鄰區段時（見上），因為票數相同代表支持者集合相同，直接沿用前一筆的 `supporterIds`，不用重新計算。

### is_unanimous 的分母沿用既有的 votingParticipantCount

情境二用 `getJoinedSubmitterCount(activity)`（真人送出者依 user_id 去重數），情境三／四用 `getVotingParticipantCount(activity)`（參與者數扣掉建立者）——這兩個函式在前一次「移除建立者幽靈投票」的修復中已經存在，這次直接沿用，不重新定義。

### 情境一已報名人數/頭像可見性

`getActivity` 回傳的 `current_count`/`participants` 欄位，程式碼層級對所有情境（含情境一）都會回傳同樣的資料，前端 `activity-detail-join` 區塊也沒有被任何情境判斷式包住——初步判斷這不是後端資料缺漏，是前端渲染或某個更細的條件判斷造成的落差。這次會先在後端補一則整合測試，明確斷言情境一的 `getActivity` 回應包含正確的 `current_count`/`participants`，確認後端資料層沒有問題；如果測試證實資料層正確，落差就完全是前端 `BuJo` repo 的問題，這裡不用再改後端程式碼。

## Implementation Contract

**行為**：建立者打開活動決策畫面時，看到的是依支持度排序的單一清單，每筆顯示時間範圍、人數比例（`count`/分母）、支持者頭像；不再看到「完全重疊」「部分重疊」這兩個分類標題（這部分文字由前端渲染，後端只要不回傳這兩個分類鍵名即可）。已報名參與者若在同一段連續時間都表態支持，只會看到一筆合併後的時間範圍，不會看到好幾筆幾乎相同的列。

**介面／資料形狀**：
- `GET /api/activities/:id` 回應的 `decision_candidates`：情境二／三是上述 segment 陣列；情境四是「候選時段＋內層 `segments` 陣列」的結構，取代原本的 `perfect_overlap`/`partial_overlap`
- `POST /api/activities/:id/confirm-formation`：情境二／四的 `slotStart`/`slotEnd` 驗證邏輯不變，一樣是「跟某個回傳的 segment 時間完全相符才接受」，只是現在比對的是合併後的單一陣列，不是兩個分開的陣列

**失敗模式**：`confirmFormation` 送出的時間不在目前 `decision_candidates`（或情境四某個候選時段的 `segments`）清單裡時，維持現有行為回 400（`此候選時段不在可確認的名單中`），不新增其他錯誤分支。

**驗收標準**：
- `computeRangeRanking`/`computeSlotOverlapRanking` 的單元測試涵蓋：相鄰同票數合併成一筆、票數變化正確斷開、`is_unanimous` 正確反映真人分母、`supporters` 正確列出對應使用者
- 情境二／三／四的 `getActivity` 整合測試涵蓋：新的單一陣列/巢狀 segments 格式、排序正確（依 count 由高到低）
- `confirmFormation` 的既有測試（情境二/三/四）更新成比對新格式後仍然全部通過
- 情境一新增一則整合測試：`getActivity` 回應正確包含 `current_count`/`participants`（含 `display_name`/`avatar_url`）

**範圍邊界**：只改 `getActivity`／`confirmFormation` 內決策結果的組裝邏輯與相關 helper 函式；不改建立活動、報名、取消等其他 API 行為；不改情境一的 `getActivity` 邏輯本身（只新增測試驗證既有行為，除非測試證實資料層真的有缺漏才動程式碼）。

## Risks / Trade-offs

- **[Risk]** 回傳格式是 BREAKING 變更（`decision_candidates` 形狀整個改變）→ **Mitigation**：前端會同步更新（`BuJo` repo 的對應 change），這個專案還在開發階段，不需要向下相容層
- **[Risk]** 合併演算法如果誤判「相鄰」（例如時區/精度問題導致 `slot_end`/`slot_start` 沒有精確相等）會漏合併或錯誤合併 → **Mitigation**：切格運算本身已經用固定的 60 分鐘步進產生格子邊界，同一組切格結果的邊界必然精確銜接，不會有精度誤差；新增測試涵蓋這個邊界比對
- **[Risk]** 情境一的落差如果查證後發現真的是後端問題（不只是前端），會超出這次 design 預估的範圍 → **Mitigation**：先寫整合測試驗證，若測試失敗（證實後端有問題）才視情況擴大這次的修改範圍，並更新這份 design

## Migration Plan

不需要 Prisma migration。純 controller 邏輯調整，跟前端 `BuJo` repo 的對應 change 需要同時部署，因為 `decision_candidates` 的回應格式是 BREAKING 變更。
