import { Router } from 'express'
import authenticate from '../middleware/authenticate.js'
import { placesLimiter } from '../middleware/rateLimiter.js'
import { autocompleteAddress } from '../controllers/placesController.js'

const router = new Router()

router.get('/autocomplete', authenticate, placesLimiter, autocompleteAddress)

export default router
