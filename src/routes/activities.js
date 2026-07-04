import { Router } from 'express'
import authenticate from '../middleware/authenticate.js'
import {
  createActivity,
  listActivities,
  getActivity,
  joinActivity,
  getRankedSlots,
  confirmFormation,
  startTiebreak,
  submitTiebreakVote,
  cancelActivity,
  cancelJoin,
} from '../controllers/activityController.js'

const router = new Router()

router.get('/', authenticate, listActivities)
router.post('/', authenticate, createActivity)
router.get('/:id', authenticate, getActivity)
router.post('/:id/join', authenticate, joinActivity)
router.get('/:id/ranked-slots', authenticate, getRankedSlots)
router.post('/:id/confirm-formation', authenticate, confirmFormation)
router.post('/:id/tiebreak/start', authenticate, startTiebreak)
router.post('/:id/tiebreak/vote', authenticate, submitTiebreakVote)
router.post('/:id/cancel', authenticate, cancelActivity)
router.delete('/:id/join', authenticate, cancelJoin)

export default router
