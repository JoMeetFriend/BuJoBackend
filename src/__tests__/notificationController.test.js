import { jest } from "@jest/globals";

jest.unstable_mockModule("../lib/prisma.js", () => ({
  default: {
    notification: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    friendship: {
      findUnique: jest.fn(),
    },
    activity: {
      findUnique: jest.fn(),
    },
  },
}));

const {
  listNotifications,
  markAllRead,
  markRead,
} = await import("../controllers/notificationController.js");
const { default: notificationRoutes } = await import("../routes/notifications.js");
const { default: prisma } = await import("../lib/prisma.js");

function makeReq({ userId = "user-b", params = {} } = {}) {
  return {
    user: { userId },
    params,
  };
}

function makeRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

describe("/api/notifications routes", () => {
  it("使用 authenticate middleware 保護通知列表 API", () => {
    const listRoute = notificationRoutes.stack.find((layer) => layer.route?.path === "/");

    expect(listRoute).toBeDefined();
    expect(listRoute.route.methods.get).toBe(true);
    expect(listRoute.route.stack[0].handle.name).toBe("authenticate");
  });

  it("使用 authenticate middleware 保護單筆已讀 API", () => {
    const readRoute = notificationRoutes.stack.find((layer) => layer.route?.path === "/:id/read");

    expect(readRoute).toBeDefined();
    expect(readRoute.route.methods.patch).toBe(true);
    expect(readRoute.route.stack[0].handle.name).toBe("authenticate");
  });

  it("使用 authenticate middleware 保護全部已讀 API", () => {
    const readAllRoute = notificationRoutes.stack.find((layer) => layer.route?.path === "/read-all");

    expect(readAllRoute).toBeDefined();
    expect(readAllRoute.route.methods.patch).toBe(true);
    expect(readAllRoute.route.stack[0].handle.name).toBe("authenticate");
  });
});

describe("listNotifications", () => {
  it("B 查通知時可看到 A 的好友邀請通知與 accept/reject actions", async () => {
    const createdAt = new Date(Date.now() - 10 * 60 * 1000);
    prisma.notification.findMany.mockResolvedValue([
      {
        id: "notification-1",
        user_id: "user-b",
        type: "friend_request_created",
        reference_id: "friendship-1",
        reference_type: "friendship",
        is_read: false,
        created_at: createdAt,
      },
    ]);
    prisma.friendship.findUnique.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "pending",
      requester: { id: "user-a", display_name: "A", avatar_url: null },
      receiver: { id: "user-b", display_name: "B", avatar_url: null },
    });
    const res = makeRes();

    await listNotifications(makeReq({ userId: "user-b" }), res);

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { user_id: "user-b" },
      orderBy: { created_at: "desc" },
    });
    expect(res.json).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          id: "notification-1",
          type: "friend_request_created",
          category: "friend",
          message: "A 向你發送好友邀請",
          timeText: "10 分鐘前",
          isRead: false,
          createdAt: createdAt.toISOString(),
          reference: {
            type: "friendship",
            id: "friendship-1",
            status: "pending",
          },
          actions: ["accept", "reject"],
        }),
      ],
    });
  });

  it("A 查通知時可看到 B 接受好友邀請通知", async () => {
    prisma.notification.findMany.mockResolvedValue([
      {
        id: "notification-2",
        user_id: "user-a",
        type: "friend_request_accepted",
        reference_id: "friendship-1",
        reference_type: "friendship",
        is_read: false,
        created_at: new Date(),
      },
    ]);
    prisma.friendship.findUnique.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "accepted",
      requester: { id: "user-a", display_name: "A", avatar_url: null },
      receiver: { id: "user-b", display_name: "B", avatar_url: null },
    });
    const res = makeRes();

    await listNotifications(makeReq({ userId: "user-a" }), res);

    expect(res.json).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          category: "friend",
          message: "B 接受了你的好友邀請",
          reference: {
            type: "friendship",
            id: "friendship-1",
            status: "accepted",
          },
          actions: [],
        }),
      ],
    });
  });

  it("friendship 非 pending 時，好友邀請通知不回 action buttons", async () => {
    prisma.notification.findMany.mockResolvedValue([
      {
        id: "notification-3",
        user_id: "user-b",
        type: "friend_request_created",
        reference_id: "friendship-1",
        reference_type: "friendship",
        is_read: false,
        created_at: new Date(),
      },
    ]);
    prisma.friendship.findUnique.mockResolvedValue({
      id: "friendship-1",
      status: "rejected",
      requester: { id: "user-a", display_name: "A", avatar_url: null },
      receiver: { id: "user-b", display_name: "B", avatar_url: null },
    });
    const res = makeRes();

    await listNotifications(makeReq({ userId: "user-b" }), res);

    expect(res.json).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          actions: [],
          reference: {
            type: "friendship",
            id: "friendship-1",
            status: "rejected",
          },
        }),
      ],
    });
  });

  it("B 查通知時可看到 A 建立活動通知", async () => {
    prisma.notification.findMany.mockResolvedValue([
      {
        id: "notification-4",
        user_id: "user-b",
        type: "activity_created",
        reference_id: "activity-1",
        reference_type: "activity",
        is_read: true,
        created_at: new Date(),
      },
    ]);
    prisma.activity.findUnique.mockResolvedValue({
      id: "activity-1",
      title: "週末野餐",
      status: "recruiting",
      creator: { id: "user-a", display_name: "A", avatar_url: null },
    });
    const res = makeRes();

    await listNotifications(makeReq({ userId: "user-b" }), res);

    expect(res.json).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          type: "activity_created",
          category: "activity",
          message: "A 建立了新活動：週末野餐",
          isRead: true,
          reference: {
            type: "activity",
            id: "activity-1",
            status: "recruiting",
          },
          actions: [],
        }),
      ],
    });
  });
});

describe("markRead", () => {
  it("單筆已讀只允許 notification owner 修改", async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    const res = makeRes();

    await markRead(makeReq({ userId: "user-b", params: { id: "notification-1" } }), res);

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: "notification-1",
        user_id: "user-b",
      },
      data: { is_read: true },
    });
    expect(res.json).toHaveBeenCalledWith({ message: "已標記為已讀" });
  });

  it("找不到自己的 notification 時回傳 404", async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    const res = makeRes();

    await markRead(makeReq({ userId: "user-b", params: { id: "notification-1" } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "找不到通知" });
  });
});

describe("markAllRead", () => {
  it("全部已讀只更新目前登入者的通知", async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });
    const res = makeRes();

    await markAllRead(makeReq({ userId: "user-b" }), res);

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        user_id: "user-b",
        is_read: false,
      },
      data: { is_read: true },
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "已全部標記為已讀",
      count: 2,
    });
  });
});

describe("錯誤處理：資料庫拋出例外時不能讓 request 直接 crash", () => {
  it("listNotifications 遇到例外回傳 500", async () => {
    prisma.notification.findMany.mockRejectedValue(new Error("db down"));
    const res = makeRes();

    await listNotifications(makeReq({ userId: "user-b" }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "伺服器錯誤" });
  });

  it("markRead 遇到例外回傳 500", async () => {
    prisma.notification.updateMany.mockRejectedValue(new Error("db down"));
    const res = makeRes();

    await markRead(makeReq({ userId: "user-b", params: { id: "notification-1" } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "伺服器錯誤" });
  });

  it("markAllRead 遇到例外回傳 500", async () => {
    prisma.notification.updateMany.mockRejectedValue(new Error("db down"));
    const res = makeRes();

    await markAllRead(makeReq({ userId: "user-b" }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "伺服器錯誤" });
  });
});
