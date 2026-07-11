## Context

情境三（find_date）／情境四（find_date_time）目前的成團決策機制有三個問題：`confirmFormation` 只允許建立者確認「並列最高票」的候選時段，`getActivity` 回傳的 `decision_candidates` 也只有並列最高票那幾筆，建立者看不到其他候選時段的支持度；情境四完全沒有時間交集運算，子區間資料存了卻沒被使用；情境一（免投票）跟情境三（票數一致時）人數一達標會自動把活動設成 `confirmed`，建立者沒有確認的機會。另外，情境四目前允許建立者在同一天建立多個候選時段，且完全沒有重疊/重複驗證，這個彈性在參與者端造成了「重疊誤判」跟「窗口歸屬歧義」兩個實際 bug。

情境二（range 模式）已經有正確的參考實作：`computeRangeRanking` 切格計算交集、`confirmFormation` 讓建立者從排名清單自由選、人數達標永不自動成團——這次的修正是把情境三／四的決策機制拉齊到跟情境二一致的水準。

## Goals / Non-Goals

**Goals:**

- 情境三／四的建立者能看到所有候選時段的完整支持度排名，並能自由選擇要確認的候選時段
- 情境四新增子區間交集運算，讓系統能自動算出候選時段內大家都可行的窄窗口，不再只是存起來給建立者自己看
- 四個情境（A/B/C/D）的成團機制統一：人數達標只是提醒，永遠要建立者手動確認才會真正成團
- 情境四資料模型單純化：一個候選日期只對應一組時段

**Non-Goals:**

- 不做「確認成團後依有沒有選到時段給不同通知」——本次不處理，之後另開變更
- 不改情境二本身的交集運算邏輯，只重用其演算法概念到情境四
- 不改情境三的候選時段資料模型（本來就是一天一個候選日期，沒有多時段問題）
- 不新增資料庫欄位或做 migration——`ActivityAvailability.range_start`/`range_end` 已存在，這次只調整 controller 邏輯

## Decisions

### 單一候選時段模型，情境四建立時每個候選日期只能有一組時段

拿掉「同一天多個候選時段」的彈性。`createActivity` 的 `isVotingD` 分支新增檢查：`dateSlots` 陣列裡不能出現重複的 `date`，出現就回 400。這個彈性目前完全沒有驗證，且是參與者端兩個實際 bug 的根因，拿掉之後情境四的資料模型跟情境三一樣單純（一天一個候選時段），交集運算也不用處理跨窗口的邊界情況。

**替代方案考慮過**：保留多時段但補齊重疊驗證——否決，因為目前想不到「同一天需要兩個獨立候選時段」的真實使用情境，補驗證只是讓複雜的功能變得「驗證正確的複雜」，不如直接拿掉。

### decision_candidates 改成回傳完整排名清單，不再只有並列最高票

`getActivity` 的情境三／四分支，`decisionCandidates` 從 `getLeaderSlots` 只取 `leaders`，改成回傳**所有**候選時段各自的支持度，依票數（或情境四的交集覆蓋率）由高到低排序。情境三：`activity.candidateSlots.map(s => ({id, slot_start, slot_end, count, is_unanimous}))`，`count` 是投給這個候選時段的人數，`is_unanimous` 是 `count === joinedCount`，依 `count` 排序。情境四：每個候選時段各自跑一次交集運算（見下一項決策），回傳 `{id, slot_start, slot_end, perfect_overlap, partial_overlap}` 陣列。

### confirmFormation 情境三／四分支移除並列最高票限制，允許自由選

`confirmFormation` 不再用 `getLeaderSlots` 的 `leaders` 限制 `candidateSlotId` 的合法範圍，改成只驗證 `candidateSlotId` 是這個活動底下真實存在的候選時段即可（情境三），或是交集運算排名清單裡的某個時段/窄窗口（情境四）。建立者可以基於自己的考量（場地、個人時間）選擇非最高票的選項，系統只負責提供資訊，不強制最佳解。

### 情境四子區間交集運算比照情境二 computeRangeRanking，範圍限定在單一候選時段內

新增一個泛化版本的切格計算函式，輸入「一個時間範圍＋一組 range」，輸出 `perfect_overlap`/`partial_overlap`（沿用 `computeRangeRanking` 現有的回傳格式）。情境四對**每個候選時段**呼叫一次，時間範圍是該候選時段自己的 `slot_start`~`slot_end`，輸入的 range 是投給這個候選時段的參與者的 `range_start`/`range_end`；沒有提交子區間的參與者，視為整個候選時段時間都算他覆蓋（用候選時段本身的 `slot_start`~`slot_end` 當作他的 range）。`confirmFormation` 的情境四分支比照情境二，從選定候選時段的交集運算結果裡挑一個窄窗口，當場建立臨時候選時段存最終時間，不直接沿用候選時段原始邊界。

### 人數滿額不再自動成團，四個情境統一交由建立者手動確認

`joinActivity` 的 `targetReached` 判定邏輯（line 587-618）不再自動把狀態設成 `confirmed`：
- 情境一（免投票）：人數達標時不變更狀態（維持 `recruiting`），改發通知提醒建立者人數已達標，可以確認成團了。`confirmFormation` 的情境一分支本來就只要求狀態是 `recruiting`，不需要調整。
- 情境三／四：人數達標不論票數/交集是否一致，一律轉成 `voting` 狀態並發送 `time_to_pick` 通知給建立者，跟現有「票數不一致」的處理方式合併成同一條路徑，不再區分「一致就自動」「不一致才轉 voting」。
- 情境二：本來就是一律手動，不受影響。

### isFindDateResubmission 擴大到 find_date_time

判斷條件從只認 `find_date` 改成 `find_date === variant || find_date_time === variant`，重用既有的刪除舊投票紀錄＋重建邏輯，不用另外寫。

### 子區間維持選填

`candidateSlotRanges` 不強制參與者一定要提交，沒有子區間的參與者投票仍然有效，在交集運算中視為整個候選時段都可行（見上面的交集運算決策）。

## Risks / Trade-offs

- **[Risk]** 拿掉「同一天多候選時段」是 BREAKING 變更 → **Mitigation**：目前這個能力還在開發分支上，尚未合併到 main、沒有正式使用者資料在用，不需要處理舊資料遷移
- **[Risk]** 移除 A／C 自動成團，改變既有 API 行為（原本人數達標會直接回應 `confirmed`，現在不會）→ **Mitigation**：前端會同步更新，這個專案目前還在開發階段，不需要做向下相容層
- **[Risk]** 建立者可以確認票數為 0 的候選時段 → **Mitigation**：刻意允許，這是建立者的自主判斷（例如私下已經口頭喬好，只是懶得在系統裡投票），系統不強制最低票數門檻
- **[Risk]** 情境四交集運算的效能，候選時段數量多時要跑多次切格計算 → **Mitigation**：每個候選時段的時間範圍通常只有幾小時，切格運算量小，且只在 `getActivity`／`confirmFormation` 被呼叫時才算，不是常駐計算
- **[Risk]** 移除 `creatorSlotIndexes` 是 BREAKING API 變更（請求 body 不再需要/使用這個欄位）→ **Mitigation**：專案還在開發分支，前端會同步移除這個欄位的送出，不需要相容層
- **[Risk]** 既有測試（`activityStateMachine.test.js` 397/433/475/506/534/633/645 行附近）斷言 `creatorAvailability`/`creatorSlotIndexes` 的行為，這次會直接壞掉 → **Mitigation**：這些測試本來就是在保護即將被移除的錯誤行為，直接移除或改寫成驗證新行為，不是回歸

## Migration Plan

不需要 Prisma migration（沒有新增欄位）。純 controller 邏輯調整，跟情境四前端變更（同名前端 change）需要同時部署，因為 API 回應格式（`decision_candidates`）跟成團行為都有 BREAKING 變更。

## Addendum：移除建立者的幽靈投票

見 proposal.md 同名 Addendum 段落的 Why，這裡只記錄技術決策。

### 移除 creatorSlotIndexes/creatorAvailability 機制，不是「排除建立者的計票」

一開始考慮的修法是「保留建立者的 `ActivityAvailability` 記錄，但在 `computeSlotOverlapRanking`/`getLeaderSlots` 這些計票函式裡過濾掉建立者的 `user_id`」。否決這個做法，改成直接移除 `createActivity` 裡寫入這筆記錄的機制（83-87 行的必填驗證、133-141 行的 insert）。理由：

- 這筆記錄從頭到尾不承載任何真實資訊——`creatorSlotIndexes` 在前端無條件等於全部候選時段索引，不反映使用者的任何選擇，資料本身是死的
- 「建立者對自己建立的候選時段有空」這個事實已經被 `slot_start`~`slot_end` 邊界本身結構性保證，不需要額外一筆資料佐證
- 直接不寫入這筆記錄，情境三的 `decision_candidates`/`getLeaderSlots`、情境四的 `computeSlotOverlapRanking` 全部從同一份 `slot.availabilities` 讀資料，不需要另外在每個計票函式裡加建立者過濾邏輯——移除寫入點比在多個讀取點各自過濾更不容易漏改

### 新增 votingParticipantCount，跟 joinedCount 分開用途

`joinedCount`（`activity.participants.length`，包含建立者）目前身兼兩種用途：（a）出席人數統計、`participant_target` 達標判定；（b）情境三／四「是否全員一致」（`decideFormationOutcome`/`is_unanimous`）的分母。這次拆開，新增：

```js
function getVotingParticipantCount(activity) {
  return activity.participants.filter((p) => p.user_id !== activity.creator_id).length
}
```

只用在 `decideFormationOutcome` 呼叫（getActivity 決策清單、joinActivity 人數達標判定）跟 `is_unanimous` 計算這兩處，取代原本傳入的 `joinedCount`。`joinedCount` 本身、`current_count`、頭像列表回傳邏輯完全不動。

### 情境二比照處理：移除虛擬 range 注入，totalParticipants 改用真人送出者去重數

```js
// 修改前
const submittedRanges = getJoinedAvailabilityRanges(activity)
const allRanges = [...submittedRanges, { start: windowStart, end: windowEnd }]
decisionCandidates = computeRangeRanking(allRanges, windowStart, windowEnd, joinedCount)

// 修改後
const submittedRanges = getJoinedAvailabilityRanges(activity)
const votingCount = new Set(
  (activity.availabilityRanges ?? [])
    .filter((r) => joinedUserIds.has(r.user_id))
    .map((r) => r.user_id),
).size
decisionCandidates = computeRangeRanking(submittedRanges, windowStart, windowEnd, votingCount)
```

用 `user_id` 去重是因為情境二一個人可以用「+新增時段」送出多筆不連續的 range，`submittedRanges.length`（筆數）不等於真人數，必須去重才能當分母。`getJoinedAvailabilityRanges` 回傳時已經把 `user_id` 拿掉了，這裡另外算一次去重數量，或是把 `getJoinedAvailabilityRanges` 改成順便回傳 distinct 人數（兩處呼叫點都要用到，抽成共用小函式）。
