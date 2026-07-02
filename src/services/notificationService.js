import prisma from "../lib/prisma.js";

export const NOTIFICATION_TYPES = {
  FRIEND_REQUEST_CREATED: "friend_request_created",
  FRIEND_REQUEST_ACCEPTED: "friend_request_accepted",
  ACTIVITY_CREATED: "activity_created",
};

export const NOTIFICATION_REFERENCE_TYPES = {
  FRIENDSHIP: "friendship",
  ACTIVITY: "activity",
};

export async function createNotification(
  { userId, type, referenceId = null, referenceType = null },
  db = prisma,
) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!type) {
    throw new Error("type is required");
  }

  return db.notification.create({
    data: {
      user_id: userId,
      type,
      reference_id: referenceId,
      reference_type: referenceType,
      is_read: false,
    },
  });
}

export async function createFriendRequestNotification(
  { receiverId, friendshipId },
  db = prisma,
) {
  if (!receiverId) {
    throw new Error("receiverId is required");
  }

  if (!friendshipId) {
    throw new Error("friendshipId is required");
  }

  return createNotification(
    {
      userId: receiverId,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_CREATED,
      referenceId: friendshipId,
      referenceType: NOTIFICATION_REFERENCE_TYPES.FRIENDSHIP,
    },
    db,
  );
}

export async function createFriendRequestAcceptedNotification(
  { requesterId, friendshipId },
  db = prisma,
) {
  if (!requesterId) {
    throw new Error("requesterId is required");
  }

  if (!friendshipId) {
    throw new Error("friendshipId is required");
  }

  return createNotification(
    {
      userId: requesterId,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
      referenceId: friendshipId,
      referenceType: NOTIFICATION_REFERENCE_TYPES.FRIENDSHIP,
    },
    db,
  );
}

export async function createActivityCreatedNotification(
  { userId, activityId },
  db = prisma,
) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!activityId) {
    throw new Error("activityId is required");
  }

  return createNotification(
    {
      userId,
      type: NOTIFICATION_TYPES.ACTIVITY_CREATED,
      referenceId: activityId,
      referenceType: NOTIFICATION_REFERENCE_TYPES.ACTIVITY,
    },
    db,
  );
}

export async function notifyFriendsActivityCreated(
  { creatorId, activityId },
  db = prisma,
) {
  if (!creatorId) {
    throw new Error("creatorId is required");
  }

  if (!activityId) {
    throw new Error("activityId is required");
  }

  const friendships = await db.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requester_id: creatorId }, { receiver_id: creatorId }],
    },
    select: {
      requester_id: true,
      receiver_id: true,
    },
  });

  const friendIds = friendships.map((friendship) =>
    friendship.requester_id === creatorId
      ? friendship.receiver_id
      : friendship.requester_id,
  );

  if (friendIds.length === 0) {
    return { count: 0 };
  }

  return db.notification.createMany({
    data: friendIds.map((friendId) => ({
      user_id: friendId,
      type: NOTIFICATION_TYPES.ACTIVITY_CREATED,
      reference_id: activityId,
      reference_type: NOTIFICATION_REFERENCE_TYPES.ACTIVITY,
      is_read: false,
    })),
  });
}

export async function listUserNotifications({ userId }, db = prisma) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const notifications = await db.notification.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
  });

  return Promise.all(
    notifications.map((notification) => formatNotification(notification, db)),
  );
}

export async function markNotificationAsRead({ userId, notificationId }, db = prisma) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!notificationId) {
    throw new Error("notificationId is required");
  }

  return db.notification.updateMany({
    where: {
      id: notificationId,
      user_id: userId,
    },
    data: { is_read: true },
  });
}

export async function markAllNotificationsAsRead({ userId }, db = prisma) {
  if (!userId) {
    throw new Error("userId is required");
  }

  return db.notification.updateMany({
    where: {
      user_id: userId,
      is_read: false,
    },
    data: { is_read: true },
  });
}

async function formatNotification(notification, db) {
  if (notification.reference_type === NOTIFICATION_REFERENCE_TYPES.FRIENDSHIP) {
    return formatFriendshipNotification(notification, db);
  }

  if (notification.reference_type === NOTIFICATION_REFERENCE_TYPES.ACTIVITY) {
    return formatActivityNotification(notification, db);
  }

  return buildNotificationResponse(notification, {
    category: "general",
    message: "你有一則新通知",
    reference: {
      type: notification.reference_type,
      id: notification.reference_id,
      status: null,
    },
  });
}

async function formatFriendshipNotification(notification, db) {
  const friendship = notification.reference_id
    ? await db.friendship.findUnique({
        where: { id: notification.reference_id },
        include: {
          requester: {
            select: { id: true, display_name: true, avatar_url: true },
          },
          receiver: {
            select: { id: true, display_name: true, avatar_url: true },
          },
        },
      })
    : null;

  const requesterName = friendship?.requester?.display_name || "有人";
  const receiverName = friendship?.receiver?.display_name || "對方";
  const isPendingRequest =
    notification.type === NOTIFICATION_TYPES.FRIEND_REQUEST_CREATED &&
    friendship?.status === "pending";

  const message =
    notification.type === NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED
      ? `${receiverName} 接受了你的好友邀請`
      : `${requesterName} 向你發送好友邀請`;

  return buildNotificationResponse(notification, {
    category: "friend",
    message,
    reference: {
      type: NOTIFICATION_REFERENCE_TYPES.FRIENDSHIP,
      id: notification.reference_id,
      status: friendship?.status || null,
    },
    actions: isPendingRequest ? ["accept", "reject"] : [],
  });
}

async function formatActivityNotification(notification, db) {
  const activity = notification.reference_id
    ? await db.activity.findUnique({
        where: { id: notification.reference_id },
        include: {
          creator: {
            select: { id: true, display_name: true, avatar_url: true },
          },
        },
      })
    : null;

  const creatorName = activity?.creator?.display_name || "有人";
  const activityTitle = activity?.title || "新活動";

  return buildNotificationResponse(notification, {
    category: "activity",
    message: `${creatorName} 建立了新活動：${activityTitle}`,
    reference: {
      type: NOTIFICATION_REFERENCE_TYPES.ACTIVITY,
      id: notification.reference_id,
      status: activity?.status || null,
    },
  });
}

function buildNotificationResponse(
  notification,
  { category, message, reference, actions = [] },
) {
  return {
    id: notification.id,
    type: notification.type,
    category,
    message,
    timeText: formatTimeText(notification.created_at),
    isRead: notification.is_read,
    createdAt: notification.created_at.toISOString(),
    reference,
    actions,
  };
}

function formatTimeText(createdAt) {
  const diffMs = Date.now() - createdAt.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return "剛剛";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} 分鐘前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小時前`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} 天前`;
  }

  const year = createdAt.getFullYear();
  const month = String(createdAt.getMonth() + 1).padStart(2, "0");
  const day = String(createdAt.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}
