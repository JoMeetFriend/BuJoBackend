import prisma from "../lib/prisma.js";

const FRIEND_REQUEST_CREATED = "friend_request_created";
const FRIENDSHIP_REFERENCE = "friendship";

export async function requestFriendship(req, res) {
  const requesterId = req.user.userId;
  const { receiver_id: receiverId } = req.body;

  if (!receiverId) {
    return res.status(400).json({ message: "缺少 receiver_id" });
  }

  if (requesterId === receiverId) {
    return res.status(400).json({ message: "不能加自己為好友" });
  }

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

  if (existingFriendship && existingFriendship.status !== "rejected") {
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

    await tx.notification.create({
      data: {
        user_id: receiverId,
        type: FRIEND_REQUEST_CREATED,
        reference_id: nextFriendship.id,
        reference_type: FRIENDSHIP_REFERENCE,
        is_read: false,
      },
    });

    return nextFriendship;
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
}
