import { jest } from "@jest/globals";
import bcrypt from "bcryptjs";

const uploadAvatarImage = jest.fn();

jest.unstable_mockModule("../services/cloudinaryAvatarService.js", () => ({
  uploadAvatarImage,
}));

const { seedUsers } = await import("../../prisma/seeds/users.js");

const DEMO_PASSWORD = "BujoDemo#2026";

const expectedUsers = [
  {
    key: "alice",
    display_name: "Alice",
    email: "alice@example.com",
    bio: "喜歡記錄生活，也喜歡和朋友一起安排活動。",
  },
  {
    key: "bob",
    display_name: "Bob",
    email: "bob@example.com",
    bio: "電影、咖啡與週末小旅行。",
  },
  {
    key: "carol",
    display_name: "Carol",
    email: "carol@example.com",
    bio: "喜歡桌遊、戶外活動和認識新朋友。",
  },
  {
    key: "dave",
    display_name: "Dave",
    email: "dave@example.com",
    bio: null,
  },
  {
    key: "eve",
    display_name: "Eve",
    email: "eve@example.com",
    bio: null,
  },
];

describe("seedUsers", () => {
  beforeEach(() => {
    uploadAvatarImage.mockReset();
    uploadAvatarImage.mockImplementation(async (_file, { publicId }) => {
      const key = publicId.split("/").at(-1);
      return {
        avatarUrl: `https://res.cloudinary.com/demo/image/upload/${key}.png`,
        publicId: `bujo/avatars/${publicId}`,
      };
    });
  });

  it("在單一 transaction 建立五位 local-only Demo 使用者並回傳固定角色", async () => {
    const userCreate = jest.fn(async ({ data }) => ({
      id: `user-${data.display_name.toLowerCase()}`,
      display_name: data.display_name,
      avatar_url: data.avatar_url,
      avatar_public_id: data.avatar_public_id,
      bio: data.bio,
    }));
    const transactionClient = { user: { create: userCreate } };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transactionClient)),
    };
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
      const users = await seedUsers(prisma);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(uploadAvatarImage).toHaveBeenCalledTimes(5);
      expect(userCreate).toHaveBeenCalledTimes(5);
      expect(Object.keys(users)).toEqual(expectedUsers.map(({ key }) => key));

      const createPayloads = userCreate.mock.calls.map(([{ data }]) => data);
      for (const [index, expected] of expectedUsers.entries()) {
        const payload = createPayloads[index];
        expect(payload).toMatchObject({
          display_name: expected.display_name,
          avatar_url: `https://res.cloudinary.com/demo/image/upload/${expected.key}.png`,
          avatar_public_id: `bujo/avatars/demo-users/${expected.key}`,
          bio: expected.bio,
          identities: {
            create: {
              provider: "local",
              provider_user_id: expected.email,
              email: expected.email,
            },
          },
        });
        expect(users[expected.key]).toEqual(
          expect.objectContaining({
            id: `user-${expected.key}`,
            display_name: expected.display_name,
          }),
        );
        expect(uploadAvatarImage).toHaveBeenNthCalledWith(
          index + 1,
          { buffer: expect.any(Buffer) },
          { publicId: `demo-users/${expected.key}` },
        );
      }

      const passwordHashes = createPayloads.map(
        ({ identities }) => identities.create.password_hash,
      );
      expect(new Set(passwordHashes).size).toBe(1);
      expect(passwordHashes[0]).not.toBe(DEMO_PASSWORD);
      await expect(bcrypt.compare(DEMO_PASSWORD, passwordHashes[0])).resolves.toBe(
        true,
      );
      expect(consoleSpy).not.toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("頭像上傳失敗時不啟動 User transaction", async () => {
    const uploadError = new Error("Cloudinary upload failed");
    uploadAvatarImage.mockRejectedValueOnce(uploadError);
    const prisma = { $transaction: jest.fn() };

    await expect(seedUsers(prisma)).rejects.toBe(uploadError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
