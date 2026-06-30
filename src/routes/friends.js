import express from "express";
import * as friendController from "../controllers/friend.controller.js";
import authenticate from "../middleware/authenticate.js";

const router = express.Router();

router.post("/request", authenticate, friendController.requestFriend);
router.get("/", authenticate, friendController.getFriends);

export default router;
