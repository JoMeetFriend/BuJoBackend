import app from "./app.js";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection：", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception：", err);
  process.exit(1);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
