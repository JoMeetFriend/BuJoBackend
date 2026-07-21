import { Router } from 'express'
import authenticate from '../middleware/authenticate.js'
import { chatMessageLimiter } from '../middleware/rateLimiter.js'
import { createMessage, listMessages } from '../controllers/chatController.js'

const router = new Router()

router.post('/:id/messages', authenticate, chatMessageLimiter, createMessage)
router.get('/:id/messages', authenticate, listMessages)

export default router
