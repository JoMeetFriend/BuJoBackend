/**
 * 建立 Demo 使用者之間的好友關係。
 */
export async function seedFriendships(prisma, users) {
  return prisma.$transaction(async (transaction) => {
    const aliceBob = await transaction.friendship.create({
      data: {
        requester_id: users.alice.id,
        receiver_id: users.bob.id,
        status: "accepted",
      },
    });

    const carolAlice = await transaction.friendship.create({
      data: {
        requester_id: users.carol.id,
        receiver_id: users.alice.id,
        status: "accepted",
      },
    });

    const daveToAlice = await transaction.friendship.create({
      data: {
        requester_id: users.dave.id,
        receiver_id: users.alice.id,
        status: "pending",
      },
    });

    const aliceToEve = await transaction.friendship.create({
      data: {
        requester_id: users.alice.id,
        receiver_id: users.eve.id,
        status: "pending",
      },
    });

    return { aliceBob, carolAlice, daveToAlice, aliceToEve };
  });
}
