## 1. 後端驗證：deadline 必須在未來

- [x] 1.1 寫失敗測試：`POST /activities` 帶一個已經過去的 `deadline`（情境一，全固定）回 400，且不建立任何 Activity/ActivitySchedule 記錄（對應規格 Activity deadline must be in the future at creation time）
- [x] 1.2 執行測試確認失敗
- [x] 1.3 在 `createActivity` 的必填驗證區塊（`title`/`deadline` 檢查之後、四個情境分支判斷之前）新增：`new Date(deadline) <= new Date()` 時回 400，訊息提示創建者調整流團設定或活動時間（對應規格 Deadline already in the past is rejected）
- [x] 1.4 執行測試確認通過
- [x] 1.5 寫失敗測試：`deadline` 等於目前伺服器時間時回 400（對應規格 Deadline equal to now is rejected）
- [x] 1.6 執行測試確認失敗 → 確認 1.3 的比較邏輯已涵蓋此邊界 → 執行測試確認通過
- [x] 1.7 寫測試：合法的未來 `deadline` 仍可正常建立活動（對應規格 Valid future deadline is accepted）
- [x] 1.8 執行測試確認通過（回歸測試，鎖住現況行為）
- [x] 1.9 寫測試：分別對情境 b/c/d（`isVotingB`/`isVotingC`/`isVotingD`）帶已過期 `deadline` 都回 400（對應規格 Validation applies to every scheduling scenario）
- [x] 1.10 執行測試確認失敗 → 確認驗證點在四個情境分支判斷之前執行 → 執行測試確認通過
- [x] 1.11 執行整套後端測試套件，確認既有情境一/二/三/四建立活動測試無回歸
- [x] 1.12 Commit
