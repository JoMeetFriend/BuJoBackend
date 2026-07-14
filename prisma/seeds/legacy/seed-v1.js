/**
 * Legacy demo seed v1.
 *
 * 僅供歷史參考，不是目前 Prisma seed entrypoint。
 * 請勿直接對正式或 Demo 資料庫執行。
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ==================================================================
// Demo 用假資料。設計原則：
// - Alice 是 demo 主帳號，示範者用她走過所有功能。
// - Bob / Carol / Dave 是已經跟 Alice 是好友的「活動參與者」角色，
//   用來墊出投票配對 / 決選平票的情境。
// - Eve / Frank / Grace 只用來示範好友邀請的三種狀態（待接受/已送出/已拒絕）。
// - 通知涵蓋 notificationService.js / activityController.js 實際會用到的
//   8 種 type，依角色回補歷史紀錄，讓每個人切換帳號都看得到通知列表；
//   活動確認成團/取消/決選開始這幾筆刻意留未讀，方便 demo 現場直接展示，
//   其餘標記已讀。Alice 自己動作觸發的通知（如現場投票後的成團通知）
//   則交由 demo 現場實際操作產生，藉此同時驗證通知系統真的有在運作。
// - ActivityInvitation / NotificationJob / activity status 'draft' 目前
//   在 src/ 裡沒有任何 controller 使用（schema 有欄位但功能未實作），
//   不塞這些，避免展示到沒有對應畫面的資料。
// ==================================================================

async function main() {
  console.log("🌱 開始種入 demo 假資料...");

  // ==================
  // Users
  // ==================
  const demoUsers = [
    { name: "alice", bio: null },
    { name: "bob", bio: "資深電影咖，什麼片都看。" },
    {
      name: "carol",
      bio: "喜歡辦活動，熱愛烤肉與桌遊！週末有空隨時揪我，很高興認識大家。",
    },
    { name: "dave", bio: null },
    { name: "eve", bio: "安靜潛水中..." },
    { name: "frank", bio: "我是 Frank" },
    { name: "grace", bio: "我是 Grace" },
  ];

  const [alice, bob, carol, dave, eve, frank, grace] = await Promise.all(
    demoUsers.map((u) =>
      prisma.user.create({
        data: {
          display_name: u.name[0].toUpperCase() + u.name.slice(1),
          avatar_url: `https://i.pravatar.cc/150?u=${u.name}`,
          bio: u.bio,
        },
      }),
    ),
  );

  console.log("✅ Users 建立完成");

  // ==================
  // UserIdentities
  // 全部提供 local 帳密（BujoDemo#2026）方便 demo 現場快速切換帳號登入，
  // 另外保留 Alice/Bob/Dave 的 google/line 身份示範多種登入方式。
  // ==================
  const passwordHash = await bcrypt.hash("BujoDemo#2026", 10);
  const localAccounts = [
    { user: alice, email: "alice@gmail.com" },
    { user: bob, email: "bob@example.com" },
    { user: carol, email: "carol@example.com" },
    { user: dave, email: "dave@example.com" },
    { user: eve, email: "eve@example.com" },
    { user: frank, email: "frank@example.com" },
    { user: grace, email: "grace@example.com" },
  ];

  await prisma.userIdentity.createMany({
    data: [
      ...localAccounts.map(({ user, email }) => ({
        user_id: user.id,
        provider: "local",
        provider_user_id: email,
        email,
        password_hash: passwordHash,
      })),
      {
        user_id: alice.id,
        provider: "google",
        provider_user_id: "google_alice_001",
        email: "alice@gmail.com",
      },
      {
        user_id: bob.id,
        provider: "line",
        provider_user_id: "line_bob_002",
        email: "bob@line.me",
      },
      {
        user_id: dave.id,
        provider: "google",
        provider_user_id: "google_dave_004",
        email: "dave@gmail.com",
      },
    ],
  });

  console.log("✅ UserIdentities 建立完成");
  console.log(
    "   所有帳號皆可用 <name>@example.com（Alice 用 alice@gmail.com）+ BujoDemo#2026 登入",
  );

  // ==================
  // Friendships
  // Alice 與 Bob/Carol/Dave 已是好友（活動參與者需要）
  // Eve -> Alice：pending，Alice 現場可示範「接受好友邀請」
  // Alice -> Frank：pending，示範「已送出邀請，等待對方回覆」畫面
  // Grace -> Alice：rejected，示範歷史拒絕紀錄
  // ==================
  const [aliceBob, aliceCarol, aliceDave, eveToAlice, aliceToFrank] =
    await Promise.all([
      prisma.friendship.create({
        data: {
          requester_id: alice.id,
          receiver_id: bob.id,
          status: "accepted",
        },
      }),
      prisma.friendship.create({
        data: {
          requester_id: alice.id,
          receiver_id: carol.id,
          status: "accepted",
        },
      }),
      prisma.friendship.create({
        data: {
          requester_id: alice.id,
          receiver_id: dave.id,
          status: "accepted",
        },
      }),
      prisma.friendship.create({
        data: {
          requester_id: eve.id,
          receiver_id: alice.id,
          status: "pending",
        },
      }),
      prisma.friendship.create({
        data: {
          requester_id: alice.id,
          receiver_id: frank.id,
          status: "pending",
        },
      }),
    ]);
  await prisma.friendship.create({
    data: { requester_id: grace.id, receiver_id: alice.id, status: "rejected" },
  });

  console.log("✅ Friendships 建立完成");

  // ==================
  // Activities
  // deadline_at 對 recruiting 活動設在未來（維持可加入狀態）；
  // voting/tiebreaking/confirmed/cancelled 直接設定最終狀態與資料，
  // 不依賴 lazy 狀態轉換（該轉換只在 GET 單一活動、且原狀態為 recruiting 時觸發）。
  // ==================
  const now = new Date();
  const at = (days, hour = 14) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  // 1. recruiting：Alice 建立，Bob 已加入，名額未滿 → demo 現場可示範加入流程
  await prisma.activity.create({
    data: {
      creator_id: alice.id,
      title: "Alice 的烤肉趴",
      description: "自備食材，飲料共享！歡迎揪人來。",
      location: "大安森林公園",
      participant_target: 6,
      status: "recruiting",
      schedule: { create: { requires_voting: false, deadline_at: at(3, 17) } },
      candidateSlots: {
        create: { slot_start: at(4, 17), slot_end: at(4, 21) },
      },
      participants: { create: [{ user_id: alice.id }, { user_id: bob.id }] },
      chat: { create: { name: "Alice 的烤肉趴" } },
    },
  });

  // 2. voting：Alice 建立，3 個候選時段，Bob/Carol 投第一個、Dave 投第二個
  //    → slot1 領先但非全數一致，demo 現場可示範 Alice 投票、創建者確認成團
  const votingActivity = await prisma.activity.create({
    data: {
      creator_id: alice.id,
      title: "Alice 的爬山",
      description: "輕鬆路線，新手也可以！候選時段投票中。",
      location: "象山步道",
      participant_target: 10,
      status: "voting",
      schedule: { create: { requires_voting: true, deadline_at: at(-1, 8) } },
      candidateSlots: {
        create: [
          { slot_start: at(7, 8), slot_end: at(7, 12) },
          { slot_start: at(8, 8), slot_end: at(8, 12) },
          { slot_start: at(9, 8), slot_end: at(9, 12) },
        ],
      },
      participants: {
        create: [
          { user_id: alice.id },
          { user_id: bob.id },
          { user_id: carol.id },
          { user_id: dave.id },
        ],
      },
      chat: { create: { name: "Alice 的爬山" } },
    },
    include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
  });
  const [votingSlot1, votingSlot2] = votingActivity.candidateSlots;
  await prisma.activityAvailability.createMany({
    data: [
      { candidate_slot_id: votingSlot1.id, user_id: bob.id },
      { candidate_slot_id: votingSlot1.id, user_id: carol.id },
      { candidate_slot_id: votingSlot2.id, user_id: dave.id },
    ],
  });

  // 3. tiebreaking：Alice 建立，2 個候選時段打平（Bob / Carol 各投一邊），
  //    已進入決選投票階段，Bob 已投決選票 → demo 現場可示範 Alice 投決選票、確認成團
  const tiebreakActivity = await prisma.activity.create({
    data: {
      creator_id: alice.id,
      title: "Alice 的桌遊之夜",
      description:
        "卡坦島、密室逃脫等，歡迎帶自己喜歡的遊戲！時段打平，進入決選。",
      location: "信義區桌遊店",
      participant_target: 6,
      status: "tiebreaking",
      schedule: { create: { requires_voting: true, deadline_at: at(-1, 19) } },
      candidateSlots: {
        create: [
          { slot_start: at(5, 19), slot_end: at(5, 22) },
          { slot_start: at(6, 19), slot_end: at(6, 22) },
        ],
      },
      participants: {
        create: [
          { user_id: alice.id },
          { user_id: bob.id },
          { user_id: carol.id },
        ],
      },
      chat: { create: { name: "Alice 的桌遊之夜" } },
    },
    include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
  });
  const [tiebreakSlotA, tiebreakSlotB] = tiebreakActivity.candidateSlots;
  await prisma.activityAvailability.createMany({
    data: [
      { candidate_slot_id: tiebreakSlotA.id, user_id: bob.id },
      { candidate_slot_id: tiebreakSlotB.id, user_id: carol.id },
    ],
  });
  await prisma.activityTiebreakVote.create({
    data: {
      activity_id: tiebreakActivity.id,
      candidate_slot_id: tiebreakSlotA.id,
      user_id: bob.id,
    },
  });

  // 4. confirmed：Bob 建立，Alice 已加入且已成團 → 示範已成團畫面
  const confirmedActivity = await prisma.activity.create({
    data: {
      creator_id: bob.id,
      title: "Bob 的看電影",
      description: "約好要去看的那部！",
      location: "西門町某電影院",
      participant_target: 4,
      status: "confirmed",
      schedule: { create: { requires_voting: false, deadline_at: at(9, 20) } },
      candidateSlots: {
        create: { slot_start: at(10, 20), slot_end: at(10, 22) },
      },
      participants: { create: [{ user_id: bob.id }, { user_id: alice.id }] },
      chat: { create: { name: "Bob 的看電影" } },
    },
    include: { candidateSlots: true },
  });
  await prisma.activitySchedule.update({
    where: { activity_id: confirmedActivity.id },
    data: { confirmed_slot_id: confirmedActivity.candidateSlots[0].id },
  });

  // 5. cancelled：Carol 建立，Alice 曾加入，最後流團 → 示範取消畫面
  const cancelledActivity = await prisma.activity.create({
    data: {
      creator_id: carol.id,
      title: "Carol 的下午茶",
      description: "來聊聊最近在幹嘛，輕鬆聚聚。",
      location: "大安區某咖啡廳",
      participant_target: 5,
      status: "cancelled",
      schedule: { create: { requires_voting: false, deadline_at: at(-2, 15) } },
      candidateSlots: {
        create: { slot_start: at(-1, 15), slot_end: at(-1, 17) },
      },
      participants: { create: [{ user_id: carol.id }, { user_id: alice.id }] },
      chat: { create: { name: "Carol 的下午茶" } },
    },
  });

  console.log(
    "✅ Activities 建立完成（recruiting / voting / tiebreaking / confirmed / cancelled 皆已涵蓋）",
  );

  // ==================
  // 行事曆歷史示範活動
  // 對應舊版前端 CalendarMain.vue 寫死的 6 筆假資料（KTV / 小酌 / 晚餐 / 爬山 / 桌遊 / 歌唱），
  // 現在改成種進資料庫，讓行事曆改抓真實 API 後這幾筆歷史行程依然能在 demo 上看到。
  // 全部設在過去，示範「本月已發生的行程」：
  // - KTV / 爬山：Alice 以參與者身分加入他人發起、尚未成團的活動 → 前端行事曆歸類 JOINING
  // - 小酌：Alice 自己發起、尚未成團 → 前端行事曆歸類 PERSONAL
  // - 晚餐 / 歌唱：已成團 → 前端行事曆歸類 FORMED
  // - 桌遊：Carol 發起、Alice 未加入 → 招募中，行事曆本來就會濾掉，純墊資料用
  // ==================

  await prisma.activity.create({
    data: {
      creator_id: carol.id,
      title: "KTV",
      location: "西門町錢櫃",
      participant_target: 6,
      status: "recruiting",
      schedule: {
        create: { requires_voting: false, deadline_at: at(-39, 18) },
      },
      candidateSlots: {
        create: { slot_start: at(-38, 19), slot_end: at(-38, 23) },
      },
      participants: {
        create: [
          { user_id: carol.id },
          { user_id: alice.id },
          { user_id: bob.id },
        ],
      },
      chat: { create: { name: "KTV" } },
    },
  });

  await prisma.activity.create({
    data: {
      creator_id: alice.id,
      title: "小酌",
      location: "公館某居酒屋",
      participant_target: 4,
      status: "recruiting",
      schedule: {
        create: { requires_voting: false, deadline_at: at(-37, 20) },
      },
      candidateSlots: {
        create: { slot_start: at(-36, 21), slot_end: at(-36, 23) },
      },
      participants: { create: [{ user_id: alice.id }] },
      chat: { create: { name: "小酌" } },
    },
  });

  const dinnerActivity = await prisma.activity.create({
    data: {
      creator_id: dave.id,
      title: "晚餐",
      location: "公館某餐酒館",
      participant_target: 4,
      status: "confirmed",
      schedule: {
        create: { requires_voting: false, deadline_at: at(-36, 18) },
      },
      candidateSlots: {
        create: { slot_start: at(-35, 18), slot_end: at(-35, 20) },
      },
      participants: { create: [{ user_id: dave.id }, { user_id: alice.id }] },
      chat: { create: { name: "晚餐" } },
    },
    include: { candidateSlots: true },
  });
  await prisma.activitySchedule.update({
    where: { activity_id: dinnerActivity.id },
    data: { confirmed_slot_id: dinnerActivity.candidateSlots[0].id },
  });

  await prisma.activity.create({
    data: {
      creator_id: bob.id,
      title: "爬山",
      location: "象山步道",
      participant_target: 8,
      status: "recruiting",
      schedule: {
        create: { requires_voting: false, deadline_at: at(-31, 20) },
      },
      candidateSlots: {
        create: { slot_start: at(-30, 6), slot_end: at(-30, 14) },
      },
      participants: { create: [{ user_id: bob.id }, { user_id: alice.id }] },
      chat: { create: { name: "爬山" } },
    },
  });

  await prisma.activity.create({
    data: {
      creator_id: carol.id,
      title: "桌遊",
      location: "信義區桌遊店",
      participant_target: 6,
      status: "recruiting",
      schedule: {
        create: { requires_voting: false, deadline_at: at(-29, 19) },
      },
      candidateSlots: {
        create: { slot_start: at(-28, 19), slot_end: at(-28, 22) },
      },
      participants: { create: [{ user_id: carol.id }] },
      chat: { create: { name: "桌遊" } },
    },
  });

  const singingActivity = await prisma.activity.create({
    data: {
      creator_id: alice.id,
      title: "歌唱",
      location: "K award 練歌房",
      participant_target: 6,
      status: "confirmed",
      schedule: {
        create: { requires_voting: false, deadline_at: at(-23, 18) },
      },
      candidateSlots: {
        create: { slot_start: at(-22, 19), slot_end: at(-22, 22) },
      },
      participants: {
        create: [
          { user_id: alice.id },
          { user_id: bob.id },
          { user_id: carol.id },
        ],
      },
      chat: { create: { name: "歌唱" } },
    },
    include: { candidateSlots: true },
  });
  await prisma.activitySchedule.update({
    where: { activity_id: singingActivity.id },
    data: { confirmed_slot_id: singingActivity.candidateSlots[0].id },
  });

  console.log(
    "✅ 行事曆歷史示範活動建立完成（KTV / 小酌 / 晚餐 / 爬山 / 桌遊 / 歌唱）",
  );

  // ==================
  // Notifications
  // 依照 notificationService.js / activityController.js 實際會產生通知的
  // 事件回補歷史紀錄，讓每個角色的通知列表都有內容可看：
  // - 好友邀請「建立」通知只會發給接收方（真實邏輯如此），所以 Eve（送出
  //   邀請、尚未被回覆）跟 Grace（送出邀請的一方）本來就不會有通知，這是
  //   正確行為，不是遺漏。
  // - 活動確認成團/取消/決選開始這幾筆刻意留「未讀」，讓 demo 現場一登入
  //   就能直接展示通知列表，其餘標記已讀作為歷史紀錄。
  // - Alice 自己活動（recruiting/voting/tiebreaking）被實際操作後產生的
  //   通知（如 activity_confirmed 發給參與者）交給 demo 現場即時觸發，
  //   藉此同時驗證通知系統真的有在運作。
  // ==================
  await prisma.notification.createMany({
    data: [
      // --- 好友邀請歷史（friend_request_created 只發給接收方）---
      {
        user_id: bob.id,
        type: "friend_request_created",
        reference_id: aliceBob.id,
        reference_type: "friendship",
        is_read: true,
      },
      {
        user_id: carol.id,
        type: "friend_request_created",
        reference_id: aliceCarol.id,
        reference_type: "friendship",
        is_read: true,
      },
      {
        user_id: dave.id,
        type: "friend_request_created",
        reference_id: aliceDave.id,
        reference_type: "friendship",
        is_read: true,
      },
      {
        user_id: frank.id,
        type: "friend_request_created",
        reference_id: aliceToFrank.id,
        reference_type: "friendship",
        is_read: false,
      },
      {
        user_id: alice.id,
        type: "friend_request_created",
        reference_id: eveToAlice.id,
        reference_type: "friendship",
        is_read: false,
      },

      // --- 好友邀請被接受（friend_request_accepted 發給原邀請方 Alice）---
      {
        user_id: alice.id,
        type: "friend_request_accepted",
        reference_id: aliceBob.id,
        reference_type: "friendship",
        is_read: true,
      },
      {
        user_id: alice.id,
        type: "friend_request_accepted",
        reference_id: aliceDave.id,
        reference_type: "friendship",
        is_read: true,
      },

      // --- 活動建立通知（activity_created 發給建立者的好友）---
      {
        user_id: bob.id,
        type: "activity_created",
        reference_id: votingActivity.id,
        reference_type: "activity",
        is_read: true,
      },
      {
        user_id: carol.id,
        type: "activity_created",
        reference_id: votingActivity.id,
        reference_type: "activity",
        is_read: true,
      },
      {
        user_id: dave.id,
        type: "activity_created",
        reference_id: votingActivity.id,
        reference_type: "activity",
        is_read: true,
      },
      {
        user_id: bob.id,
        type: "activity_created",
        reference_id: tiebreakActivity.id,
        reference_type: "activity",
        is_read: false,
      },
      {
        user_id: carol.id,
        type: "activity_created",
        reference_id: tiebreakActivity.id,
        reference_type: "activity",
        is_read: false,
      },
      {
        user_id: alice.id,
        type: "activity_created",
        reference_id: confirmedActivity.id,
        reference_type: "activity",
        is_read: true,
      },
      {
        user_id: alice.id,
        type: "activity_created",
        reference_id: cancelledActivity.id,
        reference_type: "activity",
        is_read: true,
      },

      // --- 活動狀態變化通知（demo 示範用，未讀）---
      {
        user_id: alice.id,
        type: "time_to_pick",
        reference_id: votingActivity.id,
        reference_type: "activity",
        is_read: false,
      },
      {
        user_id: bob.id,
        type: "tiebreak_started",
        reference_id: tiebreakActivity.id,
        reference_type: "activity",
        is_read: false,
      },
      {
        user_id: carol.id,
        type: "tiebreak_started",
        reference_id: tiebreakActivity.id,
        reference_type: "activity",
        is_read: false,
      },
      {
        user_id: alice.id,
        type: "activity_confirmed",
        reference_id: confirmedActivity.id,
        reference_type: "activity",
        is_read: false,
      },
      {
        user_id: bob.id,
        type: "activity_confirmed",
        reference_id: confirmedActivity.id,
        reference_type: "activity",
        is_read: true,
      },
      {
        user_id: alice.id,
        type: "activity_cancelled",
        reference_id: cancelledActivity.id,
        reference_type: "activity",
        is_read: false,
      },
    ],
  });

  console.log("✅ Notifications 建立完成");
  console.log("");
  console.log("🎉 Demo 假資料種入完成！");
  console.log("");
  console.log("登入帳號（密碼統一：BujoDemo#2026）：");
  console.log("  alice@gmail.com   → demo 主帳號，可示範所有功能");
  console.log(
    "  bob/carol/dave/eve/frank/grace@example.com → 配角帳號，可切換視角查看",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
