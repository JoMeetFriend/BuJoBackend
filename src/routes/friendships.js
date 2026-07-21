import express from "express";
import authenticate from "../middleware/authenticate.js";
import {
  acceptFriendship,
  rejectFriendship,
  requestFriendship,
} from "../controllers/friendshipController.js";
import { removeFriendship } from "../controllers/friendshipController.js";

const router = express.Router();

/**
 * @openapi
 * /api/friendships/request:
 *   post:
 *     tags: [Friendships]
 *     summary: 發送好友邀請並通知對方
 *     description: >
 *       建立 pending friendship，並建立給對方的 friend_request_created 站內通知。
 *       若對方有 LINE Login identity、LINE 通知偏好未關閉，且 LINE_PUSH_ENABLED=true，
 *       後端會嘗試用 LINE Official Account 推播同一則通知（best-effort side effect）。
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [receiver_id]
 *             properties:
 *               receiver_id: { type: string, format: uuid, description: 對方的 User ID }
 *     responses:
 *       201:
 *         description: 好友邀請已送出
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 好友邀請已送出 }
 *                 friendship: { $ref: '#/components/schemas/Friendship' }
 *       400:
 *         description: 缺少 receiver_id / 不能加自己為好友
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 未登入 / token 無效或已過期
 *       404:
 *         description: 找不到使用者
 *       409:
 *         description: >
 *           已經是好友（"已經是好友"）/ 已有 pending 邀請（依身份回傳
 *           "已送出好友邀請" 或 "對方已邀請你"）/ 其他非終態關係（"目前無法送出好友邀請"）
 */
router.post("/request", authenticate, requestFriendship);

/**
 * @openapi
 * /api/friendships/{id}/accept:
 *   post:
 *     tags: [Friendships]
 *     summary: 接受好友邀請並通知邀請者
 *     description: >
 *       只有被邀請者可以接受。friendship 狀態改為 accepted，並建立給邀請者的
 *       friend_request_accepted 站內通知（同樣可能觸發 LINE 推播 best-effort）。
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: friendship 的 ID
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 已接受好友邀請
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 已接受好友邀請 }
 *                 friendship: { $ref: '#/components/schemas/Friendship' }
 *       400:
 *         description: 此好友邀請無法接受
 *       401:
 *         description: 未登入 / token 無效或已過期
 *       403:
 *         description: 只有被邀請者可以接受好友邀請
 *       404:
 *         description: 找不到好友邀請
 */
router.post("/:id/accept", authenticate, acceptFriendship);

/**
 * @openapi
 * /api/friendships/{id}/reject:
 *   post:
 *     tags: [Friendships]
 *     summary: 拒絕好友邀請
 *     description: 只有被邀請者可以拒絕。拒絕後 friendship 狀態改為 rejected，不會建立通知。
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: friendship 的 ID
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 已拒絕好友邀請
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 已拒絕好友邀請 }
 *                 friendship: { $ref: '#/components/schemas/Friendship' }
 *       400:
 *         description: 此好友邀請無法拒絕
 *       401:
 *         description: 未登入 / token 無效或已過期
 *       403:
 *         description: 只有被邀請者可以拒絕好友邀請
 *       404:
 *         description: 找不到好友邀請
 */
router.post("/:id/reject", authenticate, rejectFriendship);

/**
 * @openapi
 * /api/friendships/{id}:
 *   delete:
 *     tags: [Friendships]
 *     summary: 刪除好友（軟刪除）
 *     description: >
 *       路徑上的 `id` 必須是 friendship 的 ID，不是對方的 user ID。只有該好友關係的雙方當事人
 *       可以執行刪除，且該關係狀態必須為 accepted，刪除後狀態變更為 deleted。
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: friendship 的 ID
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 已刪除好友
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 已刪除好友 }
 *                 friendship: { $ref: '#/components/schemas/Friendship' }
 *       400:
 *         description: 此狀態無法刪除好友（非 accepted）
 *       401:
 *         description: 未登入 / token 無效或已過期
 *       403:
 *         description: 無權操作此好友關係（非雙方當事人）
 *       404:
 *         description: 找不到該好友關係
 */
router.delete("/:id", authenticate, removeFriendship);

export default router;
