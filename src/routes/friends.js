import express from "express";
import * as friendController from "../controllers/friend.controller.js";
import authenticate from "../middleware/authenticate.js";

const router = express.Router();

router.use(authenticate);

router.get("/", friendController.getFriends);

export default router;
