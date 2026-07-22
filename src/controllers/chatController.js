import {
  saveMessage,
  getMessages,
  verifyParticipant,
  getChatByActivityId,
} from "../services/chatService.js";
import { getIO } from "../socket/index.js";

export async function createMessage(req, res) {
  const { id } = req.params;
  const userId = req.user.userId;
  const { content } = req.body;

  if (typeof content !== "string" || content.length === 0) {
    return res.status(400).json({ message: "content 為必填" });
  }
  if (content.length > 2000) {
    return res
      .status(400)
      .json({ message: "content 長度需在 1-2000 字元之間" });
  }

  const participant = await verifyParticipant(id, userId);
  if (!participant) {
    return res.status(403).json({ message: "你不是此活動的參與者" });
  }

  const chat = await getChatByActivityId(id);
  if (!chat) {
    return res.status(404).json({ message: "此活動無聊天室" });
  }

  const message = await saveMessage(chat.id, userId, content);

  try {
    getIO().to(chat.id).emit("chat:new_message", {
      id: message.id,
      chat_id: message.chat_id,
      activity_id: id,
      sender: message.sender,
      content: message.content,
      created_at: message.created_at,
    });
  } catch (err) {
    if (err.message !== "Socket.io not initialized") {
      console.error("Socket.IO emit failed:", err);
    }
  }

  res.status(201).json(message);
}

export async function listMessages(req, res) {
  const { id } = req.params;
  const userId = req.user.userId;
  const { before, limit: limitStr } = req.query;
  const limit = Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100);

  const participant = await verifyParticipant(id, userId);
  if (!participant) {
    return res.status(403).json({ message: "你不是此活動的參與者" });
  }

  const chat = await getChatByActivityId(id);
  if (!chat) {
    return res.status(404).json({ message: "此活動無聊天室" });
  }

  const result = await getMessages(chat.id, { before, limit });

  res.json(result);
}
