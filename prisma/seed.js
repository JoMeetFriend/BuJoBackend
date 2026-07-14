import { PrismaClient } from "@prisma/client";
import { seedActivities } from "./seeds/activities.js";
import { seedFriendships } from "./seeds/friendships.js";
import { seedNotifications } from "./seeds/notifications.js";
import { seedUsers } from "./seeds/users.js";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 開始種入新版 Demo 假資料...");

  const users = await seedUsers(prisma);
  const friendships = await seedFriendships(prisma, users);
  const activities = await seedActivities(prisma, users);

  await seedNotifications(prisma, {
    users,
    friendships,
    activities,
  });

  console.log("🎉v2 Demo 假資料種入完成！");
}

main()
  .catch((error) => {
    console.error("❌ v2 Demo 假資料種入失敗：", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
