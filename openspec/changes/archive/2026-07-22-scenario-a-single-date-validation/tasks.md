## 1. 新增情境一 endDate 驗證

- [x] 1.1 在 `src/controllers/activityController.js` 的 `createActivity` 情境一分支（`else` fallback，呼叫 `buildFixedSlot()` 之前）新增檢查：當請求帶了 `endDate` 且與 `startDate` 不同時回傳 400，達成「Scenario A activity creation rejects a mismatched end date」——驗證方式：`npm test -- activityController` 裡新增的測試涵蓋「`endDate` 跟 `startDate` 不同時回傳 400、不建立任何 Activity/ActivitySchedule/ActivityCandidateSlot 記錄」「`endDate` 缺省時視為合法」「`endDate` 等於 `startDate` 時視為合法」三種情況（比照 spec 裡的 Example 表格三個案例）
- [x] 1.2 在 `src/locales/zh-TW.json` 與 `src/locales/en.json` 的 `activity` 命名空間下新增 `endDateMustMatchStartDate` 這個 i18n 訊息鍵，比照既有 `startDateRequired`／`endMustBeAfterStart` 的用語風格，達成「Scenario A activity creation rejects a mismatched end date」的錯誤訊息——驗證方式：新增的測試斷言 400 回應的 `message` 內容跟這個新翻譯鍵的值一致（中英兩語系各自驗證）

## 2. 整體驗證

- [x] 2.1 執行 `npm test` 確認全專案測試通過，並確認既有的「結束時間不晚於開始時間」（`endMustBeAfterStart`）、`invalidDateFormat`、`timeAlreadyPast`、`voteDeadlineAfterDecisionDeadline` 等驗證行為維持不變——驗證方式：`npm test` 全數通過，且既有涵蓋這些驗證的測試案例無需修改就能繼續通過
