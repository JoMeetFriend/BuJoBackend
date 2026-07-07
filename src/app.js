import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/auth.js";
import friendshipRoutes from "./routes/friendships.js";
import activityRoutes from "./routes/activities.js";
import userRoutes from "./routes/users.js";
import friendRoutes from "./routes/friends.js";
import notificationRoutes from "./routes/notifications.js";

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())
app.use(
  "/uploads",
  express.static(fileURLToPath(new URL("../uploads", import.meta.url))),
)

app.get("/", (req, res) => {
  res.json({ message: "Bujo backend is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/friendships", friendshipRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/users", userRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/notifications", notificationRoutes);

app.use((err, req, res, next) => {
  console.error("未攔截的例外：", err);
  res.status(500).json({ message: "伺服器錯誤" });
});

export default app
