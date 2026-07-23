import { jest } from "@jest/globals";

jest.unstable_mockModule("../lib/prisma.js", () => {
  const prisma = {
    activity: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    activityParticipant: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    activityAvailability: { createMany: jest.fn(), deleteMany: jest.fn() },
    activityAvailabilityRange: { deleteMany: jest.fn() },
    activitySchedule: { update: jest.fn() },
    notification: { create: jest.fn(), createMany: jest.fn() },
    userIdentity: { findFirst: jest.fn() },
    notificationPreference: { findUnique: jest.fn() },
    friendship: { findMany: jest.fn(() => Promise.resolve([])) },
    $queryRaw: jest.fn(() => Promise.resolve([])),
    $transaction: jest.fn((arg) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(prisma),
    ),
  };
  return { default: prisma };
});

jest.unstable_mockModule("../socket/index.js", () => ({
  getIO: jest.fn(),
  joinUserToChat: jest.fn(),
  leaveUserFromChat: jest.fn(),
}));

const mockSyncCreated = jest.fn(() => Promise.resolve());
const mockSyncJoined = jest.fn(() => Promise.resolve());
const mockSyncLeft = jest.fn(() => Promise.resolve());

jest.unstable_mockModule("../services/socketRoomService.js", () => ({
  syncOnActivityCreated: mockSyncCreated,
  syncOnActivityJoined: mockSyncJoined,
  syncOnActivityLeft: mockSyncLeft,
}));

const { createActivity, joinActivity, cancelJoin } =
  await import("../controllers/activityController.js");
const { default: prisma } = await import("../lib/prisma.js");
const { default: i18next } = await import("../lib/i18n.js");

const CREATOR_ID = "user-creator";
const PARTICIPANT_ID = "user-participant";
const ACTIVITY_ID = "activity-1";

function makeReq({
  params = { id: ACTIVITY_ID },
  body = {},
  userId = CREATOR_ID,
} = {}) {
  return { params, body, user: { userId }, t: i18next.getFixedT("zh-TW") };
}

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

describe("Socket.io dynamic room integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createActivity", () => {
    const validBody = {
      title: "打球囉",
      deadline: new Date("2026-08-10T00:00:00Z").toISOString(),
      startDate: "2026/08/15",
      startTime: "上午 9:00",
      endDate: "2026/08/15",
      endTime: "上午 10:00",
    };

    it("建立活動後呼叫 syncOnActivityCreated", async () => {
      prisma.activity.create.mockResolvedValue({ id: ACTIVITY_ID });

      const req = makeReq({ body: validBody });
      const res = makeRes();

      await createActivity(req, res);

      expect(mockSyncCreated).toHaveBeenCalledWith(ACTIVITY_ID);
    });
  });

  describe("joinActivity", () => {
    const baseActivity = {
      id: ACTIVITY_ID,
      creator_id: CREATOR_ID,
      status: "recruiting",
      title: "打球囉",
      participant_target: null,
      schedule: {
        requires_voting: false,
        availability_mode: "slot",
        vote_deadline_at: new Date("2026-08-20T00:00:00Z"),
        time_window_start: null,
        time_window_end: null,
        deadline_at: null,
        fixed_date: null,
      },
      candidateSlots: [
        {
          id: "slot-1",
          slot_start: new Date("2026-08-15T09:00:00Z"),
          slot_end: new Date("2026-08-15T10:00:00Z"),
          all_day: false,
          availabilities: [],
        },
      ],
      participants: [],
    };

    it("報名成功後呼叫 syncOnActivityJoined", async () => {
      prisma.activity.findUnique.mockResolvedValue({ ...baseActivity });
      prisma.activityParticipant.findUnique.mockResolvedValue(null);

      const req = makeReq({
        params: { id: ACTIVITY_ID },
        body: { candidateSlotIds: ["slot-1"] },
        userId: PARTICIPANT_ID,
      });
      const res = makeRes();

      await joinActivity(req, res);

      expect(mockSyncJoined).toHaveBeenCalledWith(ACTIVITY_ID, PARTICIPANT_ID);
    });

    it("報名失敗不呼叫 syncOnActivityJoined", async () => {
      prisma.activity.findUnique.mockResolvedValue(null);

      const req = makeReq({
        params: { id: ACTIVITY_ID },
        body: { candidateSlotIds: ["slot-1"] },
        userId: PARTICIPANT_ID,
      });
      const res = makeRes();

      await joinActivity(req, res);

      expect(mockSyncJoined).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("cancelJoin", () => {
    it("取消報名後呼叫 syncOnActivityLeft", async () => {
      prisma.activity.findUnique.mockResolvedValue({
        id: ACTIVITY_ID,
        status: "recruiting",
        creator_id: CREATOR_ID,
      });
      prisma.activityParticipant.findUnique.mockResolvedValue({
        id: "participant-1",
        status: "joined",
      });

      const req = makeReq({
        params: { id: ACTIVITY_ID },
        userId: PARTICIPANT_ID,
      });
      const res = makeRes();

      await cancelJoin(req, res);

      expect(mockSyncLeft).toHaveBeenCalledWith(ACTIVITY_ID, PARTICIPANT_ID);
    });
  });
});
