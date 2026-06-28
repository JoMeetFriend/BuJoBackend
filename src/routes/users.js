import express from "express";
import * as userController from "../controllers/user.controller.js";
import authenticate from "../middleware/authenticate.js";

const router = express.Router();

router.get("/search", authenticate, userController.searchUsers);

export default router;
