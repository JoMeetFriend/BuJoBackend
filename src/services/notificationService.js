import prisma from "../lib/prisma.js";
import { sendLinePushMessage } from "./lineMessagingService.js";

export const NOTIFICATION_TYPES = {
  FRIEND_REQUEST_CREATED: "friend_request_created",
  FRIEND_REQUEST_ACCEPTED: "friend_request_accepted",
  ACTIVITY_CREATED: "activity_created",
  ACTIVITY_CONFIRMED: "activity_confirmed",
  ACTIVITY_CANCELLED: "activity_cancelled",
  TIME_TO_PICK: "time_to_pick",
  FORMATION_READY: "formation_ready",
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
  { deliverLine = true } = {},
) {
  if (!receiverId) {
    throw new Error("receiverId is required");
  }

  if (!friendshipId) {
    throw new Error("friendshipId is required");
  }

  const notification = await createNotification(
    {
      userId: receiverId,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_CREATED,
      referenceId: friendshipId,
      referenceType: NOTIFICATION_REFERENCE_TYPES.FRIENDSHIP,
    },
    db,
  );

  if (deliverLine) {
    await sendFriendRequestCreatedLineNotification(
      { receiverId, friendshipId },
      db,
    );
  }

  return notification;
}

export async function sendFriendRequestCreatedLineNotification(
  { receiverId, friendshipId },
  db = prisma,
) {
  return deliverLineNotification(
    {
      userId: receiverId,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_CREATED,
      getText: () =>
        buildFriendshipLineMessage(
          {
            friendshipId,
            type: NOTIFICATION_TYPES.FRIEND_REQUEST_CREATED,
          },
          db,
        ),
    },
    db,
  );
}

export async function createFriendRequestAcceptedNotification(
  { requesterId, friendshipId },
  db = prisma,
  { deliverLine = true } = {},
) {
  if (!requesterId) {
    throw new Error("requesterId is required");
  }

  if (!friendshipId) {
    throw new Error("friendshipId is required");
  }

  const notification = await createNotification(
    {
      userId: requesterId,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
      referenceId: friendshipId,
      referenceType: NOTIFICATION_REFERENCE_TYPES.FRIENDSHIP,
    },
    db,
  );

  if (deliverLine) {
    await sendFriendRequestAcceptedLineNotification(
      { requesterId, friendshipId },
      db,
    );
  }

  return notification;
}

export async function sendFriendRequestAcceptedLineNotification(
  { requesterId, friendshipId },
  db = prisma,
) {
  return deliverLineNotification(
    {
      userId: requesterId,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
      getText: () =>
        buildFriendshipLineMessage(
          {
            friendshipId,
            type: NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
          },
          db,
        ),
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

  const notification = await createNotification(
    {
      userId,
      type: NOTIFICATION_TYPES.ACTIVITY_CREATED,
      referenceId: activityId,
      referenceType: NOTIFICATION_REFERENCE_TYPES.ACTIVITY,
    },
    db,
  );

  await deliverLineNotification(
    {
      userId,
      type: NOTIFICATION_TYPES.ACTIVITY_CREATED,
      getText: () => buildActivityLineMessage({ activityId }, db),
    },
    db,
  );

  return notification;
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

  const result = await db.notification.createMany({
    data: friendIds.map((friendId) => ({
      user_id: friendId,
      type: NOTIFICATION_TYPES.ACTIVITY_CREATED,
      reference_id: activityId,
      reference_type: NOTIFICATION_REFERENCE_TYPES.ACTIVITY,
      is_read: false,
    })),
  });

  let activityLineTextPromise = null;
  const getActivityLineText = () => {
    if (!activityLineTextPromise) {
      activityLineTextPromise = buildActivityLineMessage({ activityId }, db);
    }

    return activityLineTextPromise;
  };

  await Promise.all(
    friendIds.map((friendId) =>
      deliverLineNotification(
        {
          userId: friendId,
          type: NOTIFICATION_TYPES.ACTIVITY_CREATED,
          getText: getActivityLineText,
        },
        db,
      ),
    ),
  );

  return result;
}

export async function sendActivityLifecycleLineNotifications(
  { userIds, activityId, type },
  db = prisma,
) {
  if (!activityId) {
    throw new Error("activityId is required");
  }

  if (!type) {
    throw new Error("type is required");
  }

  if (!userIds || userIds.length === 0) {
    return [];
  }

  let lineTextPromise = null;
  const getLineText = () => {
    if (!lineTextPromise) {
      lineTextPromise = buildActivityLineMessage({ activityId, type }, db);
    }

    return lineTextPromise;
  };

  return Promise.all(
    userIds.map((userId) =>
      deliverLineNotification({ userId, type, getText: getLineText }, db),
    ),
  );
}

export async function listUserNotifications({ userId }, db = prisma) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const notifications = await db.notification.findMany({
    where: {
      user_id: userId,
      dismissed_at: null,
    },
    orderBy: { created_at: "desc" },
  });

  return Promise.all(
    notifications.map((notification) => formatNotification(notification, db)),
  );
}

export async function dismissNotification(
  { userId, notificationId },
  db = prisma,
) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!notificationId) {
    throw new Error("notificationId is required");
  }

  const notification = await db.notification.findFirst({
    where: {
      id: notificationId,
      user_id: userId,
      dismissed_at: null,
    },
    select: {
      id: true,
      type: true,
      reference_id: true,
      reference_type: true,
    },
  });

  if (!notification) {
    return "not_found";
  }

  const isFriendRequest =
    notification.type === NOTIFICATION_TYPES.FRIEND_REQUEST_CREATED &&
    notification.reference_type === NOTIFICATION_REFERENCE_TYPES.FRIENDSHIP &&
    notification.reference_id;

  if (isFriendRequest) {
    const friendship = await db.friendship.findUnique({
      where: { id: notification.reference_id },
      select: { status: true },
    });

    if (friendship?.status === "pending") {
      return "pending_friend_request";
    }
  }

  const result = await db.notification.updateMany({
    where: {
      id: notificationId,
      user_id: userId,
      dismissed_at: null,
    },
    data: {
      is_read: true,
      dismissed_at: new Date(),
    },
  });

  return result.count === 0 ? "not_found" : "dismissed";
}

export async function markNotificationAsRead(
  { userId, notificationId },
  db = prisma,
) {
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

export async function countUnreadNotifications({ userId }, db = prisma) {
  if (!userId) {
    throw new Error("userId is required");
  }

  return db.notification.count({
    where: { user_id: userId, is_read: false },
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

async function buildFriendshipLineMessage({ friendshipId, type }, db) {
  const friendship = db.friendship?.findUnique
    ? await db.friendship.findUnique({
        where: { id: friendshipId },
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

  return type === NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED
    ? `${receiverName} 接受了你的好友邀請`
    : `${requesterName} 邀請你成為好友，快去 BuJo 看看吧！`;
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
    message: buildActivityMessage(notification.type, { creatorName, activityTitle }),
    reference: {
      type: NOTIFICATION_REFERENCE_TYPES.ACTIVITY,
      id: notification.reference_id,
      status: activity?.status || null,
    },
  });
}

function buildActivityMessage(type, { creatorName, activityTitle }) {
  switch (type) {
    case NOTIFICATION_TYPES.ACTIVITY_CONFIRMED:
      return `「${activityTitle}」已確認成團`;
    case NOTIFICATION_TYPES.ACTIVITY_CANCELLED:
      return `「${activityTitle}」已取消`;
    case NOTIFICATION_TYPES.TIME_TO_PICK:
      return `「${activityTitle}」候選時段票數不相上下，請選擇最終時段`;
    case NOTIFICATION_TYPES.FORMATION_READY:
      return `「${activityTitle}」人數已滿，請確認成團`;
    case NOTIFICATION_TYPES.ACTIVITY_CREATED:
    default:
      return `${creatorName} 建立了新活動：${activityTitle}`;
  }
}

export async function buildActivityLineMessage({ activityId, type }, db = prisma) {
  const activity = db.activity?.findUnique
    ? await db.activity.findUnique({
        where: { id: activityId },
        include: {
          creator: {
            select: { id: true, display_name: true, avatar_url: true },
          },
        },
      })
    : null;

  const creatorName = activity?.creator?.display_name || "有人";
  const activityTitle = activity?.title || "新活動";

  return buildActivityMessage(type, { creatorName, activityTitle });
}

async function deliverLineNotification({ userId, type, getText }, db) {
  try {
    const to = await findLineRecipientId({ userId }, db);
    if (!to) {
      return { status: "skipped", reason: "missing_line_identity" };
    }

    const enabled = await isLineNotificationEnabled({ userId, type }, db);
    if (!enabled) {
      return { status: "skipped", reason: "line_preference_disabled" };
    }

    const text = await getText();
    return await sendLinePushMessage({ to, text });
  } catch (error) {
    return {
      status: "failed",
      reason: "unexpected_error",
      message: error.message,
    };
  }
}

async function findLineRecipientId({ userId }, db) {
  if (!db.userIdentity?.findFirst) {
    return null;
  }

  const identity = await db.userIdentity.findFirst({
    where: {
      user_id: userId,
      provider: "line",
      provider_user_id: { not: null },
    },
    select: { provider_user_id: true },
  });

  return identity?.provider_user_id || null;
}

async function isLineNotificationEnabled({ userId, type }, db) {
  if (!db.notificationPreference?.findUnique) {
    return true;
  }

  const preference = await db.notificationPreference.findUnique({
    where: {
      user_id_type: {
        user_id: userId,
        type,
      },
    },
    select: { line: true },
  });

  return preference?.line !== false;
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
