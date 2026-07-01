import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

jest.unstable_mockModule("../lib/prisma.js", () => ({
  default: {
    user: {
      findMany: jest.fn(),
    },
  },
}));

const { default: request } = await import("supertest");
const { default: app } = await import("../app.js");
const { default: prisma } = await import("../lib/prisma.js");

describe("User API Routes Integration Tests", () => {
  let validToken;
  const testUserId = "test-user-123";

  beforeAll(() => {
    const secret = process.env.JWT_SECRET || "test-secret";
    validToken = jwt.sign({ userId: testUserId }, secret);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/users/search", () => {
    it("未帶 Token 應該被擋下 (401)", async () => {
      const res = await request(app).get("/api/users/search?q=abc12");
      expect(res.status).toBe(401);
    });

    it("缺少 q 參數，應該被 Controller 擋下 (400)", async () => {
      const res = await request(app)
        .get("/api/users/search")
        .set("Cookie", [`token=${validToken}`]);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("無效的搜尋格式");
    });

    it("q 參數不是 5 碼，應該被 Controller 擋下 (400)", async () => {
      const res = await request(app)
        .get("/api/users/search?q=abcd")
        .set("Cookie", [`token=${validToken}`]);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("無效的搜尋格式");
    });

    it("q 參數包含非法字元 (非 16 進位)，應該被 Controller 擋下 (400)", async () => {
      const res = await request(app)
        .get("/api/users/search?q=xyz12")
        .set("Cookie", [`token=${validToken}`]);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("無效的搜尋格式");
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it("格式正確時，成功回傳搜尋結果 (200)", async () => {
      const mockUsers = [
        { id: "user-abc12", display_name: "John", avatar_url: null },
        { id: "another-abc12", display_name: "Jane", avatar_url: "http..." },
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const res = await request(app)
        .get("/api/users/search?q=AbC12")
        .set("Cookie", [`token=${validToken}`]);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockUsers);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            endsWith: "abc12",
            not: testUserId,
          },
        },
        select: {
          id: true,
          display_name: true,
          avatar_url: true,
        },
        take: 5,
      });
    });
  });
});
