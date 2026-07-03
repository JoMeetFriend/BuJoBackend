import prisma from "../lib/prisma.js";

export const findUserAvatarById = async (userId) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      avatar_url: true,
    },
  });
};

export const updateUserAvatar = async (userId, avatarUrl) => {
  return prisma.user.update({
    where: { id: userId },
    data: { avatar_url: avatarUrl },
    select: {
      id: true,
      display_name: true,
      avatar_url: true,
    },
  });
};

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
