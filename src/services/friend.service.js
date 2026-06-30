import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";

export const createFriendRequest = async (requester_id, target_id) => {
  if (requester_id === target_id) {
    return { success: false, statusCode: 400, message: "不能將自己加為好友" };
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: target_id },
  });

  if (!targetUser) {
    return { success: false, statusCode: 404, message: "找不到目標使用者" };
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
    };
  }

  try {
    await prisma.friendship.create({
      data: {
        requester_id: requester_id,
        receiver_id: target_id,
        status: "pending",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, statusCode: 409, message: "已經是好友或已發送過請求" };
    }
    throw e;
  }

  return { success: true, message: "好友請求已發送" };
};

export const getPendingRequests = async (currentUserId) => {
  const requests = await prisma.friendship.findMany({
    where: {
      receiver_id: currentUserId,
      status: "pending",
    },
    include: {
      requester: { select: { id: true, display_name: true, avatar_url: true } },
    },
    orderBy: { created_at: "desc" },
  });

  return requests.map((r) => ({
    id: r.id,
    requester: r.requester,
    created_at: r.created_at,
  }));
};

export const acceptFriendRequest = async (friendshipId, currentUserId) => {
  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship) {
    return { success: false, statusCode: 404, message: "找不到好友請求" };
  }

  if (friendship.receiver_id !== currentUserId) {
    return { success: false, statusCode: 403, message: "無權限操作此好友請求" };
  }

  if (friendship.status !== "pending") {
    return { success: false, statusCode: 409, message: "此好友請求已被處理" };
  }

  await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: "accepted" },
  });

  return { success: true, message: "好友請求已接受" };
};

export const rejectFriendRequest = async (friendshipId, currentUserId) => {
  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship) {
    return { success: false, statusCode: 404, message: "找不到好友請求" };
  }

  // receiver 拒絕 或 requester 取消，都允許
  if (friendship.receiver_id !== currentUserId && friendship.requester_id !== currentUserId) {
    return { success: false, statusCode: 403, message: "無權限操作此好友請求" };
  }

  if (friendship.status !== "pending") {
    return { success: false, statusCode: 409, message: "此好友請求已被處理" };
  }

  await prisma.friendship.delete({
    where: { id: friendshipId },
  });

  return { success: true, message: "好友請求已拒絕" };
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

  return friendships.map((f) =>
    f.requester_id === currentUserId ? f.receiver : f.requester
  );
};
