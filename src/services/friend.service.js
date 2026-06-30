import prisma from "../lib/prisma.js";

export const createFriendRequest = async (requester_id, target_id) => {
  if (requester_id === target_id) {
    return { success: false, statusCode: 400, message: "不能將自己加為好友" }; // TODO: i18n
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: target_id },
  });

  if (!targetUser) {
    return { success: false, statusCode: 404, message: "找不到目標使用者" }; // TODO: i18n
  }

  const existingFriendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requester_id: requester_id, receiver_id: target_id },
        { requester_id: target_id, receiver_id: requester_id },
      ],
    },
  });

  if (existingFriendship) {
    return {
      success: false,
      statusCode: 409,
      message: "已經是好友或已發送過請求",
    }; // TODO: i18n
  }

  await prisma.friendship.create({
    data: {
      requester_id: requester_id,
      receiver_id: target_id,
      status: "pending",
    },
  });

  return { success: true, message: "好友請求已發送" }; // TODO: i18n
};

export const getAcceptedFriendsList = async (currentUserId) => {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { requester_id: currentUserId, status: "accepted" },
        { receiver_id: currentUserId, status: "accepted" },
      ],
    },
    include: {
      requester: { select: { id: true, display_name: true, avatar_url: true } },
      receiver: { select: { id: true, display_name: true, avatar_url: true } },
    },
  });

  return friendships.map((f) => {
    return f.requester_id === currentUserId ? f.receiver : f.requester;
  });
};
