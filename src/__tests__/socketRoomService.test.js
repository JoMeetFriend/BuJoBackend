import { jest } from "@jest/globals";

jest.unstable_mockModule("../lib/prisma.js", () => ({
  default: {
    activity: { findUnique: jest.fn() },
  },
}));

jest.unstable_mockModule("../socket/index.js", () => ({
  getIO: jest.fn(),
  joinUserToChat: jest.fn(),
  leaveUserFromChat: jest.fn(),
}));

const { syncOnActivityCreated, syncOnActivityJoined, syncOnActivityLeft } =
  await import("../services/socketRoomService.js");
const { default: prisma } = await import("../lib/prisma.js");
const { getIO, joinUserToChat, leaveUserFromChat } =
  await import("../socket/index.js");

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
getIO.mockReturnValue({ to: mockTo });

function mockChat(overrides = {}) {
  return {
    creator_id: "user-creator",
    title: "打球囉",
    chat: { id: "chat-1" },
    ...overrides,
  };
}

describe("socketRoomService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("syncOnActivityCreated", () => {
    it("查詢活動、加入建立者到房間、emit chat:room_added", async () => {
      prisma.activity.findUnique.mockResolvedValue(mockChat());

      await syncOnActivityCreated("activity-1");

      expect(prisma.activity.findUnique).toHaveBeenCalledWith({
        where: { id: "activity-1" },
        select: {
          creator_id: true,
          title: true,
          chat: { select: { id: true } },
        },
      });
      expect(joinUserToChat).toHaveBeenCalledWith("user-creator", "chat-1");
      expect(mockTo).toHaveBeenCalledWith("chat-1");
      expect(mockEmit).toHaveBeenCalledWith("chat:room_added", {
        chat_id: "chat-1",
        activity_id: "activity-1",
        activity_title: "打球囉",
      });
    });

    it("活動無聊天室時靜默跳過", async () => {
      prisma.activity.findUnique.mockResolvedValue(mockChat({ chat: null }));

      await syncOnActivityCreated("activity-1");

      expect(joinUserToChat).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  describe("syncOnActivityJoined", () => {
    it("加入使用者到房間並 emit chat:room_added", async () => {
      prisma.activity.findUnique.mockResolvedValue(mockChat());

      await syncOnActivityJoined("activity-1", "user-participant");

      expect(joinUserToChat).toHaveBeenCalledWith("user-participant", "chat-1");
      expect(mockEmit).toHaveBeenCalledWith("chat:room_added", {
        chat_id: "chat-1",
        activity_id: "activity-1",
        activity_title: "打球囉",
      });
    });
  });

  describe("syncOnActivityLeft", () => {
    it("移除使用者從房間並 emit chat:room_removed", async () => {
      prisma.activity.findUnique.mockResolvedValue(mockChat());

      await syncOnActivityLeft("activity-1", "user-participant");

      expect(leaveUserFromChat).toHaveBeenCalledWith(
        "user-participant",
        "chat-1",
      );
      expect(mockEmit).toHaveBeenCalledWith("chat:room_removed", {
        chat_id: "chat-1",
        activity_id: "activity-1",
      });
    });
  });
});
