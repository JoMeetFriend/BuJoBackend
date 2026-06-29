import express from 'express'
import { signup, login, logout, me } from '../controllers/authController.js'
import { googleLogin } from '../controllers/googleAuthController.js'
import { lineCallback, lineLogin } from '../controllers/lineAuthController.js'
import authenticate from '../middleware/authenticate.js'
import { loginLimiter, signupLimiter } from '../middleware/rateLimiter.js'

const router = express.Router()

router.post('/signup', signupLimiter, signup)
router.post('/login', loginLimiter, login)
router.post('/logout', logout)
router.get('/me', authenticate, me)
router.post('/google', loginLimiter, googleLogin)
router.get('/line', loginLimiter, lineLogin)
router.get('/line/callback', lineCallback)

export default router
