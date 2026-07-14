import prisma from "../lib/prisma.js";

export const getAcceptedFriendsList = async (currentUserId) => {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { requester_id: currentUserId, status: "accepted" },
        { receiver_id: currentUserId, status: "accepted" },
      ],
    },
    include: {
      requester: {
        select: { id: true, display_name: true, avatar_url: true, bio: true },
      },
      receiver: {
        select: { id: true, display_name: true, avatar_url: true, bio: true },
      },
    },
  });

  return friendships.map((f) => {
    const friendUser =
      f.requester_id === currentUserId ? f.receiver : f.requester;
    return {
      id: friendUser.id,
      display_name: friendUser.display_name,
      avatar_url: friendUser.avatar_url,
      bio: friendUser.bio,
      friendship_id: f.id,
    };
  });
};
