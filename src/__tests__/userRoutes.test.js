import { jest } from "@jest/globals";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

jest.unstable_mockModule("../lib/prisma.js", () => ({
  default: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const { default: request } = await import("supertest");
const { default: app } = await import("../app.js");
const { default: prisma } = await import("../lib/prisma.js");

const avatarUploadDir = fileURLToPath(
  new URL("../../uploads/avatars/", import.meta.url),
);

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

  afterEach(() => {
    fs.rmSync(avatarUploadDir, { recursive: true, force: true });
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

  describe("PATCH /api/users/me/avatar", () => {
    it("未帶 Token 應該被擋下 (401)", async () => {
      const res = await request(app)
        .patch("/api/users/me/avatar")
        .attach("avatar", Buffer.from("image"), {
          filename: "avatar.png",
          contentType: "image/png",
        });

      expect(res.status).toBe(401);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("未附 avatar 檔案應該回傳 400", async () => {
      const res = await request(app)
        .patch("/api/users/me/avatar")
        .set("Cookie", [`token=${validToken}`]);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("請上傳頭像圖片");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("非圖片 MIME type 應該回傳 400", async () => {
      const res = await request(app)
        .patch("/api/users/me/avatar")
        .set("Cookie", [`token=${validToken}`])
        .attach("avatar", Buffer.from("not an image"), {
          filename: "avatar.txt",
          contentType: "text/plain",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("頭像只支援 JPG、PNG 或 WebP 圖片");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("超過 2MB 的圖片應該回傳 413", async () => {
      const oversizedImage = Buffer.alloc(2 * 1024 * 1024 + 1);

      const res = await request(app)
        .patch("/api/users/me/avatar")
        .set("Cookie", [`token=${validToken}`])
        .attach("avatar", oversizedImage, {
          filename: "avatar.png",
          contentType: "image/png",
        });

      expect(res.status).toBe(413);
      expect(res.body.message).toBe("頭像圖片不可超過 2MB");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("合法圖片上傳後應該更新目前使用者的 avatar_url", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: testUserId,
        avatar_url: null,
      });
      prisma.user.update.mockImplementation(async ({ data }) => ({
        id: testUserId,
        display_name: "Test User",
        avatar_url: data.avatar_url,
      }));

      const res = await request(app)
        .patch("/api/users/me/avatar")
        .set("Cookie", [`token=${validToken}`])
        .attach("avatar", Buffer.from("png image"), {
          filename: "avatar.png",
          contentType: "image/png",
        });

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        id: testUserId,
        display_name: "Test User",
      });
      expect(res.body.user.avatar_url).toMatch(
        /^\/uploads\/avatars\/avatar-test-user-123-/,
      );
      expect(res.body.user.avatar_url).toMatch(/\.png$/);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: testUserId },
        select: { id: true, avatar_url: true },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: testUserId },
        data: { avatar_url: res.body.user.avatar_url },
        select: {
          id: true,
          display_name: true,
          avatar_url: true,
        },
      });
    });

    it("更新成功後應該移除舊的本機頭像檔案", async () => {
      fs.mkdirSync(avatarUploadDir, { recursive: true });
      const oldAvatarPath = fileURLToPath(
        new URL("../../uploads/avatars/old-avatar.png", import.meta.url),
      );
      fs.writeFileSync(oldAvatarPath, "old avatar");

      prisma.user.findUnique.mockResolvedValue({
        id: testUserId,
        avatar_url: "/uploads/avatars/old-avatar.png",
      });
      prisma.user.update.mockImplementation(async ({ data }) => ({
        id: testUserId,
        display_name: "Test User",
        avatar_url: data.avatar_url,
      }));

      const res = await request(app)
        .patch("/api/users/me/avatar")
        .set("Cookie", [`token=${validToken}`])
        .attach("avatar", Buffer.from("new png image"), {
          filename: "avatar.png",
          contentType: "image/png",
        });

      expect(res.status).toBe(200);
      expect(fs.existsSync(oldAvatarPath)).toBe(false);
    });
  });
});
