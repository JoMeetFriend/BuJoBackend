import express from "express";
import authenticate from "../middleware/authenticate.js";
import { requestFriendship } from "../controllers/friendshipController.js";

const router = express.Router();

router.post("/request", authenticate, requestFriendship);

export default router;
