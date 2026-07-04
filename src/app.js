import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
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

app.get("/", (req, res) => {
  res.json({ message: "Bujo backend is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/friendships", friendshipRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/users", userRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/notifications", notificationRoutes);

export default app
