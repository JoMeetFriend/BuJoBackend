import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import friendshipRoutes from "./routes/friendships.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.json({ message: "Bujo backend is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/friendships", friendshipRoutes);
export default app;
