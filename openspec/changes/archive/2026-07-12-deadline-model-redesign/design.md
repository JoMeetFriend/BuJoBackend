## Context

`activityController.js` 用同一個 `deadline_at` 欄位在四個排程情境（A 固定時段、B range 模式、C `find_date`、D `find_date_time`）裡代表不同語意：情境三／四的 `getActivity` lazy check 用伺服器另外算的 `vote_deadline_at`（`latestSlotStart`）判斷招募截止，但 `joinActivity` 自己讀 `deadline_at`（由客戶端提交的 `deadline` 直接寫入）做另一套獨立判斷，兩者常態不同步。目前只有情境二（range 模式）有「決策緩衝期逾期未確認→自動取消」的 lazy check，且觸發欄位是 `vote_deadline_at` 而非本該用的決策硬截止；情境一／三／四完全沒有這個安全網。情境一到期後 `!requires_voting` 分支、以及 `decideFormationOutcome` 在候選時段全員一致時，都會讓活動不經建立者確認直接變成 `confirmed`。提早達標（`participant_target` 提前滿額）時的狀態轉換，情境一停在 `recruiting` 不變、情境二被 `if (targetReached && !isRangeMode)` 排除在外，只有情境三／四正確轉入 `voting` 並通知建立者。

這份 change 把 `deadline_at`／`vote_deadline_at` 的語意在四個情境裡統一成同一套公式，並讓「決策緩衝期逾期自動取消」「提早達標轉狀態」「候選時段是否已過期」這三件事在四個情境下行為一致。

## Goals / Non-Goals

**Goals:**

- `deadline_at`（決策硬截止天花板）在四個情境下都由伺服器依情境公式計算，不接受客戶端輸入，且保證不晚於活動實際發生時間
- `vote_deadline_at`（報名截止）在四個情境下都存在，由客戶端提交的 `deadline` 決定，且必須早於伺服器算出的 `deadline_at`
- 移除所有讓活動不經建立者確認就自動變成 `confirmed` 的路徑
- 「決策緩衝期（`voting` 狀態）逾期未確認→自動取消」這個安全網涵蓋全部四個情境，觸發依據統一是 `deadline_at`
- 「提早達標→轉入決策緩衝狀態並通知建立者」涵蓋全部四個情境
- `confirmFormation` 拒絕確認一個開始時間已經過去的候選時段/時段

**Non-Goals:**

- 不新增「`vote_deadline_at` 到期人數未達標，通知建立者要不要手動成團」這個新通知情境（其他組員的通知功能工作）
- 不改變 `confirmFormation` 各情境挑選候選時段的既有邏輯本身（情境三任選候選時段、情境四窄窗口挑選、range 模式臨時建立候選時段等），只新增過期檢查這一項
- 不涉及前端變更，前端在 `BuJo` repo 另開對應 change
- 不涉及「報名截止後隱藏卡片給非報名者」的存取限制功能

## Decisions

### `deadline` 欄位語意反轉：從天花板變成報名截止

**決策**：`POST /activities` 的 `deadline` 欄位不再直接寫入 `deadline_at`，改成寫入 `vote_deadline_at`。`deadline_at` 完全由伺服器依情境公式計算：

| 情境 | 判斷依據 | `deadline_at` 公式 |
|---|---|---|
| A（固定時段，`requires_voting=false`） | `!startDate` 分支不成立、且非 B/C/D | 活動本身的 `slot_start`（即 `buildFixedSlot` 算出的開始時間） |
| B（range 模式，`isVotingB`） | `!!singleDate && !startDate` 且非 C/D | `time_window_start ?? fixed_date` |
| C（`find_date`，`isVotingC`） | `candidateDates` 非空 | 所有候選時段中最晚一筆的 `slot_start`（沿用既有 `latestSlotStart` 算法） |
| D（`find_date_time`，`isVotingD`） | `dateSlots` 非空 | 所有候選時段中最晚一筆的 `slot_start`（沿用既有 `latestSlotStart` 算法） |

**理由**：`deadline_at` 的角色是「建立者完全沒動作時的安全網，絕對不能晚於活動實際發生時間」，這個保證只有伺服器依情境公式計算才能成立——如果繼續讓客戶端直接指定 `deadline_at`，無法防止建立者（或有 bug 的前端）送出一個晚於活動實際時間的值。`vote_deadline_at` 交給客戶端指定，因為「報名要開放到多早關閉」本來就是建立者的主觀選擇（對應前端的流團設定預設值），沒有一個伺服器能獨立算出的客觀答案。

**替代方案考慮過**：讓客戶端同時送 `deadline_at` 和 `vote_deadline_at` 兩個獨立欄位，伺服器只做交叉驗證。否決理由：這樣仍然讓客戶端有能力送出一個不合理的 `deadline_at`（例如晚於活動時間），且需要維護兩套欄位名稱的前後端契約，複雜度更高，不如直接讓伺服器算出唯一正確的天花板。

### 新增驗證：`vote_deadline_at` 必須早於伺服器算出的 `deadline_at`，且 `deadline_at` 必須晚於現在

**決策**：`createActivity` 依情境算出 `deadline_at` 候選值後：
1. 若 `deadline_at <= now`，拒絕建立（400，訊息說明活動時間已經過去或太接近）
2. 若客戶端送的 `deadline`（即將成為 `vote_deadline_at`）不早於算出的 `deadline_at`，拒絕建立（400，訊息說明報名截止時間需早於活動決策截止時間）
3. 兩項都通過才建立活動，`vote_deadline_at = new Date(deadline)`，`deadline_at` 用伺服器算出的值

第 1 項取代現有 `activity-deadline-validation` 的「`deadline` 必須晚於現在」需求（改成檢查對象是伺服器算出的 `deadline_at`，不是客戶端送的值）；第 2 項是新增的交叉驗證。

### 狀態機統一：四情境的「決策緩衝期」「逾期自動取消」「提早達標」共用同一套規則

**決策**：`getActivity` 的 lazy status check 拆成兩段，四情境共用：

1. **招募截止判斷**（`recruiting` 狀態下 `now >= vote_deadline_at`）：
   - 若設了 `participant_target` 且未達標 → `cancelled`
   - 若 range 模式（情境二）且未設 `participant_target` 且除建立者外無人提交可用時間 → `cancelled`（沿用既有邏輯）
   - 否則 → `voting`（不再呼叫 `decideFormationOutcome`，四情境到這裡一律進入決策緩衝狀態）
2. **決策緩衝期逾期判斷**（`voting` 狀態下 `now >= deadline_at` 且尚未 `confirmed`）→ `cancelled`，通知建立者與所有已報名參與者。取代現有只覆蓋情境二（`isRangeMode`）、且判斷式用 `vote_deadline_at` 的區塊。

`joinActivity` 提早達標（`targetReached`）時：拿掉 `!isRangeMode` 這個排除條件，四個情境一律轉入 `voting` 並通知建立者（`requiresVoting` 為 false 的情境一也要轉，不再停留在 `recruiting`）。

**理由**：現有程式碼四個情境各自為政（情境一停留不轉狀態、情境二被排除、只有三/四正確），不是「沿用既有邏輯」可以蓋過去的既有一致行為，必須明確統一寫成同一段共用邏輯，不能分散在各情境的特例分支裡。

### 移除 `decideFormationOutcome`／`getLeaderSlots`

**決策**：這兩個函式的唯一用途（候選時段全員一致時自動 `confirmed`）被移除後，`getLeaderSlots` 對任何情境都會回傳 `isUnanimous: false`（因為呼叫端不再需要這個判斷），`decideFormationOutcome` 恆定回傳 `{status: 'voting', winningSlot: null}`。直接刪除這兩個函式，呼叫端改成直接指定 `nextStatus = 'voting'`。

### `confirmFormation`：新增過期候選時段檢查 + 放寬情境一的狀態檢查

**決策**：在 `confirmFormation` 找到 `winningSlot`／`matched`（range 模式跟情境四是臨時算出的窄窗口）之後、寫入資料庫之前，統一檢查其 `slot_start`（或 range 模式/情境四算出的 `start`）是否已經早於現在，若是則拒絕（400，訊息說明該時段已經過去，請重新選擇）。四個情境的確認邏輯分支都要加這個檢查。

情境一（`!requiresVoting`）分支目前的狀態檢查 `if (activity.status !== 'recruiting')` 要放寬成 `if (activity.status !== 'recruiting' && activity.status !== 'voting')`，跟其他情境的檢查方式一致——因為狀態機統一後，情境一也會在 `vote_deadline_at` 到期時轉入 `voting`，若不放寬，情境一活動一旦進入 `voting` 就無法再呼叫 `confirmFormation`，只能等 `deadline_at` 到期被自動取消，等於建立者完全無法補救。

### `joinActivity` 報名截止檢查改用 `vote_deadline_at`

**決策**：`joinActivity` 開頭的 `if (activity.schedule && activity.schedule.deadline_at < new Date())` 改成讀 `activity.schedule.vote_deadline_at`，跟 `getActivity` 的招募截止判斷邏輯（同樣讀 `vote_deadline_at`）保持一致，不再各自獨立判斷。

## Implementation Contract

**Behavior**：
- `POST /activities` 的 `deadline` 欄位現在代表「報名截止時間」，寫入 `vote_deadline_at`；回應/後續 GET 活動詳情時，`deadline_at` 反映伺服器依情境算出的決策硬截止天花板，兩者都會出現在 `GET /api/activities/:id` 的回應裡
- 建立活動時，若 `deadline` 造成 `vote_deadline_at >= 伺服器算出的 deadline_at`，或伺服器算出的 `deadline_at <= 現在`，回應 400，不建立任何 `Activity`/`ActivitySchedule`/`ActivityCandidateSlot` 記錄
- 任何情境的活動，一旦不經 `confirmFormation` 手動確認，都不會自轉為 `confirmed`；`recruiting`→`voting`（招募截止或提早達標）→`confirmed`（手動確認）或 `cancelled`（`deadline_at` 逾期未確認，或招募截止未達標）是唯一的狀態轉換路徑
- `confirmFormation` 對開始時間已經過去的候選時段/時段一律回應 400，不寫入任何確認記錄
- `joinActivity` 對 `vote_deadline_at` 已過期的活動回應 400（「此活動已截止報名」），不受 `deadline_at` 影響

**Interface / data shape**：
- `POST /activities` 請求體 `deadline` 欄位：ISO8601 字串，語意為建立者選擇的報名截止時間（寫入 `vote_deadline_at`），不再是決策硬截止
- `ActivitySchedule.deadline_at`：所有四個情境都會有值，型別維持 `DateTime`，伺服器計算、不接受客戶端輸入
- `ActivitySchedule.vote_deadline_at`：所有四個情境都會有值（情境一目前完全沒有這個欄位，這次新增），由客戶端 `deadline` 決定
- `confirmFormation` 錯誤回應格式沿用既有 400 `{ message: string }` 形狀，新增的過期時段錯誤訊息需說明「時段已過去，請重新選擇」

**Failure modes**：
- 建立活動時 `vote_deadline_at` 不早於 `deadline_at`、或 `deadline_at` 不晚於現在：400，不建立任何記錄（fail closed，不做部分建立）
- `confirmFormation` 選到已過期的候選時段：400，活動狀態不變，不寫入 `confirmed_slot_id`
- lazy check 的樂觀鎖（`updateMany where status=...`）行為維持既有模式，併發請求下沒搶到的一方重新讀取最新狀態回傳，不重複建立通知

**Acceptance criteria**：
- Jest + Supertest 整合測試涵蓋四個情境各自的 `deadline_at`／`vote_deadline_at` 計算公式
- 整合測試涵蓋：情境一到期不再自動 `confirmed`，改為轉入 `voting`；`decideFormationOutcome`／`getLeaderSlots` 相關的舊測試斷言（若有斷言自動成團行為）需更新為斷言轉入 `voting`
- 整合測試涵蓋四情境的「決策緩衝期逾期未確認自動取消」與「提早達標轉入決策緩衝狀態」
- 整合測試涵蓋 `confirmFormation` 拒絕已過期候選時段（至少涵蓋情境三/四各一個案例，因為這是最容易踩到的情境）
- 整合測試涵蓋情境一在 `voting` 狀態下仍可成功呼叫 `confirmFormation`
- `joinActivity` 既有的截止檢查測試更新為驗證 `vote_deadline_at`，不是 `deadline_at`

**Scope boundaries**：
- In scope：`src/controllers/activityController.js` 的 `createActivity`／`getActivity`／`joinActivity`／`confirmFormation`／刪除 `decideFormationOutcome`／`getLeaderSlots`；`API_DOCS.md` 的對應欄位說明更新
- Out of scope：任何前端檔案；新通知型別／新通知情境；`prisma/schema.prisma` 不需要異動（`deadline_at`／`vote_deadline_at` 欄位已存在，只是情境一目前沒有寫入 `vote_deadline_at`，不是欄位不存在）

## Risks / Trade-offs

- **[Risk] `deadline` 欄位語意反轉是 breaking change，若前端沒有同步更新會建立出語意錯誤的活動** → Mitigation：這是刻意的設計決策，前端的對應 change 會在後端這份 change 完成後才開始；後端這份 change 完成並 merge 前，前端不應該呼叫新版 API
- **[Risk] 情境一從「到期直接 confirmed」改成「到期進入 voting、等待手動確認」，若建立者沒有回來確認，活動會在 `deadline_at`（=活動本身開始時間）被自動取消，過去這種情況會直接成團** → Mitigation：這是這次重新設計要達成的目標本身（不允許建立者不知情下自動成團），影響範圍是既有種子資料/測試資料若斷言舊行為需要一併更新
- **[Risk] `decideFormationOutcome`／`getLeaderSlots` 刪除後，若有其他呼叫端（例如未來的通知功能）依賴這兩個函式的「一致度」判斷邏輯** → Mitigation：目前已用 grep 確認整個 controller 只有 `getActivity` 這一處呼叫，刪除前應再次全域搜尋確認沒有其他呼叫端

## Migration Plan

- 不需要 Prisma migration（`deadline_at`／`vote_deadline_at` 欄位已存在於 schema，只是情境一目前建立時沒有寫入 `vote_deadline_at`）
- 既有已建立、尚未進入終態（`recruiting`/`voting`）的活動資料，`deadline_at` 是舊語意（客戶端直接指定的值，未必符合新公式）；這份 change 不回填既有資料，只影響之後新建立的活動。若既有資料的 `deadline_at` 恰好晚於實際活動時間，lazy check 邏輯改變後行為可能與建立當下的預期不同，屬已知限制，不在這份 change 處理

## Open Questions

（無）
