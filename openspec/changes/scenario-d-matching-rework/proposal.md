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
