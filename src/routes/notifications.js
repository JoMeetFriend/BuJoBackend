import express from "express";
import authenticate from "../middleware/authenticate.js";
import {
  dismissNotification,
  listNotifications,
  markAllRead,
  markRead,
  getUnreadCount,
} from "../controllers/notificationController.js";

const router = express.Router();

/**
 * @openapi
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: 取得通知列表
 *     description: >
 *       後端組好通知文字、分類、actor 與可操作 action，前端可直接渲染。列表排除
 *       `dismissed_at` 已有值的通知；已讀但尚未 dismiss 的通知仍會回傳。
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: 目前登入者的通知列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Notification' }
 *       401:
 *         description: 未登入 / token 無效或已過期
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/", authenticate, listNotifications);

/**
 * @openapi
 * /api/notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: 取得未讀通知數
 *     description: 供通知按鈕/頁面顯示 badge，不需要拉取整個通知列表。
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: 未讀通知數
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unreadCount: { type: integer, example: 3 }
 *       401:
 *         description: 未登入 / token 無效或已過期
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/unread-count", authenticate, getUnreadCount);

/**
 * @openapi
 * /api/notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: 全部通知標記已讀
 *     description: 只會更新目前登入者的未讀通知。
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: 已全部標記為已讀
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 已全部標記為已讀 }
 *                 count: { type: integer, example: 3 }
 *       401:
 *         description: 未登入 / token 無效或已過期
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch("/read-all", authenticate, markAllRead);

/**
 * @openapi
 * /api/notifications/{id}/dismiss:
 *   patch:
 *     tags: [Notifications]
 *     summary: 永久隱藏通知
 *     description: >
 *       只能操作自己的尚未隱藏通知。成功時同一次更新會將通知設為已讀並寫入 `dismissed_at`；
 *       資料列仍保留於資料庫供稽核，但不再出現在正常通知列表，也不提供復原入口。
 *       `friend_request_created` 對應的 friendship 仍為 pending 時不可 dismiss，須先接受或拒絕。
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 已將通知標記已讀並永久隱藏
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 已移除通知 }
 *       401:
 *         description: 未登入 / token 無效或已過期
 *       404:
 *         description: 通知不存在、不屬於使用者或已經 dismiss
 *       409:
 *         description: 待處理的好友邀請尚不可移除
 */
router.patch("/:id/dismiss", authenticate, dismissNotification);

/**
 * @openapi
 * /api/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: 標記單筆通知已讀
 *     description: 只能標記自己的通知。
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 已標記為已讀
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 已標記為已讀 }
 *       401:
 *         description: 未登入 / token 無效或已過期
 *       404:
 *         description: 找不到通知
 */
router.patch("/:id/read", authenticate, markRead);

export default router;
