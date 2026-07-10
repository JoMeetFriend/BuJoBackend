import {
  listUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  countUnreadNotifications,
} from "../services/notificationService.js";

export async function listNotifications(req, res) {
  try {
    const notifications = await listUserNotifications({
      userId: req.user.userId,
    });

    return res.json({ notifications });
  } catch (error) {
    console.error("listNotifications 錯誤：", error);
    return res.status(500).json({ message: "伺服器錯誤" });
  }
}

export async function markRead(req, res) {
  try {
    const result = await markNotificationAsRead({
      userId: req.user.userId,
      notificationId: req.params.id,
    });

    if (result.count === 0) {
      return res.status(404).json({ message: "找不到通知" });
    }

    return res.json({ message: "已標記為已讀" });
  } catch (error) {
    console.error("markRead 錯誤：", error);
    return res.status(500).json({ message: "伺服器錯誤" });
  }
}

export async function markAllRead(req, res) {
  try {
    const result = await markAllNotificationsAsRead({
      userId: req.user.userId,
    });

    return res.json({
      message: "已全部標記為已讀",
      count: result.count,
    });
  } catch (error) {
    console.error("markAllRead 錯誤：", error);
    return res.status(500).json({ message: "伺服器錯誤" });
  }
}

export async function getUnreadCount(req, res) {
  try {
    const count = await countUnreadNotifications({
      userId: req.user.userId,
    });

    return res.json({ unreadCount: count });
  } catch (error) {
    console.error("getUnreadCount 錯誤：", error);
    return res.status(500).json({ message: "伺服器錯誤" });
  }
}
