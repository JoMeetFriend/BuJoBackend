import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import { uploadAvatarImage } from "../../src/services/cloudinaryAvatarService.js";

const DEMO_PASSWORD = "BujoDemo#2026";
const BCRYPT_COST = 10;

const DEMO_USERS = [
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

/**
 * 建立 Demo 使用者與各自的本地登入方式。
 */
export async function seedUsers(prisma) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);
  const avatars = {};

  for (const { key } of DEMO_USERS) {
    const buffer = await readFile(
      new URL(`../seed-assets/avatars/${key}.png`, import.meta.url),
    );
    avatars[key] = await uploadAvatarImage(
      { buffer },
      { publicId: `demo-users/${key}` },
    );
  }

  return prisma.$transaction(async (transaction) => {
    const users = {};

    for (const { key, email, ...profile } of DEMO_USERS) {
      users[key] = await transaction.user.create({
        data: {
          ...profile,
          avatar_url: avatars[key].avatarUrl,
          avatar_public_id: avatars[key].publicId,
          identities: {
            create: {
              provider: "local",
              provider_user_id: email,
              email,
              password_hash: passwordHash,
            },
          },
        },
      });
    }

    return users;
  });
}
