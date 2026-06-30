import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

jest.unstable_mockModule("../lib/prisma.js", () => ({
  default: {
    user: {
      findUnique: jest.fn(),
    },
    friendship: {
      findFirst: jest.fn(),
      create: jest.fn(),
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
  const targetUserId = "user-target-456";

  beforeAll(() => {
    const secret = process.env.JWT_SECRET || "test-secret";
    validToken = jwt.sign({ userId: testUserId }, secret);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/friends/request", () => {
    it("1. 未帶 Token 時應該被 Middleware 擋下 (401)", async () => {
      const res = await request(app)
        .post("/api/friends/request")
        .send({ target_id: targetUserId });

      expect(res.status).toBe(401);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("2. 缺少 target_id 應該被 Controller 擋下 (400)", async () => {
      const res = await request(app)
        .post("/api/friends/request")
        .set("Cookie", [`token=${validToken}`])
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("缺少目標使用者 ID");
    });

    it("3. 不能將自己加為好友 (400)", async () => {
      const res = await request(app)
        .post("/api/friends/request")
        .set("Cookie", [`token=${validToken}`])
        .send({ target_id: testUserId });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("不能將自己加為好友");
    });

    it("4. 找不到目標使用者時 (404)", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/friends/request")
        .set("Cookie", [`token=${validToken}`])
        .send({ target_id: targetUserId });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("找不到目標使用者");
    });

    it("5. 已經是好友或已發送過請求，拒絕重複發送 (409)", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: targetUserId });
      prisma.friendship.findFirst.mockResolvedValue({
        requester_id: testUserId,
        receiver_id: targetUserId,
        status: "pending",
      });

      const res = await request(app)
        .post("/api/friends/request")
        .set("Cookie", [`token=${validToken}`])
        .send({ target_id: targetUserId });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe("已經是好友或已發送過請求");
      expect(prisma.friendship.create).not.toHaveBeenCalled();
    });

    it("6. 成功建立好友請求 (201)", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: targetUserId });
      prisma.friendship.findFirst.mockResolvedValue(null);
      prisma.friendship.create.mockResolvedValue({});

      const res = await request(app)
        .post("/api/friends/request")
        .set("Cookie", [`token=${validToken}`])
        .send({ target_id: targetUserId });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe("好友請求已發送");

      expect(prisma.friendship.create).toHaveBeenCalledWith({
        data: {
          requester_id: testUserId,
          receiver_id: targetUserId,
          status: "pending",
        },
      });
    });
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
