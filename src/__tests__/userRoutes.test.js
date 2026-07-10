import { jest } from "@jest/globals";
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

jest.unstable_mockModule("../services/cloudinaryAvatarService.js", () => ({
  uploadAvatarImage: jest.fn(),
  deleteAvatarImage: jest.fn(),
}));

const { default: request } = await import("supertest");
const { default: app } = await import("../app.js");
const { default: prisma } = await import("../lib/prisma.js");
const { uploadAvatarImage, deleteAvatarImage } =
  await import("../services/cloudinaryAvatarService.js");

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
        avatar_public_id: null,
      });
      uploadAvatarImage.mockResolvedValue({
        avatarUrl: "https://res.cloudinary.com/demo/image/upload/avatar.png",
        publicId: "bujo/avatars/avatar-public-id",
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
        avatar_url: "https://res.cloudinary.com/demo/image/upload/avatar.png",
      });
      expect(uploadAvatarImage).toHaveBeenCalledWith(
        expect.objectContaining({
          buffer: expect.any(Buffer),
          mimetype: "image/png",
        }),
      );
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: testUserId },
        select: { id: true, avatar_url: true, avatar_public_id: true },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: testUserId },
        data: {
          avatar_url: "https://res.cloudinary.com/demo/image/upload/avatar.png",
          avatar_public_id: "bujo/avatars/avatar-public-id",
        },
        select: {
          id: true,
          display_name: true,
          avatar_url: true,
        },
      });
      expect(deleteAvatarImage).not.toHaveBeenCalled();
    });

    it("更新成功後應該移除舊的 Cloudinary 頭像", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: testUserId,
        avatar_url:
          "https://res.cloudinary.com/demo/image/upload/old-avatar.png",
        avatar_public_id: "bujo/avatars/old-avatar",
      });
      uploadAvatarImage.mockResolvedValue({
        avatarUrl:
          "https://res.cloudinary.com/demo/image/upload/new-avatar.png",
        publicId: "bujo/avatars/new-avatar",
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
      expect(deleteAvatarImage).toHaveBeenCalledWith("bujo/avatars/old-avatar");
    });

    it("Cloudinary 上傳失敗時應該回傳 500 並且不更新資料庫", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: testUserId,
        avatar_url: null,
        avatar_public_id: null,
      });
      uploadAvatarImage.mockRejectedValue(
        new Error("Cloudinary upload failed"),
      );

      const res = await request(app)
        .patch("/api/users/me/avatar")
        .set("Cookie", [`token=${validToken}`])
        .attach("avatar", Buffer.from("png image"), {
          filename: "avatar.png",
          contentType: "image/png",
        });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe("伺服器內部錯誤");
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(deleteAvatarImage).not.toHaveBeenCalled();
    });

    it("資料庫更新失敗時應該清理剛上傳的 Cloudinary 頭像", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: testUserId,
        avatar_url: null,
        avatar_public_id: null,
      });
      uploadAvatarImage.mockResolvedValue({
        avatarUrl:
          "https://res.cloudinary.com/demo/image/upload/new-avatar.png",
        publicId: "bujo/avatars/new-avatar",
      });
      prisma.user.update.mockRejectedValue(new Error("DB update failed"));

      const res = await request(app)
        .patch("/api/users/me/avatar")
        .set("Cookie", [`token=${validToken}`])
        .attach("avatar", Buffer.from("png image"), {
          filename: "avatar.png",
          contentType: "image/png",
        });

      expect(res.status).toBe(500);
      expect(deleteAvatarImage).toHaveBeenCalledWith("bujo/avatars/new-avatar");
    });
  });

  describe("PATCH /api/users/me/name", () => {
    it("未帶 Token 應該被擋下 (401)", async () => {
      const res = await request(app)
        .patch("/api/users/me/name")
        .send({ display_name: "New Name" });

      expect(res.status).toBe(401);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("缺少 display_name 應該回傳 400", async () => {
      const res = await request(app)
        .patch("/api/users/me/name")
        .set("Cookie", [`token=${validToken}`])
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("無效的名稱格式");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("display_name 非字串 (例如傳入數字) 應該回傳 400", async () => {
      const res = await request(app)
        .patch("/api/users/me/name")
        .set("Cookie", [`token=${validToken}`])
        .send({ display_name: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("無效的名稱格式");
    });

    it("display_name 為全空白字串，trim 後應該回傳 400", async () => {
      const res = await request(app)
        .patch("/api/users/me/name")
        .set("Cookie", [`token=${validToken}`])
        .send({ display_name: "     " });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("顯示名稱不可為空白");
    });

    it("display_name 超過 50 個字元應該回傳 400", async () => {
      const excessivelyLongName = "a".repeat(51);
      const res = await request(app)
        .patch("/api/users/me/name")
        .set("Cookie", [`token=${validToken}`])
        .send({ display_name: excessivelyLongName });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("顯示名稱不可超過 50 個字元");
    });

    it("合法字串應該更新名稱並回傳 200 (測試包含前後空白的過濾)", async () => {
      const inputName = "  Super Bob  ";
      const expectedTrimmedName = "Super Bob";

      prisma.user.update.mockResolvedValue({
        id: testUserId,
        display_name: expectedTrimmedName,
        avatar_url: "https://example.com/avatar.png",
      });

      const res = await request(app)
        .patch("/api/users/me/name")
        .set("Cookie", [`token=${validToken}`])
        .send({ display_name: inputName });

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        id: testUserId,
        display_name: expectedTrimmedName,
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: testUserId },
        data: { display_name: expectedTrimmedName },
        select: {
          id: true,
          display_name: true,
          avatar_url: true,
        },
      });
    });

    it("資料庫層級發生錯誤時，應捕捉並回傳 500", async () => {
      prisma.user.update.mockRejectedValue(new Error("Database deadlock"));

      const res = await request(app)
        .patch("/api/users/me/name")
        .set("Cookie", [`token=${validToken}`])
        .send({ display_name: "Valid Name" });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe("伺服器內部錯誤");
    });
  });

  describe("PATCH /api/users/me/bio", () => {
    it("未帶 Token 應該被擋下 (401)", async () => {
      const res = await request(app)
        .patch("/api/users/me/bio")
        .send({ bio: "這是一段新簡介" });

      expect(res.status).toBe(401);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("bio 傳入非字串型別 (例如數字或陣列)，應該被 Controller 擋下 (400)", async () => {
      const res = await request(app)
        .patch("/api/users/me/bio")
        .set("Cookie", [`token=${validToken}`])
        .send({ bio: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("無效的簡介格式");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("bio 超過 150 個字元，應該回傳 400 拒絕寫入", async () => {
      const excessivelyLongBio = "a".repeat(151);
      const res = await request(app)
        .patch("/api/users/me/bio")
        .set("Cookie", [`token=${validToken}`])
        .send({ bio: excessivelyLongBio });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("簡介不可超過 150 個字元");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("合法字串應該更新簡介並回傳 200 (包含前後空白過濾)", async () => {
      const inputBio = "  這是我熱愛寫程式的簡介。  ";
      const expectedTrimmedBio = "這是我熱愛寫程式的簡介。";

      prisma.user.update.mockResolvedValue({
        id: testUserId,
        display_name: "Test User",
        bio: expectedTrimmedBio,
      });

      const res = await request(app)
        .patch("/api/users/me/bio")
        .set("Cookie", [`token=${validToken}`])
        .send({ bio: inputBio });

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        id: testUserId,
        bio: expectedTrimmedBio,
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: testUserId },
        data: { bio: expectedTrimmedBio },
        select: {
          id: true,
          display_name: true,
          bio: true,
        },
      });
    });

    it("允許傳入空字串來清空簡介 (200)", async () => {
      prisma.user.update.mockResolvedValue({
        id: testUserId,
        display_name: "Test User",
        bio: "",
      });

      const res = await request(app)
        .patch("/api/users/me/bio")
        .set("Cookie", [`token=${validToken}`])
        .send({ bio: "   " });

      expect(res.status).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { bio: "" },
        }),
      );
    });

    it("資料庫層級發生錯誤時，應捕捉並回傳 500", async () => {
      prisma.user.update.mockRejectedValue(new Error("Database timeout"));

      const res = await request(app)
        .patch("/api/users/me/bio")
        .set("Cookie", [`token=${validToken}`])
        .send({ bio: "正常的簡介" });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe("伺服器內部錯誤");
    });
  });
});
