## Why

情境三／四（find_date／find_date_time）建立者確認成團時，`confirmFormation` 目前限制只能選「並列最高票」的候選時段，其餘候選時段的票數對建立者完全不可見，`getActivity` 回傳的 `decision_candidates` 也只有並列最高票那幾筆。情境四更完全沒有像情境二（range 模式）一樣做時間交集運算——參與者送出的子區間（`range_start`/`range_end`）存了卻沒被拿來用，違背 BuJo「系統自動幫忙算出大家都可行的時間，不需要使用者自己動腦計算」的核心設計原則。同時，情境四目前允許建立者在同一天建立多個候選時段，這個彈性在缺乏任何驗證的情況下，已經在參與者端造成了「重疊誤判」「窗口歸屬歧義」兩個實際 bug，拿掉這個能力可以讓資料模型單純化，交集運算也不用處理跨窗口衝突的邊界情況。

另外，`joinActivity` 人數一達標時的自動判定邏輯（line 587-618），情境一（免投票）跟情境三（票數一致時）目前會**直接自動把活動狀態設成 `confirmed`、通知所有參與者**，建立者完全沒有機會確認就成團了；只有情境二本來就設計成一律手動確認。這跟建立者應該要能掌控「活動何時真正定案」的預期不符，活動不應該在建立者不知情的狀況下被系統自動確定。

## What Changes

- 情境四建立時，每個候選日期只能對應一組時段，移除「同一天多個候選時段」的能力；`createActivity` 的 `isVotingD` 分支新增重複日期檢查
- 情境三／四的 `getActivity` 回傳的 `decision_candidates`，從「只回傳並列最高票」改成回傳完整排名清單（依票數/覆蓋率由高到低排序），讓建立者能看到所有候選時段各自的支持度
- `confirmFormation` 的情境三／四分支移除「必須並列最高票」的限制，允許建立者從完整清單中自由選擇要確認的候選時段
- 情境四新增子區間交集運算：比照情境二 `computeRangeRanking` 的切格計數概念，在**每個候選時段自己的時間範圍內**計算參與者子區間的覆蓋率，回傳 perfect_overlap／partial_overlap；沒有提交子區間的參與者，在運算中視為整個候選時段都可行
- 情境四 `confirmFormation` 改成比照情境二，從交集運算排名清單中挑選，當場建立臨時候選時段存最終窄窗口時間，不再直接沿用建立時候選時段的原始邊界
- **BREAKING**：`joinActivity` 人數滿額時的自動判定邏輯全面移除——情境一跟情境三（不論票數是否一致）都改成只發通知提醒建立者「人數已達標，可以確認成團」，狀態不再自動變成 `confirmed`；情境三票數一致時改成跟票數不一致時一樣轉成 `voting` 狀態。四個情境（A/B/C/D）成團從此一律要建立者手動呼叫 `confirmFormation` 才會定案
- `isFindDateResubmission` 判斷條件擴大到涵蓋 `find_date_time`，讓情境四已報名者在 `recruiting` 階段可以重新提交候選時段
- 子區間（`candidateSlotRanges`）維持選填，不強制參與者一定要提交

## Capabilities

### New Capabilities

- `activity-formation-confirmation`: 四個情境（A/B/C/D）成團一律要建立者手動確認，人數滿額不再自動把活動設成 `confirmed`

### Modified Capabilities

- `scenario-d-availability-picker-api`: 新增子區間交集運算與排名、`confirmFormation` 自由選、單一候選時段模型、resubmission 擴大

## Impact

- Affected specs: scenario-d-availability-picker-api
- Affected code:
  - Modified: src/controllers/activityController.js, prisma/schema.prisma

## Addendum：決策票數/交集運算排除建立者，出席人數統計不受影響

### Why

情境四手動流程驗證時，實測發現一個活動只有 1 個真人參與者，`decision_candidates` 卻顯示某個窄窗口「完全重疊 2 票」。追查後發現：`createActivity` 的 `isVotingC || isVotingD` 分支會自動幫建立者寫入一筆沒有 `range_start`/`range_end` 的 `ActivityAvailability`（`creatorSlotIndexes` 機制），這筆記錄在交集運算裡 fallback 成「整個候選時段都算有空」。

「建立者對自己建立的候選時段有空」這件事本身是事實——`slot_start`~`slot_end` 就是建立者自己設定的邊界，這個事實已經被資料模型結構性保證，不需要另外寫一筆資料證明。問題出在系統把這個**恆真的背景假設**，具體化成一筆跟參與者投票長得一模一樣的 `ActivityAvailability` 記錄，丟進同一套計票函式——導致「真人主動選擇這個時段」的訊號，跟「建立者對自己開的時段當然有空」這個不需要驗證的公理，被錯誤地加總在同一個數字裡。而前端從來沒有讓建立者真的選「哪些候選時段對自己方便」（`EventPage.vue` 無條件送出全部候選時段索引：`creatorSlotIndexes: configuredSlots.value.map((_, i) => i)`），這個欄位從頭到尾不反映任何真實使用者意圖，純粹是灌票的副作用。

情境二（range 模式）有同樣的設計，只是實作更明確（`getActivity`/`confirmFormation` 兩處手動塞一段涵蓋整個基準範圍的虛擬 range 代表建立者，程式碼註解直接寫「建立者永遠算『有空』」）——不是情境四獨有的實作疏漏，是三個情境（B/C/D）共用的同一個設計決定，這次一併修正。

**修正範圍刻意排除「出席人數統計」**：活動卡片的「已報名 X/∞ 人」、頭像列表、`current_count`，回答的是「總共有幾個真人會出席」，建立者當然會出席自己辦的活動，這個數字應該繼續把建立者算進去，維持不變。這次只調整「決策票數/交集運算的分母跟計數」——回答的是「這個候選時段有多少人主動選了它、大家共識夠不夠」，這個語意下建立者的可用性是背景假設，不是主動投票訊號，不該算進去。兩者在程式碼裡目前共用同一個 `activity.participants.length`（`joinedCount`），這次會拆成兩個獨立的用途。

### What Changes

- 移除 `createActivity` 的 `creatorSlotIndexes`/`creatorAvailability` 機制（情境三／四）：拿掉必填驗證與 `ActivityAvailability` 的 insert。這個 insert 一拿掉，情境三的票數（`decision_candidates`/`getLeaderSlots`）跟情境四的子區間交集運算（`computeSlotOverlapRanking`）都是從同一份 `slot.availabilities` 算出來的，不用另外改交集運算程式碼，會自動只反映真人參與者
- 新增 `votingParticipantCount`（= 參與者數扣掉建立者），取代情境三／四「是否全員一致」判斷（`decideFormationOutcome`/`is_unanimous`）目前使用的 `joinedCount`——建立者不投票，繼續用包含建立者的 `joinedCount` 當分母，會讓真正全員一致的情況也永遠判定成不一致。`joinedCount`/`current_count`/頭像列表在人數達標判定、出席統計等其他地方**維持不變**，仍把建立者算進去，跟 `votingParticipantCount` 是兩個不同用途、不能共用
- 情境二移除建立者的虛擬全窗口 range 注入，`computeRangeRanking` 的 `totalParticipants` 改用真正送出可用時間的人數（依 `user_id` 去重後的真人參與者數），`getActivity`／`confirmFormation` 兩處呼叫都要同步調整

### Impact

- `src/controllers/activityController.js`：`createActivity`（移除 creatorSlotIndexes 機制）、`getActivity`／`confirmFormation`（情境二真人參與者計數、情境三/四 `votingParticipantCount`）——`joinedCount`/`current_count`/`participants` 陣列本身不變
- `src/__tests__/activityStateMachine.test.js`：移除/改寫斷言 `creatorAvailability`/`creatorSlotIndexes` 行為的既有測試
- `API_DOCS.md`：若請求/回應格式因移除 `creatorSlotIndexes` 而變動，同步更新
