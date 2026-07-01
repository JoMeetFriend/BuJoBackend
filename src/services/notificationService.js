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
