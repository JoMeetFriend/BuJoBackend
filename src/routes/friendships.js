import express from "express";
import authenticate from "../middleware/authenticate.js";
import {
  acceptFriendship,
  rejectFriendship,
  requestFriendship,
} from "../controllers/friendshipController.js";

const router = express.Router();

router.post("/request", authenticate, requestFriendship);
router.post("/:id/accept", authenticate, acceptFriendship);
router.post("/:id/reject", authenticate, rejectFriendship);

export default router;
