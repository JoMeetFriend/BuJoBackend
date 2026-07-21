## 1. TDD 測試契約

- [x] 1.1 先在 src/__tests__/seedActivities.test.js 建立失敗測試，鎖定「Alice has seven confirmed calendar activities in the near-term demo window」：固定 Taipei seed 日為 2026-07-21 時，7/25 至 7/29 的 confirmed-slot 活動每日數量必須為 2、1、1、1、2；以 targeted Jest 確認測試在實作前因總數或缺少活動而失敗。
- [x] 1.2 在同一測試檔建立失敗測試，鎖定「New demo activities use realistic non-overlapping schedules and mixed creators」：五個指定標題必須符合建立者、Alice 參與、confirmed 狀態、精確起訖時間與 confirmed_slot_id 關聯；以 targeted Jest 確認實作前測試失敗。

## 2. Demo 活動 Seed

- [x] 2.1 在 prisma/seeds/activities.js 的 seedActivities 新增河濱單車晨騎、黃昏咖啡散步、下班小聚、日式料理聚餐與早餐交流會，沿用 at 動態 Taipei 日期工廠並依 spec 指定建立者、參與者與單一時段；以 1.1、1.2 的 targeted Jest 測試驗證五筆資料及 2、1、1、1、2 分布。
- [x] 2.2 將五筆新增活動納入 confirmed_slot_id 更新流程與 seedActivities 回傳物件，使活動總數為 17、confirmed 活動為 12，且每筆新增活動都以唯一候選時段作為 confirmed slot；以既有「單一 transaction 建立」及「confirmed 活動」測試的更新斷言驗證。

## 3. 迴歸驗證

- [x] 3.1 執行 npm test -- --runInBand src/__tests__/seedActivities.test.js、npm test -- --runInBand 與 git diff --check，確認 seed 測試、完整 Jest 與 diff hygiene 全部通過，且不產生 schema、migration、API 文件或資料庫異動。
