import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import friendshipRoutes from "./routes/friendships.js";
import userRoutes from "./routes/users.js";
import friendRoutes from "./routes/friends.js";

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
app.use("/api/users", userRoutes);
app.use("/api/friends", friendRoutes);

export default app;
