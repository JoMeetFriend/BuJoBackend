import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

const searchAddress = jest.fn().mockResolvedValue({ status: "ok", results: [] });

jest.unstable_mockModule("../services/placesService.js", () => ({
  searchAddress,
}));

const { default: request } = await import("supertest");
const { default: app } = await import("../app.js");

// 要跟 rateLimiter.js 裡 placesLimiter 的 limit 對齊
const PLACES_LIMIT_PER_WINDOW = 30;

describe("GET /api/places/autocomplete 限流", () => {
  let userAToken;
  let userBToken;

  beforeAll(() => {
    const secret = process.env.JWT_SECRET || "test-secret";
    userAToken = jwt.sign({ userId: "rate-limit-user-a" }, secret);
    userBToken = jwt.sign({ userId: "rate-limit-user-b" }, secret);
  });

  it("以登入使用者計算配額，同一使用者用滿配額後被 429 擋下，其他使用者不受影響", async () => {
    for (let i = 0; i < PLACES_LIMIT_PER_WINDOW; i++) {
      const res = await request(app)
        .get("/api/places/autocomplete?q=測試地址")
        .set("Cookie", [`token=${userAToken}`]);
      expect(res.status).toBe(200);
    }

    const blocked = await request(app)
      .get("/api/places/autocomplete?q=測試地址")
      .set("Cookie", [`token=${userAToken}`]);
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe("搜尋太頻繁，請稍後再試");

    const userBRes = await request(app)
      .get("/api/places/autocomplete?q=測試地址")
      .set("Cookie", [`token=${userBToken}`]);
    expect(userBRes.status).toBe(200);
  });
});
