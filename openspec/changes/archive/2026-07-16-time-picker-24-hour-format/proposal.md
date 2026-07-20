## Why

前端時間選取器與時間顯示要從「上午/下午 H:MM」中文格式改成 24 小時制零填充格式（`HH:00`），因為「上午 12:00」代表午夜這個對應容易讓使用者搞混。這個字串格式同時是建立活動時前端送給後端的 API payload 內容，以及後端回傳給前端顯示既有活動時間的格式，後端 `activityController.js` 裡的 `formatTime`（輸出）與 `parseDateTime`（輸入）都需要同步調整。

這個變更橫跨前後端兩個獨立的 git repo（`BuJo` 前端、`BuJoBackend` 後端），Spectra 的 change 追蹤是 per-repo 的，所以拆成兩個獨立 change：**這份 proposal 只涵蓋後端範圍**，前端（共用工具模組整併、3 個元件切換格式）由 `BuJo` repo 裡對應的 `time-picker-24-hour-format` change 追蹤。

## What Changes

- 後端 `formatTime`（輸出既有活動時間給前端顯示）改成只輸出零填充 24 小時制格式（`HH:MM`），不再輸出「上午/下午」
- 後端 `parseDateTime`（解析前端送來的時間字串）改成**過渡期同時接受**舊格式（`上午/下午 H:MM`）與新格式（`HH:MM`）兩種——不能要求前後端同一秒切換，後端要先能雙格式相容，前端才能安全切換成只送新格式
- `formatTime` 與 `parseDateTime` 的補零邏輯改成呼叫同一個內部共用函式（`pad2`），避免兩者格式不一致
- **BREAKING（跨 repo 協調）**：這是前端切換格式的前置依賴——`BuJo` repo 的對應 change 的部署任務會等待這份 change 的「支援雙格式」任務先完成
- 約 40 處測試斷言字面值需要對應更新（`activityStateMachine.test.js`、`scenarioBRange.test.js`）
- 新增前後端一致性 fixture 校驗：後端這邊斷言的字面值要跟 `BuJo` repo 對應 change 裡前端斷言用的是同一個字串

## Non-Goals

- 不涉及資料庫遷移——時間一律以 `Date` 欄位儲存，資料庫從未存過「上午/下午」文字，既有活動資料不受影響
- 不擴大到其他檔案——已確認「上午/下午」格式只存在於 `activityController.js` 一個檔案
- 不改變任何情境（A/B/C/D）的時間篩選規則或候選時段判斷邏輯，只改字串的顯示與解析格式
- 不包含前端實作（共用工具模組、3 個元件切換格式）——由 `BuJo` repo 的對應 change 負責
- 這次不移除舊格式的相容解析分支——待前端確認上線穩定後，安排下一個小改動移除，這次先保留雙格式相容

## Capabilities

### New Capabilities

- `time-display-format`：定義後端輸出（`formatTime`）與輸入解析（`parseDateTime`）一律以 24 小時制零填充格式為準，過渡期同時相容舊格式輸入

### Modified Capabilities

(無)

## Impact

- Affected specs: `time-display-format`（新增）
- Affected code:
  - Modified:
    - `src/controllers/activityController.js`
    - `src/__tests__/activityStateMachine.test.js`
    - `src/__tests__/scenarioBRange.test.js`
