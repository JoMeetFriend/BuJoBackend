import express from "express";
import * as friendController from "../controllers/friend.controller.js";
import authenticate from "../middleware/authenticate.js";

const router = express.Router();

router.use(authenticate);

/**
 * @openapi
 * /api/friends:
 *   get:
 *     tags: [Friends]
 *     summary: 取得好友列表
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: 好友資料陣列
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/PublicUser' }
 *       401:
 *         description: 未登入 / token 無效
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/", friendController.getFriends);

export default router;
