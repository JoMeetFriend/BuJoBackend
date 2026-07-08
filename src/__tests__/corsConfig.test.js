import { jest } from "@jest/globals";

process.env.ALLOWED_ORIGINS = "https://allowed.example.com";

jest.unstable_mockModule("../lib/prisma.js", () => ({
  default: {},
}));

const { default: request } = await import("supertest");
const { default: app } = await import("../app.js");

describe("CORS 設定", () => {
  it("允許清單內的 Origin，並在回應反映該 Origin", async () => {
    const res = await request(app).get("/").set("Origin", "https://allowed.example.com");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://allowed.example.com");
  });

  it("拒絕不在清單內的 Origin", async () => {
    const res = await request(app).get("/").set("Origin", "https://evil.example.com");

    expect(res.status).toBe(500);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("沒有 Origin 標頭的請求（非瀏覽器工具／server-to-server）直接放行", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Bujo backend is running" });
  });
});
