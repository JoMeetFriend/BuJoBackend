import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    cookies[key] = val;
  }
  return cookies;
}

let io;

const userSockets = new Map();

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const token = cookies.token;
      if (!token) return next(new Error("未登入"));

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const userId = payload.userId;

      const participants = await prisma.activityParticipant.findMany({
        where: { user_id: userId, status: "joined" },
        include: { activity: { include: { chat: true } } },
      });

      const chatIds = participants
        .map((p) => p.activity.chat?.id)
        .filter(Boolean);

      if (chatIds.length === 0) return next(new Error("無可加入的聊天室"));

      for (const chatId of chatIds) {
        socket.join(chatId);
      }

      socket.data.userId = userId;
      next();
    } catch (err) {
      next(new Error("驗證失敗"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    console.log(`Socket connected: ${socket.id} (user: ${userId})`);

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
        }
      }
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}

export function joinUserToChat(userId, chatId) {
  const socketIds = userSockets.get(userId);
  if (!socketIds) return;
  for (const socketId of socketIds) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(chatId);
    }
  }
}

export function leaveUserFromChat(userId, chatId) {
  const socketIds = userSockets.get(userId);
  if (!socketIds) return;
  for (const socketId of socketIds) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(chatId);
    }
  }
}
