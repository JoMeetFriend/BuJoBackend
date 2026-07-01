import prisma from "../lib/prisma.js";

export const searchUsersByShortId = async (keyword, excludeUserId) => {
  const users = await prisma.user.findMany({
    where: {
      id: {
        endsWith: keyword.toLowerCase(),
        not: excludeUserId,
      },
    },
    select: {
      id: true,
      display_name: true,
      avatar_url: true,
    },
    take: 5,
  });

  return users;
};
