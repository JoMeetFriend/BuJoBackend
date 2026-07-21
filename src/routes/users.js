import express from "express";
import * as userController from "../controllers/user.controller.js";
import authenticate from "../middleware/authenticate.js";
import { uploadAvatar } from "../middleware/avatarUpload.js";

const router = express.Router();

/**
 * @openapi
 * /api/users/me/avatar:
 *   patch:
 *     tags: [Users]
 *     summary: 更換目前使用者頭像
 *     description: >
 *       需用 multipart/form-data 上傳圖片檔，欄位名稱固定為 avatar。後端會上傳到 Cloudinary
 *       並把新的 avatar_url 寫回使用者資料；若原本已有 Cloudinary 頭像，更新成功後會嘗試刪除舊圖。
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: JPG、PNG 或 WebP 圖片，最大 2MB
 *     responses:
 *       200:
 *         description: 頭像更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/PublicUser' }
 *       400:
 *         description: 未附檔案 / 檔案格式不支援 / 其他上傳失敗（例如附了超過 1 個檔案）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 未登入 / token 無效或已過期
 *       404:
 *         description: 用戶不存在
 *       413:
 *         description: 圖片超過 2MB
 */
router.patch(
  "/me/avatar",
  authenticate,
  uploadAvatar,
  userController.updateMyAvatar,
);

/**
 * @openapi
 * /api/users/me/name:
 *   patch:
 *     tags: [Users]
 *     summary: 更換目前使用者名稱
 *     description: 後端會清除前後空白字元，並驗證長度與格式，不可為空白且不可超過 50 個字元。
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [display_name]
 *             properties:
 *               display_name: { type: string, maxLength: 50 }
 *     responses:
 *       200:
 *         description: 名稱更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 名稱更新成功 }
 *                 user: { $ref: '#/components/schemas/PublicUser' }
 *       400:
 *         description: 無效的名稱格式 / 名稱不可為空白 / 超過 50 字元
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 未登入 / token 無效或已過期
 *       500:
 *         description: 伺服器內部錯誤
 */
router.patch("/me/name", authenticate, userController.updateMyName);

/**
 * @openapi
 * /api/users/me/bio:
 *   patch:
 *     tags: [Users]
 *     summary: 更新目前使用者簡介
 *     description: >
 *       後端自動清除字串前後空白，並驗證長度不可超過 150 個字元；允許傳入空字串或純空白字串來清空簡介。
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bio]
 *             properties:
 *               bio: { type: string, maxLength: 150 }
 *     responses:
 *       200:
 *         description: 簡介更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 簡介更新成功 }
 *                 user: { $ref: '#/components/schemas/PublicUser' }
 *       400:
 *         description: 無效的簡介格式 / 簡介超過 150 個字元
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 未登入 / token 無效或已過期
 *       500:
 *         description: 伺服器內部錯誤
 */
router.patch("/me/bio", authenticate, userController.updateMyBio);

/**
 * @openapi
 * /api/users/search:
 *   get:
 *     tags: [Users]
 *     summary: 搜尋使用者
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, pattern: '^[0-9a-fA-F]{5}$' }
 *         description: 必須為精準 5 碼的 16 進位字串（使用者 ID 後 5 碼），不分大小寫
 *     responses:
 *       200:
 *         description: 符合的使用者陣列
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/PublicUser' }
 *       400:
 *         description: 無效的搜尋格式（非 5 碼或包含非法字元）
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 未登入
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get("/search", authenticate, userController.searchUsers);

export default router;
