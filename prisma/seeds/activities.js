const TAIPEI_UTC_OFFSET_HOURS = 8;

function getTaipeiDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function createTaipeiDateFactory(now) {
  const { year, month, day } = getTaipeiDateParts(now);

  return (daysFromToday, hour, minute = 0) =>
    new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day) + daysFromToday,
        hour - TAIPEI_UTC_OFFSET_HOURS,
        minute,
      ),
    );
}

function activityData({
  creator,
  title,
  description,
  location,
  category,
  participantTarget,
  status,
  schedule,
  candidateSlots,
  participants,
}) {
  return {
    creator_id: creator.id,
    title,
    description,
    location,
    category,
    participant_target: participantTarget,
    status,
    schedule: { create: schedule },
    candidateSlots: { create: candidateSlots },
    participants: {
      create: participants.map((user) => ({ user_id: user.id })),
    },
    chat: { create: { name: title } },
  };
}

/**
 * 建立四種排程模式、三筆成團行事曆活動與一筆取消活動。
 * 所有日期皆以 seed 執行當下的 Asia/Taipei 日期為基準動態產生。
 */
export async function seedActivities(prisma, users) {
  const at = createTaipeiDateFactory(new Date());

  return prisma.$transaction(async (transaction) => {
    const fixedRecruiting = await transaction.activity.create({
      data: activityData({
        creator: users.alice,
        title: "週末野餐",
        description: "帶上喜歡的點心，一起在草地上度過悠閒午後。",
        location: "大安森林公園",
        category: "戶外",
        participantTarget: 5,
        status: "recruiting",
        schedule: {
          requires_voting: false,
          availability_mode: "slot",
          deadline_at: at(4, 11),
          vote_deadline_at: at(3, 20),
        },
        candidateSlots: [
          { slot_start: at(4, 11), slot_end: at(4, 14), all_day: false },
        ],
        participants: [users.alice, users.bob],
      }),
      include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
    });

    const rangeVoting = await transaction.activity.create({
      data: activityData({
        creator: users.alice,
        title: "咖啡廳讀書會",
        description: "回報方便的區間，找出最多人都能參加的時間。",
        location: "中山區咖啡廳",
        category: "學習",
        participantTarget: 4,
        status: "voting",
        schedule: {
          requires_voting: true,
          availability_mode: "range",
          fixed_date: at(6, 0),
          time_window_start: at(6, 13),
          time_window_end: at(6, 18),
          deadline_at: at(6, 13),
          vote_deadline_at: at(2, 20),
        },
        candidateSlots: [],
        participants: [users.alice, users.bob, users.carol, users.dave],
      }),
      include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
    });

    await transaction.activityAvailabilityRange.createMany({
      data: [
        {
          activity_id: rangeVoting.id,
          user_id: users.bob.id,
          range_start: at(6, 14),
          range_end: at(6, 17),
        },
        {
          activity_id: rangeVoting.id,
          user_id: users.carol.id,
          range_start: at(6, 15),
          range_end: at(6, 16),
        },
        {
          activity_id: rangeVoting.id,
          user_id: users.dave.id,
          range_start: at(6, 15),
          range_end: at(6, 18),
        },
      ],
    });

    const dateVoting = await transaction.activity.create({
      data: activityData({
        creator: users.alice,
        title: "近郊踏青",
        description: "三個候選日，票選大家最方便的週末。",
        location: "淡水河岸",
        category: "戶外",
        participantTarget: 5,
        status: "voting",
        schedule: {
          requires_voting: true,
          availability_mode: "slot",
          deadline_at: at(9, 10),
          vote_deadline_at: at(3, 20),
        },
        candidateSlots: [7, 8, 9].map((day) => ({
          slot_start: at(day, 10),
          slot_end: at(day, 16),
          all_day: false,
        })),
        participants: [users.alice, users.bob, users.carol, users.dave],
      }),
      include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
    });

    await transaction.activityAvailability.createMany({
      data: [
        { candidate_slot_id: dateVoting.candidateSlots[0].id, user_id: users.bob.id },
        { candidate_slot_id: dateVoting.candidateSlots[0].id, user_id: users.carol.id },
        { candidate_slot_id: dateVoting.candidateSlots[1].id, user_id: users.bob.id },
        { candidate_slot_id: dateVoting.candidateSlots[1].id, user_id: users.dave.id },
        { candidate_slot_id: dateVoting.candidateSlots[2].id, user_id: users.carol.id },
      ],
    });

    const dateTimeVoting = await transaction.activity.create({
      data: activityData({
        creator: users.alice,
        title: "晚餐聚會",
        description: "在候選晚餐時段內勾選各自真正有空的區間。",
        location: "信義區餐廳",
        category: "聚餐",
        participantTarget: 4,
        status: "voting",
        schedule: {
          requires_voting: true,
          availability_mode: "slot",
          deadline_at: at(11, 18),
          vote_deadline_at: at(4, 20),
        },
        candidateSlots: [
          { slot_start: at(10, 18), slot_end: at(10, 22), all_day: false },
          { slot_start: at(11, 18), slot_end: at(11, 21), all_day: false },
        ],
        participants: [users.alice, users.bob, users.carol, users.dave],
      }),
      include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
    });

    await transaction.activityAvailability.createMany({
      data: [
        {
          candidate_slot_id: dateTimeVoting.candidateSlots[0].id,
          user_id: users.bob.id,
          range_start: at(10, 18, 30),
          range_end: at(10, 21),
        },
        {
          candidate_slot_id: dateTimeVoting.candidateSlots[0].id,
          user_id: users.carol.id,
          range_start: at(10, 19),
          range_end: at(10, 20, 30),
        },
        {
          candidate_slot_id: dateTimeVoting.candidateSlots[0].id,
          user_id: users.dave.id,
          range_start: at(10, 19, 30),
          range_end: at(10, 20),
        },
        {
          candidate_slot_id: dateTimeVoting.candidateSlots[1].id,
          user_id: users.bob.id,
          range_start: at(11, 18),
          range_end: at(11, 19, 30),
        },
        {
          candidate_slot_id: dateTimeVoting.candidateSlots[1].id,
          user_id: users.carol.id,
          range_start: at(11, 19),
          range_end: at(11, 20),
        },
      ],
    });

    const fixedConfirmed = await transaction.activity.create({
      data: activityData({
        creator: users.bob,
        title: "電影之夜",
        description: "票已訂好，準時在影城入口集合。",
        location: "西門町電影院",
        category: "娛樂",
        participantTarget: 4,
        status: "confirmed",
        schedule: {
          requires_voting: false,
          availability_mode: "slot",
          deadline_at: at(12, 19),
          vote_deadline_at: at(5, 20),
        },
        candidateSlots: [
          { slot_start: at(12, 19), slot_end: at(12, 21, 30), all_day: false },
        ],
        participants: [users.bob, users.alice],
      }),
      include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
    });

    const dateConfirmed = await transaction.activity.create({
      data: activityData({
        creator: users.carol,
        title: "週末看展",
        description: "候選日期投票完成，一起去看期間限定展覽。",
        location: "松山文創園區",
        category: "展覽",
        participantTarget: 4,
        status: "confirmed",
        schedule: {
          requires_voting: true,
          availability_mode: "slot",
          deadline_at: at(14, 14),
          vote_deadline_at: at(6, 20),
        },
        candidateSlots: [
          { slot_start: at(13, 14), slot_end: at(13, 17), all_day: false },
          { slot_start: at(14, 14), slot_end: at(14, 17), all_day: false },
        ],
        participants: [users.carol, users.alice, users.bob],
      }),
      include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
    });

    const dateTimeConfirmed = await transaction.activity.create({
      data: activityData({
        creator: users.alice,
        title: "KTV 聚會",
        description: "晚場包廂已確認，接著看展行程一起唱歌。",
        location: "西門町 KTV",
        category: "娛樂",
        participantTarget: 5,
        status: "confirmed",
        schedule: {
          requires_voting: true,
          availability_mode: "slot",
          deadline_at: at(15, 18),
          vote_deadline_at: at(6, 20),
        },
        candidateSlots: [
          { slot_start: at(13, 19), slot_end: at(13, 22), all_day: false },
          { slot_start: at(15, 18), slot_end: at(15, 21), all_day: false },
        ],
        participants: [users.alice, users.bob, users.carol],
      }),
      include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
    });

    const cancelledActivity = await transaction.activity.create({
      data: activityData({
        creator: users.carol,
        title: "雨天市集",
        description: "因天候不佳取消，保留作為取消通知展示。",
        location: "華山文創園區",
        category: "市集",
        participantTarget: 4,
        status: "cancelled",
        schedule: {
          requires_voting: false,
          availability_mode: "slot",
          deadline_at: at(16, 11),
          vote_deadline_at: at(7, 20),
        },
        candidateSlots: [
          { slot_start: at(16, 11), slot_end: at(16, 16), all_day: false },
        ],
        participants: [users.carol, users.alice],
      }),
      include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
    });

    const calendarMorningYoga = await transaction.activity.create({
      data: activityData({
        creator: users.alice,
        title: "晨間瑜珈",
        description: "帶瑜珈墊到河濱伸展，從舒服的早晨開始一天。",
        location: "大佳河濱公園",
        category: "運動",
        participantTarget: 6,
        status: "confirmed",
        schedule: {
          requires_voting: false,
          availability_mode: "slot",
          deadline_at: at(2, 8),
          vote_deadline_at: at(1, 20),
        },
        candidateSlots: [
          { slot_start: at(2, 8), slot_end: at(2, 9, 30), all_day: false },
        ],
        participants: [users.alice, users.carol],
      }),
      include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
    });

    const calendarTeamLunch = await transaction.activity.create({
      data: activityData({
        creator: users.bob,
        title: "週日午餐",
        description: "一起試試新開的義大利餐廳。",
        location: "東區義大利餐廳",
        category: "聚餐",
        participantTarget: 4,
        status: "confirmed",
        schedule: {
          requires_voting: false,
          availability_mode: "slot",
          deadline_at: at(5, 12),
          vote_deadline_at: at(3, 20),
        },
        candidateSlots: [
          { slot_start: at(5, 12), slot_end: at(5, 14), all_day: false },
        ],
        participants: [users.bob, users.alice, users.dave],
      }),
      include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
    });

    const calendarBoardGames = await transaction.activity.create({
      data: activityData({
        creator: users.alice,
        title: "桌遊之夜",
        description: "下班後輕鬆玩幾款派對桌遊。",
        location: "信義區桌遊店",
        category: "娛樂",
        participantTarget: 6,
        status: "confirmed",
        schedule: {
          requires_voting: false,
          availability_mode: "slot",
          deadline_at: at(8, 19),
          vote_deadline_at: at(6, 20),
        },
        candidateSlots: [
          { slot_start: at(8, 19), slot_end: at(8, 22), all_day: false },
        ],
        participants: [users.alice, users.bob, users.carol, users.dave],
      }),
      include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
    });

    const calendarWeekendBrunch = await transaction.activity.create({
      data: activityData({
        creator: users.carol,
        title: "週末早午餐",
        description: "慢慢吃早午餐，交換最近的生活近況。",
        location: "民生社區早午餐店",
        category: "聚餐",
        participantTarget: 5,
        status: "confirmed",
        schedule: {
          requires_voting: false,
          availability_mode: "slot",
          deadline_at: at(18, 11),
          vote_deadline_at: at(15, 20),
        },
        candidateSlots: [
          { slot_start: at(18, 11), slot_end: at(18, 13), all_day: false },
        ],
        participants: [users.carol, users.alice, users.eve],
      }),
      include: { candidateSlots: { orderBy: { slot_start: "asc" } } },
    });

    for (const activity of [
      fixedConfirmed,
      dateConfirmed,
      dateTimeConfirmed,
      calendarMorningYoga,
      calendarTeamLunch,
      calendarBoardGames,
      calendarWeekendBrunch,
    ]) {
      await transaction.activitySchedule.update({
        where: { activity_id: activity.id },
        data: { confirmed_slot_id: activity.candidateSlots[0].id },
      });
    }

    return {
      fixedRecruiting,
      rangeVoting,
      dateVoting,
      dateTimeVoting,
      fixedConfirmed,
      dateConfirmed,
      dateTimeConfirmed,
      cancelledActivity,
      calendarMorningYoga,
      calendarTeamLunch,
      calendarBoardGames,
      calendarWeekendBrunch,
    };
  }, { timeout: 30_000 });
}
