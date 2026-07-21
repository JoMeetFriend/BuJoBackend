import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { fileURLToPath } from "node:url";
import swaggerSpec from "./docs/swaggerSpec.js";
import authRoutes from "./routes/auth.js";
import friendshipRoutes from "./routes/friendships.js";
import activityRoutes from "./routes/activities.js";
import userRoutes from "./routes/users.js";
import friendRoutes from "./routes/friends.js";
import notificationRoutes from "./routes/notifications.js";
import placesRoutes from "./routes/places.js";
import chatRoutes from "./routes/chat.js";

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // 沒有 Origin 標頭代表不是瀏覽器的跨站請求（curl、server-to-server、健康檢查等），
    // CORS 本來就是瀏覽器的同源限制機制，這類請求不受影響，明確允許、不落入白名單比對
    if (!origin) {
      return callback(null, true)
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    return callback(new Error('Not allowed by CORS'))
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

app.get("/api-docs.json", (req, res) => {
  res.json(swaggerSpec);
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/auth", authRoutes);
app.use("/api/friendships", friendshipRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/users", userRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/places", placesRoutes);
app.use("/api/activities", chatRoutes);

app.use((err, req, res, next) => {
  console.error("未攔截的例外：", err);
  res.status(500).json({ message: "伺服器錯誤" });
});

export default app
