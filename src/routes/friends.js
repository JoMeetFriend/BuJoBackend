import express from "express";
import * as friendController from "../controllers/friend.controller.js";
import authenticate from "../middleware/authenticate.js";

const router = express.Router();

router.use(authenticate);

router.get("/", friendController.getFriends);
router.get("/requests", friendController.getPendingRequests);
router.post("/request", friendController.requestFriend);
router.patch("/requests/:id/accept", friendController.acceptFriendRequest);
router.delete("/requests/:id", friendController.rejectFriendRequest);

export default router;
