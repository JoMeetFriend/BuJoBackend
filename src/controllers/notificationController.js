import {
  listUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../services/notificationService.js";

export async function listNotifications(req, res) {
  const notifications = await listUserNotifications({
    userId: req.user.userId,
  });

  return res.json({ notifications });
}

export async function markRead(req, res) {
  const result = await markNotificationAsRead({
    userId: req.user.userId,
    notificationId: req.params.id,
  });

  if (result.count === 0) {
    return res.status(404).json({ message: "找不到通知" });
  }

  return res.json({ message: "已標記為已讀" });
}

export async function markAllRead(req, res) {
  const result = await markAllNotificationsAsRead({
    userId: req.user.userId,
  });

  return res.json({
    message: "已全部標記為已讀",
    count: result.count,
  });
}
