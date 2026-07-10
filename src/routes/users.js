import express from "express";
import * as userController from "../controllers/user.controller.js";
import authenticate from "../middleware/authenticate.js";
import { uploadAvatar } from "../middleware/avatarUpload.js";

const router = express.Router();

router.patch(
  "/me/avatar",
  authenticate,
  uploadAvatar,
  userController.updateMyAvatar,
);

router.patch("/me/name", authenticate, userController.updateMyName);

router.get("/search", authenticate, userController.searchUsers);

export default router;
