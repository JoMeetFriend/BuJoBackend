## Problem

`POST /activities` 情境一（單一固定日期，`else` fallback 分支，`activityController.js` 的 `createActivity`）目前不驗證 `startDate` 跟 `endDate` 是否相同。情境一的設計定義是「單一固定日期，只有時間有範圍」，但 `buildFixedSlot(startDate, startTime, endDate, endTime, allDay)` 會老實地用請求裡的 `endDate`（若跟 `startDate` 不同）建出 `slot_end`，等於允許建立一個真正橫跨多天的「情境一」候選時段，違反這個情境的定義。

## Root Cause

`buildFixedSlot()` 對 `endDate` 沒有上限或相等性檢查，只在 `endDate` 缺省時 fallback 成 `startDate`（`endDate ?? startDate`）。既有的 `candidateSlotsData.some((s) => s.slot_end <= s.slot_start)` 驗證（`activityController.js` 第 134 行）只擋「結束時間不晚於開始時間」，對「結束時間確實晚於開始時間、但日期差了好幾天」這種情況完全不會觸發，因為這種請求的 `slot_end` 在時間軸上合法地晚於 `slot_start`。

前端（`BuJo` repo，另一個 change `scenario-a-single-date-picker` 處理）原本就會把 `endDate` 限制成跟 `startDate` 相同，但這是公開 API，前端的限制擋不住直接呼叫 API 的請求——這正是這個檔案裡緊鄰的既有註解（第 132-133 行）反覆強調的既定原則：「前端有擋...但這是公開 API，不能只靠前端擋」，這次的驗證缺口跟既有的 `endMustBeAfterStart` 檢查是同一種性質的疏漏，只是沒被涵蓋到。

## Proposed Solution

在 `createActivity` 的情境一分支（`else` fallback，`!isVotingB && !isVotingC && !isVotingD`），在呼叫 `buildFixedSlot()` 之前新增驗證：當請求明確帶了 `endDate` 且與 `startDate` 不同時，回傳 400 並附上新增的 i18n 訊息鍵 `activity.endDateMustMatchStartDate`（比照現有 `activity.startDateRequired`/`activity.endMustBeAfterStart` 的訊息鍵慣例，分別補上 `src/locales/zh-TW.json`／`src/locales/en.json` 兩個語言檔）。`endDate` 缺省（`undefined`/`null`）時視為合法，沿用 `buildFixedSlot()` 既有的 `endDate ?? startDate` fallback 行為，不受這次改動影響。

## Non-Goals

- 不改動 `candidateSlotsData.some((s) => s.slot_end <= s.slot_start)` 這個既有驗證，這次新增的是獨立的一道檢查，不修改既有邏輯
- 不改動情境二/三/四（`isVotingB`/`isVotingC`/`isVotingD`）的驗證邏輯，這三個情境本來就沒有獨立 `endDate` 欄位這個問題
- 不修改 `prisma/schema.prisma`，這是應用層的請求驗證，不是資料表結構調整
- 不處理 `BuJo` 前端的介面改動，那部分是獨立的 change（`scenario-a-single-date-picker`，在 `BuJo` repo）

## Success Criteria

- `POST /activities` 在情境一（未投票、`startDate` 存在）且請求帶了跟 `startDate` 不同的 `endDate` 時，回傳 400，不建立任何 `Activity`/`ActivitySchedule`/`ActivityCandidateSlot` 記錄
- `POST /activities` 在情境一、`endDate` 缺省或等於 `startDate` 時，行為與現在完全一致，不受影響
- 既有的 `endMustBeAfterStart`／`invalidDateFormat`／`timeAlreadyPast` 等驗證行為不變

## Capabilities

### New Capabilities

- `scenario-a-fixed-slot-validation`: 描述情境一（單一固定日期）建立活動時，`startDate` 與 `endDate` 必須相同的伺服器端驗證規格

### Modified Capabilities

(none)

## Impact

- Affected specs: `scenario-a-fixed-slot-validation`（新增）
- Affected code:
  - Modified: src/controllers/activityController.js
  - Modified: src/locales/zh-TW.json
  - Modified: src/locales/en.json
