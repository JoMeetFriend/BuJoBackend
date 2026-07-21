import prisma from "../lib/prisma.js";
import { getIO, joinUserToChat, leaveUserFromChat } from "../socket/index.js";

export async function syncOnActivityCreated(activityId) {
  try {
    const result = await prisma.activity.findUnique({
      where: { id: activityId },
      select: { creator_id: true, title: true, chat: { select: { id: true } } },
    });
    if (!result?.chat) return;
    joinUserToChat(result.creator_id, result.chat.id);
    getIO().to(result.chat.id).emit("chat:room_added", {
      chat_id: result.chat.id,
      activity_id: activityId,
      activity_title: result.title,
    });
  } catch {
    // Socket.io not initialized in test
  }
}

export async function syncOnActivityJoined(activityId, userId) {
  try {
    const result = await prisma.activity.findUnique({
      where: { id: activityId },
      select: { chat: { select: { id: true } }, title: true },
    });
    if (!result?.chat) return;
    joinUserToChat(userId, result.chat.id);
    getIO().to(result.chat.id).emit("chat:room_added", {
      chat_id: result.chat.id,
      activity_id: activityId,
      activity_title: result.title,
    });
  } catch {
    // Socket.io not initialized in test
  }
}

export async function syncOnActivityLeft(activityId, userId) {
  try {
    const result = await prisma.activity.findUnique({
      where: { id: activityId },
      select: { chat: { select: { id: true } } },
    });
    if (!result?.chat) return;
    leaveUserFromChat(userId, result.chat.id);
    getIO().to(result.chat.id).emit("chat:room_removed", {
      chat_id: result.chat.id,
      activity_id: activityId,
    });
  } catch {
    // Socket.io not initialized in test
  }
}
