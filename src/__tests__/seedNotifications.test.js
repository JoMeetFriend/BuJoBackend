import { jest } from "@jest/globals";
import { seedNotifications } from "../../prisma/seeds/notifications.js";

const users = {
  alice: { id: "user-alice" },
  bob: { id: "user-bob" },
  carol: { id: "user-carol" },
  dave: { id: "user-dave" },
  eve: { id: "user-eve" },
};

const friendships = {
  aliceBob: { id: "friendship-alice-bob" },
  carolAlice: { id: "friendship-carol-alice" },
  daveToAlice: { id: "friendship-dave-alice" },
  aliceToEve: { id: "friendship-alice-eve" },
};

const activities = Object.fromEntries(
  [
    "fixedRecruiting",
    "rangeVoting",
    "dateVoting",
    "dateTimeVoting",
    "fixedConfirmed",
    "dateConfirmed",
    "dateTimeConfirmed",
    "cancelledActivity",
  ].map((key) => [key, { id: `activity-${key}` }]),
);

const now = new Date("2026-07-14T12:00:00.000Z");

function findNotification(data, { type, userId, referenceId }) {
  return data.find(
    (notification) =>
      notification.type === type &&
      notification.user_id === userId &&
      notification.reference_id === referenceId,
  );
}

describe("seedNotifications", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("一次建立固定 25 筆 Demo 通知並回傳 Prisma 結果", async () => {
    const createManyResult = { count: 25 };
    const prisma = {
      notification: {
        createMany: jest.fn().mockResolvedValue(createManyResult),
      },
    };

    const result = await seedNotifications(prisma, {
      users,
      friendships,
      activities,
    });

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    const [{ data }] = prisma.notification.createMany.mock.calls[0];
    expect(data).toHaveLength(25);
    expect(result).toBe(createManyResult);
  });

  it("保留六筆好友通知的收件方向、reference 與已讀狀態", async () => {
    const prisma = {
      notification: { createMany: jest.fn().mockResolvedValue({ count: 25 }) },
    };

    await seedNotifications(prisma, { users, friendships, activities });

    const [{ data }] = prisma.notification.createMany.mock.calls[0];
    const friendshipNotifications = data.filter(
      ({ reference_type }) => reference_type === "friendship",
    );
    expect(friendshipNotifications).toEqual([
      expect.objectContaining({
        user_id: users.bob.id,
        type: "friend_request_created",
        reference_id: friendships.aliceBob.id,
        is_read: true,
      }),
      expect.objectContaining({
        user_id: users.alice.id,
        type: "friend_request_accepted",
        reference_id: friendships.aliceBob.id,
        is_read: true,
      }),
      expect.objectContaining({
        user_id: users.alice.id,
        type: "friend_request_created",
        reference_id: friendships.carolAlice.id,
        is_read: true,
      }),
      expect.objectContaining({
        user_id: users.carol.id,
        type: "friend_request_accepted",
        reference_id: friendships.carolAlice.id,
        is_read: true,
      }),
      expect.objectContaining({
        user_id: users.alice.id,
        type: "friend_request_created",
        reference_id: friendships.daveToAlice.id,
        is_read: false,
      }),
      expect.objectContaining({
        user_id: users.eve.id,
        type: "friend_request_created",
        reference_id: friendships.aliceToEve.id,
        is_read: false,
      }),
    ]);
  });

  it("活動建立通知依真實建立者好友方向建立，且全部是已讀歷史通知", async () => {
    const prisma = {
      notification: { createMany: jest.fn().mockResolvedValue({ count: 25 }) },
    };

    await seedNotifications(prisma, { users, friendships, activities });

    const [{ data }] = prisma.notification.createMany.mock.calls[0];
    const created = data.filter(({ type }) => type === "activity_created");
    expect(created).toHaveLength(10);
    expect(created.every(({ is_read }) => is_read)).toBe(true);

    for (const activity of [
      activities.fixedRecruiting,
      activities.rangeVoting,
      activities.dateVoting,
      activities.dateTimeVoting,
    ]) {
      expect(
        created
          .filter(({ reference_id }) => reference_id === activity.id)
          .map(({ user_id }) => user_id),
      ).toEqual([users.bob.id, users.carol.id]);
    }

    expect(
      created
        .filter(({ reference_id }) => reference_id === activities.fixedConfirmed.id)
        .map(({ user_id }) => user_id),
    ).toEqual([users.alice.id]);
    expect(
      created
        .filter(({ reference_id }) => reference_id === activities.dateConfirmed.id)
        .map(({ user_id }) => user_id),
    ).toEqual([users.alice.id]);
  });

  it("生命週期通知只送給建立者或非建立者參與者，reference 正確且保持未讀", async () => {
    const prisma = {
      notification: { createMany: jest.fn().mockResolvedValue({ count: 25 }) },
    };

    await seedNotifications(prisma, { users, friendships, activities });

    const [{ data }] = prisma.notification.createMany.mock.calls[0];
    const lifecycle = data.filter(({ type }) =>
      [
        "formation_ready",
        "time_to_pick",
        "activity_confirmed",
        "activity_cancelled",
      ].includes(type),
    );
    expect(lifecycle).toHaveLength(9);
    expect(lifecycle.every(({ reference_type, is_read }) => reference_type === "activity" && !is_read))
      .toBe(true);

    expect(
      findNotification(data, {
        type: "formation_ready",
        userId: users.alice.id,
        referenceId: activities.rangeVoting.id,
      }),
    ).toBeDefined();

    for (const activity of [activities.dateVoting, activities.dateTimeVoting]) {
      expect(
        findNotification(data, {
          type: "time_to_pick",
          userId: users.alice.id,
          referenceId: activity.id,
        }),
      ).toBeDefined();
    }

    const confirmedRecipients = new Map([
      [activities.fixedConfirmed.id, [users.alice.id]],
      [activities.dateConfirmed.id, [users.alice.id, users.bob.id]],
      [activities.dateTimeConfirmed.id, [users.bob.id, users.carol.id]],
    ]);
    for (const [referenceId, recipientIds] of confirmedRecipients) {
      expect(
        lifecycle
          .filter(
            ({ type, reference_id }) =>
              type === "activity_confirmed" && reference_id === referenceId,
          )
          .map(({ user_id }) => user_id),
      ).toEqual(recipientIds);
    }

    expect(
      findNotification(data, {
        type: "activity_cancelled",
        userId: users.alice.id,
        referenceId: activities.cancelledActivity.id,
      }),
    ).toBeDefined();
  });

  it("生命週期時間依流程錯開，Dave 邀請仍是 Alice 最新通知", async () => {
    const prisma = {
      notification: { createMany: jest.fn().mockResolvedValue({ count: 25 }) },
    };

    await seedNotifications(prisma, { users, friendships, activities });

    const [{ data }] = prisma.notification.createMany.mock.calls[0];
    const aliceLifecycle = data
      .filter(
        ({ user_id, type }) =>
          user_id === users.alice.id &&
          [
            "formation_ready",
            "time_to_pick",
            "activity_confirmed",
            "activity_cancelled",
          ].includes(type),
      )
      .sort((a, b) => a.created_at - b.created_at);
    expect(aliceLifecycle.map(({ type }) => type)).toEqual([
      "formation_ready",
      "time_to_pick",
      "time_to_pick",
      "activity_confirmed",
      "activity_confirmed",
      "activity_cancelled",
    ]);
    expect(
      aliceLifecycle.every(
        (notification, index) =>
          index === 0 ||
          notification.created_at > aliceLifecycle[index - 1].created_at,
      ),
    ).toBe(true);

    const newestAliceNotification = data
      .filter(({ user_id }) => user_id === users.alice.id)
      .sort((a, b) => b.created_at - a.created_at)[0];
    expect(newestAliceNotification).toMatchObject({
      type: "friend_request_created",
      reference_id: friendships.daveToAlice.id,
    });
  });

  it("Prisma 寫入失敗時拋出同一個錯誤物件", async () => {
    const originalError = new Error("notification createMany failed");
    const prisma = {
      notification: {
        createMany: jest.fn().mockRejectedValue(originalError),
      },
    };

    await expect(
      seedNotifications(prisma, { users, friendships, activities }),
    ).rejects.toBe(originalError);

    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });
});
