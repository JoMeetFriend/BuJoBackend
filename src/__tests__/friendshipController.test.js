import { jest } from "@jest/globals";

jest.unstable_mockModule("../lib/prisma.js", () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    friendship: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    notification: { create: jest.fn() },
    $transaction: jest.fn(async (callback) => callback(prisma)),
  };

  return { default: prisma };
});

const {
  acceptFriendship,
  rejectFriendship,
  requestFriendship,
  removeFriendship,
} = await import("../controllers/friendshipController.js");
const { default: friendshipRoutes } = await import("../routes/friendships.js");
const { default: prisma } = await import("../lib/prisma.js");
const { default: i18next } = await import("../lib/i18n.js");

function makeReq(body = {}, userId = "user-a") {
  return {
    user: { userId },
    body,
    t: i18next.getFixedT("zh-TW"),
  };
}

function makeRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

describe("POST /api/friendships/request route", () => {
  it("使用 authenticate middleware 保護好友邀請 API", () => {
    const requestRoute = friendshipRoutes.stack.find(
      (layer) => layer.route?.path === "/request",
    );

    expect(requestRoute).toBeDefined();
    expect(requestRoute.route.methods.post).toBe(true);
    expect(requestRoute.route.stack[0].handle.name).toBe("authenticate");
  });

  it("使用 authenticate middleware 保護接受好友邀請 API", () => {
    const acceptRoute = friendshipRoutes.stack.find(
      (layer) => layer.route?.path === "/:id/accept",
    );

    expect(acceptRoute).toBeDefined();
    expect(acceptRoute.route.methods.post).toBe(true);
    expect(acceptRoute.route.stack[0].handle.name).toBe("authenticate");
  });

  it("使用 authenticate middleware 保護拒絕好友邀請 API", () => {
    const rejectRoute = friendshipRoutes.stack.find(
      (layer) => layer.route?.path === "/:id/reject",
    );

    expect(rejectRoute).toBeDefined();
    expect(rejectRoute.route.methods.post).toBe(true);
    expect(rejectRoute.route.stack[0].handle.name).toBe("authenticate");
  });

  it("使用 authenticate middleware 保護刪除好友 API", () => {
    const deleteRoute = friendshipRoutes.stack.find(
      (layer) => layer.route?.path === "/:id" && layer.route?.methods.delete,
    );

    expect(deleteRoute).toBeDefined();
    expect(deleteRoute.route.methods.delete).toBe(true);
    expect(deleteRoute.route.stack[0].handle.name).toBe("authenticate");
  });
});

describe("requestFriendship", () => {
  it("缺 receiver_id 回傳 400", async () => {
    const res = makeRes();

    await requestFriendship(makeReq({}), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "缺少 receiver_id" });
  });

  it("不能加自己為好友", async () => {
    const res = makeRes();

    await requestFriendship(makeReq({ receiver_id: "user-a" }, "user-a"), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "不能加自己為好友" });
  });

  it("receiver 不存在回傳 404", async () => {
    const res = makeRes();
    prisma.user.findUnique.mockResolvedValue(null);

    await requestFriendship(makeReq({ receiver_id: "user-b" }, "user-a"), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "找不到使用者" });
  });

  it("第一次送邀請會建立 pending friendship 和通知", async () => {
    const res = makeRes();
    const friendship = {
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "pending",
    };

    prisma.user.findUnique.mockResolvedValue({ id: "user-b" });
    prisma.friendship.findFirst.mockResolvedValue(null);
    prisma.friendship.create.mockResolvedValue(friendship);

    await requestFriendship(makeReq({ receiver_id: "user-b" }, "user-a"), res);

    expect(prisma.friendship.create).toHaveBeenCalledWith({
      data: {
        requester_id: "user-a",
        receiver_id: "user-b",
        status: "pending",
      },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        user_id: "user-b",
        type: "friend_request_created",
        reference_id: "friendship-1",
        reference_type: "friendship",
        is_read: false,
      },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "好友邀請已送出",
      friendship,
    });
  });

  it("已經是好友時不能送邀請", async () => {
    const res = makeRes();
    prisma.user.findUnique.mockResolvedValue({ id: "user-b" });
    prisma.friendship.findFirst.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "accepted",
    });

    await requestFriendship(makeReq({ receiver_id: "user-b" }, "user-a"), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: "已經是好友" });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("已送出 pending 時不能重複送邀請", async () => {
    const res = makeRes();
    prisma.user.findUnique.mockResolvedValue({ id: "user-b" });
    prisma.friendship.findFirst.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "pending",
    });

    await requestFriendship(makeReq({ receiver_id: "user-b" }, "user-a"), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: "已送出好友邀請" });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("對方已送出 pending 時不建立反方向邀請", async () => {
    const res = makeRes();
    prisma.user.findUnique.mockResolvedValue({ id: "user-b" });
    prisma.friendship.findFirst.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-b",
      receiver_id: "user-a",
      status: "pending",
    });

    await requestFriendship(makeReq({ receiver_id: "user-b" }, "user-a"), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: "對方已邀請你" });
    expect(prisma.friendship.create).not.toHaveBeenCalled();
  });

  it("rejected 後再次送邀請會更新回 pending 並建立通知", async () => {
    const res = makeRes();
    const friendship = {
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "pending",
    };

    prisma.user.findUnique.mockResolvedValue({ id: "user-b" });
    prisma.friendship.findFirst.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "rejected",
    });
    prisma.friendship.update.mockResolvedValue(friendship);

    await requestFriendship(makeReq({ receiver_id: "user-b" }, "user-a"), res);

    expect(prisma.friendship.update).toHaveBeenCalledWith({
      where: { id: "friendship-1" },
      data: {
        requester_id: "user-a",
        receiver_id: "user-b",
        status: "pending",
      },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        user_id: "user-b",
        type: "friend_request_created",
        reference_id: "friendship-1",
        reference_type: "friendship",
        is_read: false,
      },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("deleted 後再次送邀請會更新回 pending 並建立通知", async () => {
    const res = makeRes();
    const friendship = {
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "pending",
    };

    prisma.user.findUnique.mockResolvedValue({ id: "user-b" });
    prisma.friendship.findFirst.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-b",
      receiver_id: "user-a",
      status: "deleted",
    });
    prisma.friendship.update.mockResolvedValue(friendship);

    await requestFriendship(makeReq({ receiver_id: "user-b" }, "user-a"), res);

    expect(prisma.friendship.update).toHaveBeenCalledWith({
      where: { id: "friendship-1" },
      data: {
        requester_id: "user-a",
        receiver_id: "user-b",
        status: "pending",
      },
    });
    expect(prisma.notification.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("acceptFriendship", () => {
  it("找不到好友邀請回傳 404", async () => {
    const res = makeRes();
    prisma.friendship.findUnique.mockResolvedValue(null);

    await acceptFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-b" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "找不到好友邀請" });
  });

  it("只有被邀請者可以接受好友邀請", async () => {
    const res = makeRes();
    prisma.friendship.findUnique.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "pending",
    });

    await acceptFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-c" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "只有被邀請者可以接受好友邀請",
    });
  });

  it("非 pending 好友邀請不能接受", async () => {
    const res = makeRes();
    prisma.friendship.findUnique.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "accepted",
    });

    await acceptFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-b" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "此好友邀請無法接受" });
  });

  it("B 接受 A 的邀請會更新狀態並通知 A", async () => {
    const res = makeRes();
    const updatedFriendship = {
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "accepted",
    };

    prisma.friendship.findUnique.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "pending",
    });
    prisma.friendship.update.mockResolvedValue(updatedFriendship);

    await acceptFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-b" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(prisma.friendship.update).toHaveBeenCalledWith({
      where: { id: "friendship-1" },
      data: { status: "accepted" },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        user_id: "user-a",
        type: "friend_request_accepted",
        reference_id: "friendship-1",
        reference_type: "friendship",
        is_read: false,
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "已接受好友邀請",
      friendship: updatedFriendship,
    });
  });
});

describe("錯誤處理：資料庫拋出例外時不能讓 request 直接 crash", () => {
  it("requestFriendship 遇到例外回傳 500，而不是讓 unhandled rejection 拖垮伺服器", async () => {
    const res = makeRes();
    prisma.user.findUnique.mockRejectedValue(new Error("db down"));

    await requestFriendship(makeReq({ receiver_id: "user-b" }, "user-a"), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "伺服器錯誤" });
  });

  it("acceptFriendship 遇到例外回傳 500", async () => {
    const res = makeRes();
    prisma.friendship.findUnique.mockRejectedValue(new Error("db down"));

    await acceptFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-b" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "伺服器錯誤" });
  });

  it("rejectFriendship 遇到例外回傳 500", async () => {
    const res = makeRes();
    prisma.friendship.findUnique.mockRejectedValue(new Error("db down"));

    await rejectFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-b" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "伺服器錯誤" });
  });
});

describe("rejectFriendship", () => {
  it("找不到好友邀請回傳 404", async () => {
    const res = makeRes();
    prisma.friendship.findUnique.mockResolvedValue(null);

    await rejectFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-b" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "找不到好友邀請" });
  });

  it("只有被邀請者可以拒絕好友邀請", async () => {
    const res = makeRes();
    prisma.friendship.findUnique.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "pending",
    });

    await rejectFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-c" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "只有被邀請者可以拒絕好友邀請",
    });
  });

  it("非 pending 好友邀請不能拒絕", async () => {
    const res = makeRes();
    prisma.friendship.findUnique.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "accepted",
    });

    await rejectFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-b" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "此好友邀請無法拒絕" });
  });

  it("B 拒絕 A 的邀請只更新狀態，不建立通知", async () => {
    const res = makeRes();
    const updatedFriendship = {
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "rejected",
    };

    prisma.friendship.findUnique.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "pending",
    });
    prisma.friendship.update.mockResolvedValue(updatedFriendship);

    await rejectFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-b" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(prisma.friendship.update).toHaveBeenCalledWith({
      where: { id: "friendship-1" },
      data: { status: "rejected" },
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "已拒絕好友邀請",
      friendship: updatedFriendship,
    });
  });
});

describe("removeFriendship", () => {
  it("找不到好友關係回傳 404", async () => {
    const res = makeRes();
    prisma.friendship.findUnique.mockResolvedValue(null);

    await removeFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-a" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "找不到該好友關係" });
  });

  it("無權操作（非雙方當事人）嘗試刪除時回傳 403 (防 IDOR)", async () => {
    const res = makeRes();
    prisma.friendship.findUnique.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "accepted",
    });

    await removeFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-c" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "無權操作此好友關係" });
  });

  it("非 accepted 狀態無法刪除回傳 400", async () => {
    const res = makeRes();
    prisma.friendship.findUnique.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "pending",
    });

    await removeFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-a" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "此狀態無法刪除好友" });
  });

  it("成功軟刪除好友，將狀態改為 deleted 回傳 200", async () => {
    const res = makeRes();
    const updatedFriendship = {
      id: "friendship-1",
      status: "deleted",
    };

    prisma.friendship.findUnique.mockResolvedValue({
      id: "friendship-1",
      requester_id: "user-a",
      receiver_id: "user-b",
      status: "accepted",
    });
    prisma.friendship.update.mockResolvedValue(updatedFriendship);

    await removeFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-a" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(prisma.friendship.update).toHaveBeenCalledWith({
      where: { id: "friendship-1" },
      data: { status: "deleted" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "已刪除好友",
      friendship: updatedFriendship,
    });
  });

  it("遇到資料庫例外時回傳 500", async () => {
    const res = makeRes();
    prisma.friendship.findUnique.mockRejectedValue(new Error("db error"));

    await removeFriendship(
      { params: { id: "friendship-1" }, user: { userId: "user-a" }, t: i18next.getFixedT("zh-TW") },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
