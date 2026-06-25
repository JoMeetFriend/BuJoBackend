import express from 'express'
import { signup, login, logout, me } from '../controllers/authController.js'
import { googleLogin } from '../controllers/googleAuthController.js'
import authenticate from '../middleware/authenticate.js'

const router = express.Router()

router.post('/signup', signup)
router.post('/login', login)
router.post('/logout', logout)
router.get('/me', authenticate, me)
router.post('/google', googleLogin)

export default router
