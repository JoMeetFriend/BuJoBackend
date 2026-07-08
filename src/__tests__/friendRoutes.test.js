import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

jest.unstable_mockModule("../lib/prisma.js", () => ({
  default: {
    friendship: {
      findMany: jest.fn(),
    },
  },
}));

const { default: request } = await import("supertest");
const { default: app } = await import("../app.js");
const { default: prisma } = await import("../lib/prisma.js");

describe("Friend API Routes Integration Tests", () => {
  let validToken;
  const testUserId = "user-requester-123";

  beforeAll(() => {
    const secret = process.env.JWT_SECRET || "test-secret";
    validToken = jwt.sign({ userId: testUserId }, secret);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/friends", () => {
    it("1. 未帶 Token 應該被擋下 (401)", async () => {
      const res = await request(app).get("/api/friends");
      expect(res.status).toBe(401);
    });

    it("2. 成功取得並正確過濾自己的資料 (200)", async () => {
      prisma.friendship.findMany.mockResolvedValue([
        {
          requester_id: testUserId,
          receiver_id: "friend-1",
          status: "accepted",
          requester: { id: testUserId, display_name: "Me" },
          receiver: { id: "friend-1", display_name: "Bob" },
        },
        {
          requester_id: "friend-2",
          receiver_id: testUserId,
          status: "accepted",
          requester: { id: "friend-2", display_name: "Alice" },
          receiver: { id: testUserId, display_name: "Me" },
        },
      ]);

      const res = await request(app)
        .get("/api/friends")
        .set("Cookie", [`token=${validToken}`]);

      expect(res.status).toBe(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe("friend-1");
      expect(res.body[0].display_name).toBe("Bob");
      expect(res.body[1].id).toBe("friend-2");
      expect(res.body[1].display_name).toBe("Alice");
    });
  });
});
