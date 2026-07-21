import { Router } from 'express'
import authenticate from '../middleware/authenticate.js'
import {
  createActivity,
  listActivities,
  getActivity,
  joinActivity,
  getRankedSlots,
  confirmFormation,
  cancelActivity,
  cancelJoin,
} from '../controllers/activityController.js'

const router = new Router()

/**
 * @openapi
 * /api/activities:
 *   get:
 *     tags: [Activities]
 *     summary: 取得活動列表
 *     description: >
 *       回傳「我已報名的活動（非已取消）」加上「好友建立、揪團中、我還沒加入」的活動，
 *       依建立時間新到舊排序。每筆為活動卡片摘要，非完整詳情。
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: 活動卡片列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activities:
 *                   type: array
 *                   items:
 *                     type: object
 *                     additionalProperties: true
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       title: { type: string }
 *                       location: { type: string }
 *                       status: { type: string, enum: [recruiting, voting, confirmed, cancelled] }
 *                       is_creator: { type: boolean }
 *                       has_joined: { type: boolean }
 *                       creator: { $ref: '#/components/schemas/PublicUser' }
 *                       date: { type: string, description: "顯示用短日期，例如 8/1" }
 *                       date_iso: { type: string, nullable: true, description: 只有已成團才有值 }
 *                       confirmed_start: { type: string, format: date-time, nullable: true }
 *                       time: { type: string, description: "顯示用時間文字，或「投票中」" }
 *                       current_count: { type: integer }
 *                       participant_target: { type: integer, nullable: true }
 *       401:
 *         description: 未登入
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/', authenticate, listActivities)

/**
 * @openapi
 * /api/activities:
 *   post:
 *     tags: [Activities]
 *     summary: 建立活動（四種排程情境擇一）
 *     description: >
 *       依送出的欄位判斷情境：情境一（固定時段，送 `startDate`/`startTime`/`endDate`/`endTime`/`allDay`）、
 *       情境二 / range 模式（送 `singleDate`，選填 `timeWindowStart`/`timeWindowEnd`）、
 *       情境三（送 `candidateDates[]` + `uniformTime`，統一時間套用到每個候選日）、
 *       情境四（送 `dateSlots[]`，每個候選日期各自帶 `date`/`startTime`/`endTime`，且日期不可重複）。
 *
 *       `deadline` 為建立者選擇的報名截止時間（寫入 `vote_deadline_at`），伺服器會依情境公式
 *       另外算出決策硬截止天花板 `deadline_at`（不接受客戶端輸入，保證不晚於活動實際發生時間）：
 *       情境一為活動開始時間；range 模式為 `timeWindowStart`（未提供則 `singleDate`）；
 *       情境三／四為所有候選時段中最晚一筆的開始時間。
 *
 *       驗證順序：① 伺服器算出的 `deadline_at` 必須晚於現在，否則 400；
 *       ② 送出的 `deadline` 必須早於算出的 `deadline_at`，否則 400。
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, deadline]
 *             properties:
 *               title: { type: string, maxLength: 15 }
 *               location: { type: string }
 *               limit: { type: integer, description: participant_target }
 *               note: { type: string }
 *               type: { type: string, description: 活動分類 category }
 *               deadline: { type: string, format: date-time, description: 報名截止時間 }
 *               startDate: { type: string, description: "情境一：YYYY/MM/DD" }
 *               startTime: { type: string, description: "情境一：HH:MM，選填" }
 *               endDate: { type: string }
 *               endTime: { type: string }
 *               allDay: { type: boolean }
 *               singleDate: { type: string, description: "情境二：活動固定日期 YYYY/MM/DD" }
 *               timeWindowStart: { type: string, description: "情境二：允許回報的時間範圍起點 HH:MM，選填" }
 *               timeWindowEnd: { type: string, description: "情境二：允許回報的時間範圍終點 HH:MM，選填" }
 *               candidateDates:
 *                 type: array
 *                 items: { type: string }
 *                 description: "情境三：候選日期列表"
 *               uniformTime:
 *                 type: object
 *                 description: "情境三：統一時間"
 *                 properties:
 *                   allDay: { type: boolean }
 *                   startTime: { type: string }
 *                   endTime: { type: string }
 *               dateSlots:
 *                 type: array
 *                 description: "情境四：每個候選日期各自的時段，日期不可重複"
 *                 items:
 *                   type: object
 *                   properties:
 *                     date: { type: string }
 *                     startTime: { type: string }
 *                     endTime: { type: string }
 *     responses:
 *       201:
 *         description: 建立成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activity:
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid }
 *       400:
 *         description: 欄位驗證失敗（缺少必填欄位 / 日期格式錯誤 / 時間邏輯錯誤 / 截止時間不合法）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/', authenticate, createActivity)

/**
 * @openapi
 * /api/activities/{id}:
 *   get:
 *     tags: [Activities]
 *     summary: 取得活動詳情
 *     description: >
 *       GET 觸發 lazy 狀態轉換：報名截止（`vote_deadline_at` 已過）時 recruiting 轉為 voting 或 cancelled；
 *       voting 狀態逾期（`deadline_at` 已到）且建立者尚未手動確認時自動轉為 cancelled。
 *
 *       `decision_candidates` 只有建立者（`is_creator: true`）的回應才會附上完整資料，非建立者一律為 `null`；
 *       非建立者要看「跟自己同時段的人」，改看 `my_ranges[]`（range 模式）或 `candidate_slots[]`
 *       （find_date / find_date_time）裡的 `co_participants` 欄位。`decision_candidates` 依
 *       `schedule_variant` 分三種格式：range 模式為單一排序陣列；find_date 為扁平候選時段陣列；
 *       find_date_time 為候選時段外層陣列，每筆再帶內層 `segments` 子區間交集運算結果。
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 活動詳情
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activity: { $ref: '#/components/schemas/Activity' }
 *       404:
 *         description: 活動不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:id', authenticate, getActivity)

/**
 * @openapi
 * /api/activities/{id}/join:
 *   post:
 *     tags: [Activities]
 *     summary: 報名活動 / 重新回報可用時間
 *     description: >
 *       依情境送不同 body：range 模式送 `{ ranges: [{start, end}] }`；find_date / find_date_time
 *       （投票制）送 `{ candidateSlotIds: [] }`，find_date_time 可另外附上
 *       `candidateSlotRanges: [{candidateSlotId, rangeStart, rangeEnd}]` 記錄自選子區間。
 *       固定情境（不需投票）不需要 body。已報名者可在 recruiting（find_date_time 亦可在部分情境的
 *       resubmission 規則下）重新呼叫送出新答案，後端會先刪除舊回報再寫入新的。
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ranges:
 *                 type: array
 *                 description: "range 模式必填：一段或多段可用時間"
 *                 items:
 *                   type: object
 *                   properties:
 *                     start: { type: string, format: date-time }
 *                     end: { type: string, format: date-time }
 *               candidateSlotIds:
 *                 type: array
 *                 description: "find_date / find_date_time 必填：選擇的候選時段 ID"
 *                 items: { type: string, format: uuid }
 *               candidateSlotRanges:
 *                 type: array
 *                 description: "find_date_time 選填：對應 candidateSlotIds 的自選子區間"
 *                 items:
 *                   type: object
 *                   properties:
 *                     candidateSlotId: { type: string, format: uuid }
 *                     rangeStart: { type: string, format: date-time }
 *                     rangeEnd: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: 報名 / 重新回報成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 報名成功 }
 *       400:
 *         description: >
 *           不能報名自己建立的活動 / 已截止報名（vote_deadline_at 已過）/
 *           此活動不在揪團中 / 人數已滿 / 已報名 / ranges 或候選時段驗證失敗
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 活動不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/:id/join', authenticate, joinActivity)

/**
 * @openapi
 * /api/activities/{id}/ranked-slots:
 *   get:
 *     tags: [Activities]
 *     summary: 取得排序後的候選時段（尚未實作）
 *     deprecated: true
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       400:
 *         description: 此功能尚未支援
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:id/ranked-slots', authenticate, getRankedSlots)

/**
 * @openapi
 * /api/activities/{id}/confirm-formation:
 *   post:
 *     tags: [Activities]
 *     summary: 建立者確認成團
 *     description: >
 *       只有建立者可以呼叫。range 模式送 `{ slotStart, slotEnd }`，須與目前 `decision_candidates`
 *       中某一筆完全相符；find_date 送 `{ candidateSlotId }`（任何屬於此活動的候選時段皆可，不限並列最高票）；
 *       find_date_time 送 `{ candidateSlotId, slotStart, slotEnd }`，`slotStart`/`slotEnd` 須與該候選時段
 *       `decision_candidates[].segments` 中某一筆完全相符。固定情境不需要 body（直接採用唯一候選時段）。
 *       range 模式與 find_date_time 會在確認當下才臨時建立新的候選時段（存算出來的窄窗口）。
 *       不接受確認一個開始時間已經過去的時段。人數滿額不會自動成團，一律要建立者呼叫此 API。
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               candidateSlotId: { type: string, format: uuid }
 *               slotStart: { type: string, format: date-time }
 *               slotEnd: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: 成團成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 成團成功 }
 *       400:
 *         description: 不允許確認成團（狀態不對）/ 時段不在候選名單中
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: 只有創建者可以確認成團
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 活動不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: 此活動狀態已被異動，請重新整理後再試
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/:id/confirm-formation', authenticate, confirmFormation)

/**
 * @openapi
 * /api/activities/{id}/cancel:
 *   post:
 *     tags: [Activities]
 *     summary: 建立者取消活動
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 活動已取消
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 活動已取消 }
 *       400:
 *         description: 此活動無法取消（已是 cancelled 或 confirmed）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: 只有創建者可以取消活動
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 活動不存在
 *       409:
 *         description: 此活動狀態已被異動，請重新整理後再試
 */
router.post('/:id/cancel', authenticate, cancelActivity)

/**
 * @openapi
 * /api/activities/{id}/join:
 *   delete:
 *     tags: [Activities]
 *     summary: 取消報名
 *     description: 只能在活動狀態為 recruiting 時取消，會一併刪除已回報的可用時間 / 候選時段選擇。
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 已取消報名
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 已取消報名 }
 *       400:
 *         description: 此活動狀態不允許取消報名 / 你尚未報名此活動
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 活動不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.delete('/:id/join', authenticate, cancelJoin)

export default router
