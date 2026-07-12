## Why

情境二／三／四的建立者決策畫面，目前有三個疊加的體驗問題：`computeRangeRanking`/`computeSlotOverlapRanking` 無條件把時間範圍切成 60 分鐘一格，一個人送出一段連續的可用時間就會拆成好幾筆幾乎一樣的列（例如 5 小時範圍 → 5 筆「1 票」）；「完全重疊」「部分重疊」是技術詞彙且沒有比例基準；看不到票是誰投的，建立者做決定常需要知道「這個時段誰可以誰不可以」。三者疊加讓決策畫面資訊量爆炸、語意難懂、又缺關鍵決策資訊。另外，情境一（免投票）的建立者也需要能看到已報名人數與頭像，目前這件事本身應該已經可行但實際操作觀察不到，需要一併查證修正。

貫穿整份改版的原則：使用者體驗不需要過度思考、不需要一次接受過多資訊、使用起來要直覺符合邏輯。

## What Changes

- **BREAKING**：`computeRangeRanking`／`computeSlotOverlapRanking` 回傳格式從 `{perfect_overlap, partial_overlap}` 雙陣列改成單一排序陣列，依支持人數由高到低排序；每筆結果新增 `is_unanimous`（票數＝總人數）布林欄位，取代原本「分兩桶」的呈現方式。情境三（find_date）本來就是單一排序陣列，格式不變，只新增支持者欄位
- 新增合併規則：組裝最終結果前，把相鄰且支持人數完全相同的切格區段合併成一筆；支持人數一有變化就斷開變成新的一筆。情境三候選日期本身就是一天一列，不需要合併
- `getJoinedAvailabilityRanges` 不再丟棄 `user_id`；每筆決策結果新增支持者清單（`user_id`、`display_name`、`avatar_url`），供前端顯示頭像
- **修正既有規格債務**：情境二 `scenario-b-availability-reporting` 現有規格仍記載「建立者永遠視為有空」（`Creator is treated as always available`），這個行為在前一個 change（幽靈投票修復）已經移除，但規格文件沒有同步更新，這次一併修正成正確的行為描述
- 情境一：查證並修正建立者看不到「已報名人數＋頭像」的問題，確保跟其他情境呈現一致
- 移除的「筆數上限」寫死邏輯（原 `partial_overlap` 的 `.slice(0, 3)`）：後端一律回傳完整的合併後列表，不在後端砍資料，筆數收合交給前端顯示層處理

## Non-Goals

- 不改切格運算本身的時間單位（仍以 60 分鐘為基準切格），合併只發生在組裝最終結果的階段
- 不改資料庫結構——參與者的原始 `range_start`/`range_end` 存法不變，這次全部是記憶體運算層的調整
- 不處理前端的收合/展開互動、頭像 hover/長按顯示名字——那是前端 `BuJo` repo 的對應 change（`decision-view-ux-redesign`）負責
- 不修改情境三專屬的規格（`scenario-c-date-picker-api`）——find_date 的 `decision_candidates` 格式規範定義在 `activity-formation-confirmation`，這次改動已由該處涵蓋

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `activity-formation-confirmation`: `getActivity`/`confirmFormation` 的決策結果格式改成單一排序陣列＋`is_unanimous`＋支持者清單，不再分 `perfect_overlap`/`partial_overlap` 兩個桶（涵蓋情境三 find_date 的格式異動）
- `scenario-b-availability-reporting`: 修正「建立者永遠視為有空」的過期規格描述；`computeRangeRanking` 新增合併相鄰同票數區段的邏輯，回傳格式同步調整為單一排序陣列
- `scenario-d-availability-picker-api`: `computeSlotOverlapRanking` 新增合併相鄰同票數區段的邏輯，候選時段內層的 `perfect_overlap`/`partial_overlap` 合併成單一 `segments` 陣列；`confirmFormation` 比對邏輯同步調整

## Impact

- Affected specs: activity-formation-confirmation, scenario-b-availability-reporting, scenario-d-availability-picker-api
- Affected code:
  - Modified: src/controllers/activityController.js
  - Modified: src/__tests__/activityStateMachine.test.js
  - Modified: src/__tests__/scenarioBRange.test.js
  - Modified: src/__tests__/computeRangeRanking.test.js
  - Modified: src/__tests__/computeSlotOverlapRanking.test.js
  - Modified: API_DOCS.md
