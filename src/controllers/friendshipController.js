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
    return res.status(400).json({ message: req.t("friendship.missingReceiverId") });
  }

  if (requesterId === receiverId) {
    return res.status(400).json({ message: req.t("friendship.cannotAddSelf") });
  }

  try {
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true },
    });

    if (!receiver) {
      return res.status(404).json({ message: req.t("friendship.userNotFound") });
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
      return res.status(409).json({ message: req.t("friendship.alreadyFriends") });
    }

    if (existingFriendship?.status === "pending") {
      const message =
        existingFriendship.requester_id === requesterId
          ? req.t("friendship.requestAlreadySent")
          : req.t("friendship.alreadyInvitedByOther");
      return res.status(409).json({ message });
    }

    if (
      existingFriendship &&
      existingFriendship.status !== "rejected" &&
      existingFriendship.status !== "deleted"
    ) {
      return res.status(409).json({ message: req.t("friendship.cannotSendRequest") });
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
      message: req.t("friendship.requestSent"),
      friendship: {
        id: friendship.id,
        requester_id: friendship.requester_id,
        receiver_id: friendship.receiver_id,
        status: friendship.status,
      },
    });
  } catch (error) {
    console.error("requestFriendship 錯誤：", error);
    return res.status(500).json({ message: req.t("common.serverError") });
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
      return res.status(404).json({ message: req.t("friendship.requestNotFound") });
    }

    if (friendship.receiver_id !== userId) {
      return res.status(403).json({ message: req.t("friendship.onlyReceiverCanAccept") });
    }

    if (friendship.status !== "pending") {
      return res.status(400).json({ message: req.t("friendship.cannotAccept") });
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
      message: req.t("friendship.accepted"),
      friendship: {
        id: updatedFriendship.id,
        requester_id: updatedFriendship.requester_id,
        receiver_id: updatedFriendship.receiver_id,
        status: updatedFriendship.status,
      },
    });
  } catch (error) {
    console.error("acceptFriendship 錯誤：", error);
    return res.status(500).json({ message: req.t("common.serverError") });
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
      return res.status(404).json({ message: req.t("friendship.requestNotFound") });
    }

    if (friendship.receiver_id !== userId) {
      return res.status(403).json({ message: req.t("friendship.onlyReceiverCanReject") });
    }

    if (friendship.status !== "pending") {
      return res.status(400).json({ message: req.t("friendship.cannotReject") });
    }

    const updatedFriendship = await prisma.friendship.update({
      where: { id },
      data: { status: "rejected" },
    });

    return res.status(200).json({
      message: req.t("friendship.rejected"),
      friendship: {
        id: updatedFriendship.id,
        requester_id: updatedFriendship.requester_id,
        receiver_id: updatedFriendship.receiver_id,
        status: updatedFriendship.status,
      },
    });
  } catch (error) {
    console.error("rejectFriendship 錯誤：", error);
    return res.status(500).json({ message: req.t("common.serverError") });
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
      return res.status(404).json({ message: req.t("friendship.friendshipNotFound") });
    }

    if (
      friendship.requester_id !== userId &&
      friendship.receiver_id !== userId
    ) {
      return res.status(403).json({ message: req.t("friendship.forbidden") });
    }

    if (friendship.status !== "accepted") {
      return res.status(400).json({ message: req.t("friendship.cannotRemove") });
    }

    const updatedFriendship = await prisma.friendship.update({
      where: { id },
      data: { status: "deleted" },
    });

    return res.status(200).json({
      message: req.t("friendship.removed"),
      friendship: {
        id: updatedFriendship.id,
        status: updatedFriendship.status,
      },
    });
  } catch (error) {
    console.error("removeFriendship 錯誤：", error);
    return res.status(500).json({ message: req.t("common.serverError") });
  }
}
