import http from 'http'
import app from "./app.js";
import { initSocket } from './socket/index.js'

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection：", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception：", err);
  process.exit(1);
});

const PORT = process.env.PORT || 3000;

const server = http.createServer(app)
initSocket(server)

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
