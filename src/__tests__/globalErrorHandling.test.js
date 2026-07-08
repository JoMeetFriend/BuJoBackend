import "express-async-errors";
import express from "express";
import request from "supertest";

describe("全域錯誤處理機制（express-async-errors + 全域 error middleware）", () => {
  function buildTestApp() {
    const app = express();

    app.get("/boom", async () => {
      throw new Error("boom");
    });

    app.use((err, req, res, next) => {
      res.status(500).json({ message: "伺服器錯誤" });
    });

    return app;
  }

  it("async route handler 沒包 try/catch 直接 throw 時，會被機制接住並回傳 500，而不是讓 request 掛住", async () => {
    const app = buildTestApp();

    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "伺服器錯誤" });
  });
});
