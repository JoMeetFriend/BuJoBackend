import express from "express";
import authenticate from "../middleware/authenticate.js";
import {
  listNotifications,
  markAllRead,
  markRead,
  getUnreadCount,
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", authenticate, listNotifications);
router.get("/unread-count", authenticate, getUnreadCount);
router.patch("/read-all", authenticate, markAllRead);
router.patch("/:id/read", authenticate, markRead);

export default router;
