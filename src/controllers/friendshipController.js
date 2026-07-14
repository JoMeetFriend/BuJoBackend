import prisma from "../lib/prisma.js";
import {
  createFriendRequestAcceptedNotification,
  createFriendRequestNotification,
  sendFriendRequestAcceptedLineNotification,
  sendFriendRequestCreatedLineNotification,
} from "../services/notificationService.js";

export async function requestFriendship(req, res) {
  const requesterId = req.user.userId;
  const { receiver_id: receiverId } = req.body;

  if (!receiverId) {
    return res.status(400).json({ message: "缺少 receiver_id" });
  }

  if (requesterId === receiverId) {
    return res.status(400).json({ message: "不能加自己為好友" });
  }

  try {
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true },
    });

    if (!receiver) {
      return res.status(404).json({ message: "找不到使用者" });
    }

    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requester_id: requesterId, receiver_id: receiverId },
          { requester_id: receiverId, receiver_id: requesterId },
        ],
      },
    });

    if (existingFriendship?.status === "accepted") {
      return res.status(409).json({ message: "已經是好友" });
    }

    if (existingFriendship?.status === "pending") {
      const message =
        existingFriendship.requester_id === requesterId
          ? "已送出好友邀請"
          : "對方已邀請你";
      return res.status(409).json({ message });
    }

    if (
      existingFriendship &&
      existingFriendship.status !== "rejected" &&
      existingFriendship.status !== "deleted"
    ) {
      return res.status(409).json({ message: "目前無法送出好友邀請" });
    }

    const friendship = await prisma.$transaction(async (tx) => {
      const nextFriendship = existingFriendship
        ? await tx.friendship.update({
            where: { id: existingFriendship.id },
            data: {
              requester_id: requesterId,
              receiver_id: receiverId,
              status: "pending",
            },
          })
        : await tx.friendship.create({
            data: {
              requester_id: requesterId,
              receiver_id: receiverId,
              status: "pending",
            },
          });

      await createFriendRequestNotification(
        {
          receiverId,
          friendshipId: nextFriendship.id,
        },
        tx,
        { deliverLine: false },
      );

      return nextFriendship;
    });

    await sendFriendRequestCreatedLineNotification({
      receiverId,
      friendshipId: friendship.id,
    });

    return res.status(201).json({
      message: "好友邀請已送出",
      friendship: {
        id: friendship.id,
        requester_id: friendship.requester_id,
        receiver_id: friendship.receiver_id,
        status: friendship.status,
      },
    });
  } catch (error) {
    console.error("requestFriendship 錯誤：", error);
    return res.status(500).json({ message: "伺服器錯誤" });
  }
}

export async function acceptFriendship(req, res) {
  const userId = req.user.userId;
  const { id } = req.params;

  try {
    const friendship = await prisma.friendship.findUnique({
      where: { id },
    });

    if (!friendship) {
      return res.status(404).json({ message: "找不到好友邀請" });
    }

    if (friendship.receiver_id !== userId) {
      return res.status(403).json({ message: "只有被邀請者可以接受好友邀請" });
    }

    if (friendship.status !== "pending") {
      return res.status(400).json({ message: "此好友邀請無法接受" });
    }

    const updatedFriendship = await prisma.$transaction(async (tx) => {
      const nextFriendship = await tx.friendship.update({
        where: { id },
        data: { status: "accepted" },
      });

      await createFriendRequestAcceptedNotification(
        {
          requesterId: friendship.requester_id,
          friendshipId: friendship.id,
        },
        tx,
        { deliverLine: false },
      );

      return nextFriendship;
    });

    await sendFriendRequestAcceptedLineNotification({
      requesterId: friendship.requester_id,
      friendshipId: friendship.id,
    });

    return res.status(200).json({
      message: "已接受好友邀請",
      friendship: {
        id: updatedFriendship.id,
        requester_id: updatedFriendship.requester_id,
        receiver_id: updatedFriendship.receiver_id,
        status: updatedFriendship.status,
      },
    });
  } catch (error) {
    console.error("acceptFriendship 錯誤：", error);
    return res.status(500).json({ message: "伺服器錯誤" });
  }
}

export async function rejectFriendship(req, res) {
  const userId = req.user.userId;
  const { id } = req.params;

  try {
    const friendship = await prisma.friendship.findUnique({
      where: { id },
    });

    if (!friendship) {
      return res.status(404).json({ message: "找不到好友邀請" });
    }

    if (friendship.receiver_id !== userId) {
      return res.status(403).json({ message: "只有被邀請者可以拒絕好友邀請" });
    }

    if (friendship.status !== "pending") {
      return res.status(400).json({ message: "此好友邀請無法拒絕" });
    }

    const updatedFriendship = await prisma.friendship.update({
      where: { id },
      data: { status: "rejected" },
    });

    return res.status(200).json({
      message: "已拒絕好友邀請",
      friendship: {
        id: updatedFriendship.id,
        requester_id: updatedFriendship.requester_id,
        receiver_id: updatedFriendship.receiver_id,
        status: updatedFriendship.status,
      },
    });
  } catch (error) {
    console.error("rejectFriendship 錯誤：", error);
    return res.status(500).json({ message: "伺服器錯誤" });
  }
}

export async function removeFriendship(req, res) {
  const userId = req.user.userId;
  const { id } = req.params;

  try {
    const friendship = await prisma.friendship.findUnique({
      where: { id },
    });

    if (!friendship) {
      return res.status(404).json({ message: "找不到該好友關係" });
    }

    if (
      friendship.requester_id !== userId &&
      friendship.receiver_id !== userId
    ) {
      return res.status(403).json({ message: "無權操作此好友關係" });
    }

    if (friendship.status !== "accepted") {
      return res.status(400).json({ message: "此狀態無法刪除好友" });
    }

    const updatedFriendship = await prisma.friendship.update({
      where: { id },
      data: { status: "deleted" },
    });

    return res.status(200).json({
      message: "已刪除好友",
      friendship: {
        id: updatedFriendship.id,
        status: updatedFriendship.status,
      },
    });
  } catch (error) {
    console.error("removeFriendship 錯誤：", error);
    return res.status(500).json({ message: "伺服器錯誤" });
  }
}
