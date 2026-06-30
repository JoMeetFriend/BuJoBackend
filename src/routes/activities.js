import { Router } from 'express'
import authenticate from '../middleware/authenticate.js'
import {
  createActivity,
  listActivities,
  getActivity,
  joinActivity,
  confirmFormation,
  cancelActivity,
  cancelJoin,
} from '../controllers/activityController.js'

const router = new Router()

router.get('/', authenticate, listActivities)
router.post('/', authenticate, createActivity)
router.get('/:id', authenticate, getActivity)
router.post('/:id/join', authenticate, joinActivity)
router.post('/:id/confirm-formation', authenticate, confirmFormation)
router.post('/:id/cancel', authenticate, cancelActivity)
router.delete('/:id/join', authenticate, cancelJoin)

export default router
