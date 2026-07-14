import { jest } from "@jest/globals";
import { seedFriendships } from "../../prisma/seeds/friendships.js";

const users = {
  alice: { id: "user-alice" },
  bob: { id: "user-bob" },
  carol: { id: "user-carol" },
  dave: { id: "user-dave" },
  eve: { id: "user-eve" },
};

function createPrismaMock() {
  const transaction = {
    friendship: { create: jest.fn() },
    notification: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback) => callback(transaction)),
  };

  return { prisma, transaction };
}

describe("seedFriendships", () => {
  it("在單一 transaction 依序建立四筆 Demo 好友關係並回傳固定 key", async () => {
    const { prisma, transaction } = createPrismaMock();
    const createdFriendships = [
      { id: "friendship-alice-bob" },
      { id: "friendship-carol-alice" },
      { id: "friendship-dave-alice" },
      { id: "friendship-alice-eve" },
    ];
    transaction.friendship.create
      .mockResolvedValueOnce(createdFriendships[0])
      .mockResolvedValueOnce(createdFriendships[1])
      .mockResolvedValueOnce(createdFriendships[2])
      .mockResolvedValueOnce(createdFriendships[3]);

    const result = await seedFriendships(prisma, users);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.friendship.create).toHaveBeenCalledTimes(4);
    expect(transaction.friendship.create).toHaveBeenNthCalledWith(1, {
      data: {
        requester_id: users.alice.id,
        receiver_id: users.bob.id,
        status: "accepted",
      },
    });
    expect(transaction.friendship.create).toHaveBeenNthCalledWith(2, {
      data: {
        requester_id: users.carol.id,
        receiver_id: users.alice.id,
        status: "accepted",
      },
    });
    expect(transaction.friendship.create).toHaveBeenNthCalledWith(3, {
      data: {
        requester_id: users.dave.id,
        receiver_id: users.alice.id,
        status: "pending",
      },
    });
    expect(transaction.friendship.create).toHaveBeenNthCalledWith(4, {
      data: {
        requester_id: users.alice.id,
        receiver_id: users.eve.id,
        status: "pending",
      },
    });
    expect(result).toEqual({
      aliceBob: createdFriendships[0],
      carolAlice: createdFriendships[1],
      daveToAlice: createdFriendships[2],
      aliceToEve: createdFriendships[3],
    });
    expect(transaction.notification.create).not.toHaveBeenCalled();
  });

  it("建立關係失敗時保留原始錯誤並停止後續建立", async () => {
    const { prisma, transaction } = createPrismaMock();
    const originalError = new Error("friendship create failed");
    transaction.friendship.create
      .mockResolvedValueOnce({ id: "friendship-alice-bob" })
      .mockRejectedValueOnce(originalError);

    await expect(seedFriendships(prisma, users)).rejects.toBe(originalError);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.friendship.create).toHaveBeenCalledTimes(2);
    expect(transaction.notification.create).not.toHaveBeenCalled();
  });
});
