import express from 'express'
import { signup, login, logout, me, unlinkProvider } from '../controllers/authController.js'
import { googleLogin, googleLink } from '../controllers/googleAuthController.js'
import { lineCallback, lineLogin, lineLink } from '../controllers/lineAuthController.js'
import authenticate from '../middleware/authenticate.js'
import { loginLimiter, signupLimiter } from '../middleware/rateLimiter.js'

const router = express.Router()

router.post('/signup', signupLimiter, signup)
router.post('/login', loginLimiter, login)
router.post('/logout', logout)
router.get('/me', authenticate, me)
router.post('/google', loginLimiter, googleLogin)
router.post('/google/link', authenticate, googleLink)
router.get('/line', loginLimiter, lineLogin)
router.get('/line/link', authenticate, lineLink)
router.get('/line/callback', lineCallback)
router.delete('/:provider/unlink', authenticate, unlinkProvider)

export default router
