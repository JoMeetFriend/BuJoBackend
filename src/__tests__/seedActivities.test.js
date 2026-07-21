import { jest } from "@jest/globals";
import { seedActivities } from "../../prisma/seeds/activities.js";

const users = {
  alice: { id: "user-alice" },
  bob: { id: "user-bob" },
  carol: { id: "user-carol" },
  dave: { id: "user-dave" },
  eve: { id: "user-eve" },
};

const now = new Date("2026-07-21T12:00:00.000Z");
const taipeiAt = (day, hour, minute = 0) =>
  new Date(Date.UTC(2026, 6, 21 + day, hour - 8, minute));

function createPrismaMock() {
  let activitySequence = 0;
  const transaction = {
    activity: {
      create: jest.fn(async ({ data }) => {
        activitySequence += 1;
        return {
          id: `activity-${activitySequence}`,
          ...data,
          candidateSlots: data.candidateSlots.create.map((slot, index) => ({
            id: `activity-${activitySequence}-slot-${index + 1}`,
            ...slot,
          })),
        };
      }),
    },
    activitySchedule: { update: jest.fn(async ({ data }) => data) },
    activityAvailability: { createMany: jest.fn(async ({ data }) => ({ count: data.length })) },
    activityAvailabilityRange: {
      createMany: jest.fn(async ({ data }) => ({ count: data.length })),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback) => callback(transaction)),
  };

  return { prisma, transaction };
}

function createdActivityData(transaction, title) {
  const call = transaction.activity.create.mock.calls.find(
    ([{ data }]) => data.title === title,
  );
  return call?.[0].data;
}

describe("seedActivities", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("在單一 transaction 建立十七筆活動並回傳固定 key", async () => {
    const { prisma, transaction } = createPrismaMock();

    const result = await seedActivities(prisma, users);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 30_000,
    });
    expect(transaction.activity.create).toHaveBeenCalledTimes(17);
    expect(Object.keys(result)).toEqual([
      "fixedRecruiting",
      "rangeVoting",
      "dateVoting",
      "dateTimeVoting",
      "fixedConfirmed",
      "dateConfirmed",
      "dateTimeConfirmed",
      "cancelledActivity",
      "calendarMorningYoga",
      "calendarTeamLunch",
      "calendarBoardGames",
      "calendarWeekendBrunch",
      "calendarRiversideCycling",
      "calendarSunsetCoffeeWalk",
      "calendarAfterWorkGathering",
      "calendarJapaneseDinner",
      "calendarBreakfastMeetup",
    ]);
    expect(Object.values(result).map(({ id }) => id)).toEqual(
      Array.from({ length: 17 }, (_, index) => `activity-${index + 1}`),
    );
  });

  it("建立四種 schedule shape，且日期以 Asia/Taipei 的 seed 當日計算", async () => {
    const { prisma, transaction } = createPrismaMock();

    await seedActivities(prisma, users);

    const fixed = createdActivityData(transaction, "週末野餐");
    expect(fixed).toMatchObject({
      creator_id: users.alice.id,
      status: "recruiting",
      schedule: {
        create: {
          requires_voting: false,
          availability_mode: "slot",
          deadline_at: taipeiAt(4, 11),
          vote_deadline_at: taipeiAt(3, 20),
        },
      },
      candidateSlots: {
        create: [
          {
            slot_start: taipeiAt(4, 11),
            slot_end: taipeiAt(4, 14),
            all_day: false,
          },
        ],
      },
    });

    const range = createdActivityData(transaction, "咖啡廳讀書會");
    expect(range.schedule.create).toEqual({
      requires_voting: true,
      availability_mode: "range",
      fixed_date: taipeiAt(6, 0),
      time_window_start: taipeiAt(6, 13),
      time_window_end: taipeiAt(6, 18),
      deadline_at: taipeiAt(6, 13),
      vote_deadline_at: taipeiAt(2, 20),
    });
    expect(range.candidateSlots.create).toEqual([]);

    const findDate = createdActivityData(transaction, "近郊踏青");
    expect(findDate.schedule.create).toMatchObject({
      requires_voting: true,
      availability_mode: "slot",
    });
    expect(findDate.candidateSlots.create).toHaveLength(3);
    expect(
      findDate.candidateSlots.create.map(({ slot_start, slot_end }) =>
        slot_end.getTime() - slot_start.getTime(),
      ),
    ).toEqual([6, 6, 6].map((hours) => hours * 60 * 60 * 1000));

    const findDateTime = createdActivityData(transaction, "晚餐聚會");
    expect(findDateTime.schedule.create).toMatchObject({
      requires_voting: true,
      availability_mode: "slot",
    });
    expect(findDateTime.candidateSlots.create).toEqual([
      {
        slot_start: taipeiAt(10, 18),
        slot_end: taipeiAt(10, 22),
        all_day: false,
      },
      {
        slot_start: taipeiAt(11, 18),
        slot_end: taipeiAt(11, 21),
        all_day: false,
      },
    ]);
  });

  it("建立 range 三人交集、候選日期票數排名及候選窗口窄時段", async () => {
    const { prisma, transaction } = createPrismaMock();

    await seedActivities(prisma, users);

    expect(transaction.activityAvailabilityRange.createMany).toHaveBeenCalledWith({
      data: [
        {
          activity_id: "activity-2",
          user_id: users.bob.id,
          range_start: taipeiAt(6, 14),
          range_end: taipeiAt(6, 17),
        },
        {
          activity_id: "activity-2",
          user_id: users.carol.id,
          range_start: taipeiAt(6, 15),
          range_end: taipeiAt(6, 16),
        },
        {
          activity_id: "activity-2",
          user_id: users.dave.id,
          range_start: taipeiAt(6, 15),
          range_end: taipeiAt(6, 18),
        },
      ],
    });

    const [dateVotesCall, dateTimeVotesCall] =
      transaction.activityAvailability.createMany.mock.calls;
    const dateVotes = dateVotesCall[0].data;
    expect(dateVotes).toHaveLength(5);
    expect(
      dateVotes.reduce((counts, vote) => {
        counts[vote.candidate_slot_id] = (counts[vote.candidate_slot_id] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({
      "activity-3-slot-1": 2,
      "activity-3-slot-2": 2,
      "activity-3-slot-3": 1,
    });

    const dateTimeVotes = dateTimeVotesCall[0].data;
    expect(dateTimeVotes.filter(({ candidate_slot_id }) => candidate_slot_id === "activity-4-slot-1"))
      .toEqual([
        expect.objectContaining({
          user_id: users.bob.id,
          range_start: taipeiAt(10, 18, 30),
          range_end: taipeiAt(10, 21),
        }),
        expect.objectContaining({
          user_id: users.carol.id,
          range_start: taipeiAt(10, 19),
          range_end: taipeiAt(10, 20, 30),
        }),
        expect.objectContaining({
          user_id: users.dave.id,
          range_start: taipeiAt(10, 19, 30),
          range_end: taipeiAt(10, 20),
        }),
      ]);
  });

  it("十二筆 confirmed 活動都連到第一個候選時段，且同日活動由看展排在 KTV 前", async () => {
    const { prisma, transaction } = createPrismaMock();

    await seedActivities(prisma, users);

    expect(transaction.activitySchedule.update.mock.calls).toEqual([
      [
        {
          where: { activity_id: "activity-5" },
          data: { confirmed_slot_id: "activity-5-slot-1" },
        },
      ],
      [
        {
          where: { activity_id: "activity-6" },
          data: { confirmed_slot_id: "activity-6-slot-1" },
        },
      ],
      [
        {
          where: { activity_id: "activity-7" },
          data: { confirmed_slot_id: "activity-7-slot-1" },
        },
      ],
      [
        {
          where: { activity_id: "activity-9" },
          data: { confirmed_slot_id: "activity-9-slot-1" },
        },
      ],
      [
        {
          where: { activity_id: "activity-10" },
          data: { confirmed_slot_id: "activity-10-slot-1" },
        },
      ],
      [
        {
          where: { activity_id: "activity-11" },
          data: { confirmed_slot_id: "activity-11-slot-1" },
        },
      ],
      [
        {
          where: { activity_id: "activity-12" },
          data: { confirmed_slot_id: "activity-12-slot-1" },
        },
      ],
      [
        {
          where: { activity_id: "activity-13" },
          data: { confirmed_slot_id: "activity-13-slot-1" },
        },
      ],
      [
        {
          where: { activity_id: "activity-14" },
          data: { confirmed_slot_id: "activity-14-slot-1" },
        },
      ],
      [
        {
          where: { activity_id: "activity-15" },
          data: { confirmed_slot_id: "activity-15-slot-1" },
        },
      ],
      [
        {
          where: { activity_id: "activity-16" },
          data: { confirmed_slot_id: "activity-16-slot-1" },
        },
      ],
      [
        {
          where: { activity_id: "activity-17" },
          data: { confirmed_slot_id: "activity-17-slot-1" },
        },
      ],
    ]);

    const exhibition = createdActivityData(transaction, "週末看展");
    const ktv = createdActivityData(transaction, "KTV 聚會");
    expect(exhibition.candidateSlots.create[0].slot_start).toEqual(taipeiAt(13, 14));
    expect(ktv.candidateSlots.create[0].slot_start).toEqual(taipeiAt(13, 19));
    expect(exhibition.candidateSlots.create[0].slot_start.getTime()).toBeLessThan(
      ktv.candidateSlots.create[0].slot_start.getTime(),
    );
  });

  it("額外四筆月曆活動都已成團、包含 Alice，並安排在不同日期", async () => {
    const { prisma, transaction } = createPrismaMock();

    await seedActivities(prisma, users);

    const expected = [
      ["晨間瑜珈", taipeiAt(2, 8)],
      ["週日午餐", taipeiAt(5, 12)],
      ["桌遊之夜", taipeiAt(8, 19)],
      ["週末早午餐", taipeiAt(18, 11)],
    ];

    for (const [title, slotStart] of expected) {
      const activity = createdActivityData(transaction, title);
      expect(activity.status).toBe("confirmed");
      expect(activity.participants.create).toContainEqual({ user_id: users.alice.id });
      expect(activity.candidateSlots.create[0].slot_start).toEqual(slotStart);
    }
  });

  it("Alice 在 seed 日後第 4 至第 8 天有 2、1、1、1、2 筆 confirmed 月曆活動", async () => {
    const { prisma, transaction } = createPrismaMock();

    await seedActivities(prisma, users);

    const windowStart = taipeiAt(4, 0);
    const windowEnd = taipeiAt(9, 0);
    const confirmedStarts = transaction.activity.create.mock.calls
      .map(([{ data }]) => data)
      .filter(({ status, candidateSlots }) => {
        const slotStart = candidateSlots.create[0]?.slot_start;
        return (
          status === "confirmed" &&
          slotStart >= windowStart &&
          slotStart < windowEnd
        );
      })
      .map(({ candidateSlots }) => candidateSlots.create[0].slot_start)
      .sort((a, b) => a - b);

    expect(confirmedStarts).toEqual([
      taipeiAt(4, 8),
      taipeiAt(4, 16),
      taipeiAt(5, 12),
      taipeiAt(6, 19),
      taipeiAt(7, 18, 30),
      taipeiAt(8, 7, 30),
      taipeiAt(8, 19),
    ]);
  });

  it("新增五筆已成團活動的建立者、Alice 參與、時段與 confirmed slot 關聯正確", async () => {
    const { prisma, transaction } = createPrismaMock();

    await seedActivities(prisma, users);

    const expectedActivities = [
      {
        title: "河濱單車晨騎",
        creatorId: users.bob.id,
        slotStart: taipeiAt(4, 8),
        slotEnd: taipeiAt(4, 10),
      },
      {
        title: "黃昏咖啡散步",
        creatorId: users.carol.id,
        slotStart: taipeiAt(4, 16),
        slotEnd: taipeiAt(4, 18),
      },
      {
        title: "下班小聚",
        creatorId: users.alice.id,
        slotStart: taipeiAt(6, 19),
        slotEnd: taipeiAt(6, 21),
      },
      {
        title: "日式料理聚餐",
        creatorId: users.bob.id,
        slotStart: taipeiAt(7, 18, 30),
        slotEnd: taipeiAt(7, 20, 30),
      },
      {
        title: "早餐交流會",
        creatorId: users.carol.id,
        slotStart: taipeiAt(8, 7, 30),
        slotEnd: taipeiAt(8, 9),
      },
    ];

    for (const expected of expectedActivities) {
      const createCallIndex = transaction.activity.create.mock.calls.findIndex(
        ([{ data }]) => data.title === expected.title,
      );
      const activity = createdActivityData(transaction, expected.title);

      expect(activity).toMatchObject({
        creator_id: expected.creatorId,
        status: "confirmed",
        participants: {
          create: expect.arrayContaining([{ user_id: users.alice.id }]),
        },
        candidateSlots: {
          create: [
            {
              slot_start: expected.slotStart,
              slot_end: expected.slotEnd,
              all_day: false,
            },
          ],
        },
      });

      const activityNumber = createCallIndex + 1;
      expect(transaction.activitySchedule.update).toHaveBeenCalledWith({
        where: { activity_id: `activity-${activityNumber}` },
        data: { confirmed_slot_id: `activity-${activityNumber}-slot-1` },
      });
    }
  });

  it("Prisma 建立失敗時拋出原始錯誤", async () => {
    const originalError = new Error("activity create failed");
    const transaction = {
      activity: { create: jest.fn().mockRejectedValue(originalError) },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    };

    await expect(seedActivities(prisma, users)).rejects.toBe(originalError);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.activity.create).toHaveBeenCalledTimes(1);
  });
});
