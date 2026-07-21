import { Router } from 'express'
import authenticate from '../middleware/authenticate.js'
import { placesLimiter } from '../middleware/rateLimiter.js'
import { autocompleteAddress } from '../controllers/placesController.js'

const router = new Router()

/**
 * @openapi
 * /api/places/autocomplete:
 *   get:
 *     tags: [Places]
 *     summary: 地址自動完成
 *     description: >
 *       透過 LocationIQ 查詢地址建議。查詢字串少於 2 字元時直接回傳空陣列，不會呼叫外部服務。
 *       結果有記憶體快取。
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: 搜尋關鍵字，至少 2 字元
 *       - in: query
 *         name: global
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: 是否搜尋全球範圍（預設限制在特定區域）
 *     responses:
 *       200:
 *         description: 地址建議列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items: { type: string, description: 完整地址字串 }
 *       401:
 *         description: 未登入
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       502:
 *         description: 地址搜尋服務暫時無法使用
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/autocomplete', authenticate, placesLimiter, autocompleteAddress)

export default router
