import express from 'express'
import { signup, login, logout, me, unlinkProvider } from '../controllers/authController.js'
import { googleLogin, googleLink, googleCallback } from '../controllers/googleAuthController.js'
import { lineCallback, lineLogin, lineLink } from '../controllers/lineAuthController.js'
import authenticate from '../middleware/authenticate.js'
import { loginLimiter, signupLimiter } from '../middleware/rateLimiter.js'

const router = express.Router()

/**
 * @openapi
 * /api/auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: 註冊
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, display_name]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, description: 至少 8 個字元 }
 *               display_name: { type: string }
 *     responses:
 *       201:
 *         description: 註冊成功，設置 token cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     display_name: { type: string }
 *                     created_at: { type: string, format: date-time }
 *       400:
 *         description: 缺少欄位 / email 格式錯誤 / 密碼太短
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: email 已被註冊
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/signup', signupLimiter, signup)

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: 登入
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: 登入成功，設置 token cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/PublicUser' }
 *       400:
 *         description: 缺少欄位
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 帳號不存在 / 密碼錯誤
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/login', loginLimiter, login)

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: 登出（無需登入狀態）
 *     responses:
 *       200:
 *         description: 登出成功，清除 token cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 已登出 }
 */
router.post('/logout', logout)

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: 取得當前登入用戶
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: 回傳登入用戶資料
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   allOf:
 *                     - $ref: '#/components/schemas/PublicUser'
 *                     - type: object
 *                       properties:
 *                         created_at: { type: string, format: date-time }
 *                         identities:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               provider: { type: string, enum: [local, google, line] }
 *                               email: { type: string, nullable: true }
 *       401:
 *         description: 未登入 / token 無效或已過期
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 用戶不存在
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/me', authenticate, me)

/**
 * @openapi
 * /api/auth/google:
 *   get:
 *     tags: [Auth]
 *     summary: 開始 Google 登入（302 導向 Google 授權頁）
 *     responses:
 *       302:
 *         description: 導向 Google 授權頁；建立 user_id=null 的一次性 OAuth attempt
 */
router.get('/google', loginLimiter, googleLogin)

/**
 * @openapi
 * /api/auth/google/link:
 *   get:
 *     tags: [Auth]
 *     summary: 綁定 Google 帳號（302 導向 Google 授權頁）
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       302:
 *         description: 以目前登入者 ID 建立一次性 OAuth attempt，導向 Google 授權頁
 */
router.get('/google/link', authenticate, googleLink)

/**
 * @openapi
 * /api/auth/google/callback:
 *   get:
 *     tags: [Auth]
 *     summary: Google OAuth callback（login 或 link，依 OAuth attempt 的 user_id 判斷）
 *     description: >
 *       會先驗證並消耗 `state`；缺失、不存在、過期或已消耗的 state 固定導向
 *       `/login?error=google_login_failed`，且不交換 token、不建立 identity 或簽發 cookie。
 *       login 成功導向 `/` 並簽發 token cookie；login 取消/失敗導向
 *       `/login?error=google_cancelled` 或 `/login?error=google_login_failed`。
 *       link 成功導向 `/profile/edit?linked=google`（不簽發新 cookie）；link 取消/失敗導向
 *       `/profile/edit?error=google_link_cancelled` 或 `/profile/edit?error=google_link_failed`。
 *     parameters:
 *       - in: query
 *         name: code
 *         schema: { type: string }
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *       - in: query
 *         name: error
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: 依 login/link 與成功/取消/失敗導向前端對應頁面
 */
router.get('/google/callback', googleCallback)

/**
 * @openapi
 * /api/auth/line:
 *   get:
 *     tags: [Auth]
 *     summary: 開始 LINE 登入（302 導向 LINE 授權頁）
 *     responses:
 *       302:
 *         description: 導向 LINE 授權頁（bot_prompt=normal）；建立 user_id=null 的一次性 OAuth attempt
 */
router.get('/line', loginLimiter, lineLogin)

/**
 * @openapi
 * /api/auth/line/link:
 *   get:
 *     tags: [Auth]
 *     summary: 綁定 LINE 帳號（302 導向 LINE 授權頁）
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       302:
 *         description: 以目前登入者 ID 建立一次性 OAuth attempt，導向 LINE 授權頁（bot_prompt=aggressive）
 */
router.get('/line/link', authenticate, lineLink)

/**
 * @openapi
 * /api/auth/line/callback:
 *   get:
 *     tags: [Auth]
 *     summary: LINE OAuth callback（login 或 link，依 OAuth attempt 的 user_id 判斷）
 *     description: >
 *       會先驗證並消耗 `state`；缺失、不存在、過期或已消耗的 state 固定導向
 *       `/login?error=line_login_failed`，且不交換 token、不建立 identity 或簽發 cookie。
 *       login 成功導向 `/` 並簽發 token cookie；login 取消/失敗導向
 *       `/login?error=line_cancelled` 或 `/login?error=line_login_failed`。
 *       link 成功導向 `/profile/edit?linked=line`（不簽發新 cookie）；link 取消/失敗導向
 *       `/profile/edit?error=line_link_cancelled` 或 `/profile/edit?error=line_link_failed`。
 *     parameters:
 *       - in: query
 *         name: code
 *         schema: { type: string }
 *       - in: query
 *         name: state
 *         schema: { type: string }
 *       - in: query
 *         name: error
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: 依 login/link 與成功/取消/失敗導向前端對應頁面
 */
router.get('/line/callback', lineCallback)

/**
 * @openapi
 * /api/auth/{provider}/unlink:
 *   delete:
 *     tags: [Auth]
 *     summary: 解除第三方登入方式的連結
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema: { type: string, enum: [local, google, line] }
 *     responses:
 *       200:
 *         description: 已解除連結
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       400:
 *         description: 不支援的登入方式 / 無法解除最後一個登入方式，請先新增其他登入方式
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 該登入方式未連結
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.delete('/:provider/unlink', authenticate, unlinkProvider)

export default router
