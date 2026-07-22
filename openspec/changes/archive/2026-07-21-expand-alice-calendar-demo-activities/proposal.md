## Why

Alice 的 Demo 月曆在 seed 執行日後第 4 至第 8 天只有兩筆已成團活動，無法充分展示連續數日、同日多活動與依時間排序的月曆畫面。需要補足近期且不互相衝突的活動資料，讓測試與展示情境穩定重現。

## What Changes

- 新增五筆 Alice 已參加的 confirmed Demo 活動，建立者分散於 Alice、Bob 與 Carol。
- 沿用 Asia/Taipei 與 seed 執行日的動態相對日期，將五筆活動安排在第 4、6、7、8 天。
- 配合既有第 5 天與第 8 天活動，使第 4 至第 8 天的月曆活動分布為 2、1、1、1、2，共七筆。
- 為新增活動設定 confirmed_slot_id，確保活動 API 會輸出 date_iso 與 confirmed_start，且同日活動時間錯開。
- 擴充 seedActivities Jest 測試，驗證總數、參加者、建立者、日期、時段及確認時段關聯。

## Non-Goals

- 不調整 Prisma schema、migration、API contract 或前端月曆邏輯。
- 不改動既有十二筆活動的狀態、時段與參與者。
- 不在提案或測試階段重設任何本機或遠端資料庫。

## Capabilities

### New Capabilities

- `demo-calendar-activity-seeding`: 規範 Alice 近期 Demo 月曆活動的數量、動態日期分布、confirmed 狀態、參與者與錯開時段。

### Modified Capabilities

（無）

## Impact

- Affected specs: demo-calendar-activity-seeding
- Affected code:
  - New: none
  - Modified: prisma/seeds/activities.js, src/__tests__/seedActivities.test.js
  - Removed: none
- APIs and dependencies: no changes
