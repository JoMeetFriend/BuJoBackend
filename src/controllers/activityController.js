import prisma from "../lib/prisma.js";
import {
  NOTIFICATION_TYPES,
  notifyFriendsActivityCreated,
  sendActivityLifecycleLineNotifications,
} from "../services/notificationService.js";

// 情境 a（日期時間都固定，單一候選時段、免投票）、情境 b（日期固定、候選時段複選投票）、
// 情境 c（候選日期複選、統一時間）、情境 d（候選日期各自不同時段）皆已支援，皆含到期判定。
// 候選時段平票時交由建立者裁決（voting 狀態的 confirmFormation），沒有額外的決選投票關卡。
const ACTIVITY_TITLE_MAX_LENGTH = 15;

export async function createActivity(req, res) {
  const {
    title,
    location,
    limit,
    note,
    type,
    deadline,
    startDate,
    startTime,
    endDate,
    endTime,
    allDay,
    singleDate,
    timeWindowStart,
    timeWindowEnd,
    candidateDates,
    uniformTime,
    dateSlots,
  } = req.body;
  const creatorId = req.user.userId;
  const isVotingC = Array.isArray(candidateDates) && candidateDates.length > 0;
  const isVotingD = Array.isArray(dateSlots) && dateSlots.length > 0;
  const isVotingB = !!singleDate && !startDate && !isVotingC && !isVotingD;
  const isVoting = isVotingB || isVotingC || isVotingD;
  const normalizedTitle = typeof title === "string" ? title.trim() : "";

  if (!normalizedTitle) {
    return res.status(400).json({ message: req.t("activity.titleRequired") });
  }
  if (normalizedTitle.length > ACTIVITY_TITLE_MAX_LENGTH) {
    return res
      .status(400)
      .json({ message: req.t("activity.titleTooLong", { max: ACTIVITY_TITLE_MAX_LENGTH }) });
  }
  if (!deadline) {
    return res.status(400).json({ message: req.t("activity.deadlineRequired") });
  }

  let candidateSlotsData;
  // deadline_at：該情境的決策硬截止天花板，完全由伺服器依情境公式計算，不接受客戶端輸入，
  // 保證不晚於活動實際發生時間；vote_deadline_at：報名截止，由客戶端送的 deadline 決定
  let scheduleExtra = { availability_mode: "slot" };
  if (isVotingB) {
    const fixedDate = parseDate(singleDate);
    const timeWindowStartAt = timeWindowStart
      ? parseDateTime(singleDate, timeWindowStart)
      : null;
    const timeWindowEndAt = timeWindowEnd
      ? parseDateTime(singleDate, timeWindowEnd)
      : null;
    scheduleExtra = {
      availability_mode: "range",
      fixed_date: fixedDate,
      time_window_start: timeWindowStartAt,
      time_window_end: timeWindowEndAt,
      deadline_at: timeWindowStartAt ?? fixedDate,
    };
    candidateSlotsData = [];
  } else if (isVotingC) {
    if (uniformTime?.allDay) {
      candidateSlotsData = buildCandidateDateAllDaySlots(candidateDates);
    } else if (uniformTime?.startTime && uniformTime?.endTime) {
      candidateSlotsData = buildCandidateDateSlots(candidateDates, uniformTime);
    } else {
      return res.status(400).json({ message: req.t("activity.uniformTimeOrAllDayRequired") });
    }
    // 情境三候選日期不連續，投票理應開放到「最晚」候選日才截止，不能像情境二一樣只看
    // 單一固定日期——用最早候選日當投票截止基準，會讓比較晚的候選日還沒到就被迫腰斬投票
    const latestSlotStart = new Date(
      Math.max(...candidateSlotsData.map((s) => s.slot_start.getTime())),
    );
    scheduleExtra = { availability_mode: "slot", deadline_at: latestSlotStart };
  } else if (isVotingD) {
    if (!dateSlots.every((s) => s.date && s.startTime && s.endTime)) {
      return res.status(400).json({ message: req.t("activity.eachCandidateDateNeedsSlot") });
    }
    // 每個候選日期只能對應一組時段，同一天出現兩筆會讓子區間交集運算跟參與者端的窗口選取產生歧義
    if (new Set(dateSlots.map((s) => s.date)).size !== dateSlots.length) {
      return res.status(400).json({ message: req.t("activity.oneSlotPerCandidateDate") });
    }
    candidateSlotsData = buildDateSlots(dateSlots);
    // 情境四候選時段跨多個不連續日期，跟情境三同理，投票理應開放到「最晚」候選時段才截止
    const latestSlotStart = new Date(
      Math.max(...candidateSlotsData.map((s) => s.slot_start.getTime())),
    );
    scheduleExtra = { availability_mode: "slot", deadline_at: latestSlotStart };
  } else {
    if (!startDate) {
      return res.status(400).json({ message: req.t("activity.startDateRequired") });
    }
    const { slotStart, slotEnd } = buildFixedSlot(
      startDate,
      startTime,
      endDate,
      endTime,
      allDay,
    );
    candidateSlotsData = [
      { slot_start: slotStart, slot_end: slotEnd, all_day: !!allDay },
    ];
    scheduleExtra = { availability_mode: "slot", deadline_at: slotStart };
  }

  // 日期解析失敗（例如送 ISO 格式而不是 YYYY/MM/DD + 上午/下午時制）產生的 Invalid Date
  // 與任何比較運算都是 false，會一路穿過後面的檢查直到 Prisma 寫入才炸 500——在這裡統一擋下
  const voteDeadlineAt = new Date(deadline);
  const datesToValidate = [
    scheduleExtra.deadline_at,
    scheduleExtra.fixed_date,
    scheduleExtra.time_window_start,
    scheduleExtra.time_window_end,
    voteDeadlineAt,
    ...candidateSlotsData.flatMap((s) => [s.slot_start, s.slot_end]),
  ];
  if (datesToValidate.some((d) => d != null && Number.isNaN(d.getTime()))) {
    return res.status(400).json({ message: req.t("activity.invalidDateFormat") });
  }

  // 前端有擋結束時間必須晚於開始時間，但這是公開 API，不能只靠前端擋——這裡重新驗證一次，
  // 避免繞過前端直接打 API 建出 slot_end <= slot_start 的候選時段（見情境二 join 603 行同樣原則）
  if (candidateSlotsData.some((s) => s.slot_end <= s.slot_start)) {
    return res.status(400).json({ message: req.t("activity.endMustBeAfterStart") });
  }
  if (
    scheduleExtra.time_window_start &&
    scheduleExtra.time_window_end &&
    scheduleExtra.time_window_end <= scheduleExtra.time_window_start
  ) {
    return res.status(400).json({ message: req.t("activity.endMustBeAfterStart") });
  }

  if (scheduleExtra.deadline_at <= new Date()) {
    return res
      .status(400)
      .json({ message: req.t("activity.timeAlreadyPast") });
  }
  // 「無報名緩衝」的極端 fallback（活動快開始、連最小預設都不安全）刻意讓 vote_deadline_at
  // 等於 deadline_at，這是合法狀態，不能用 >= 擋掉，只有「晚於」天花板才是真的不合理
  if (voteDeadlineAt > scheduleExtra.deadline_at) {
    return res
      .status(400)
      .json({ message: req.t("activity.voteDeadlineAfterDecisionDeadline") });
  }

  try {
    const activity = await prisma.activity.create({
      data: {
        creator_id: creatorId,
        title: normalizedTitle,
        description: note ?? null,
        location: location ?? null,
        category: type ?? null,
        participant_target: limit ?? null,
        status: "recruiting",
        schedule: {
          create: {
            requires_voting: isVoting,
            vote_deadline_at: voteDeadlineAt,
            ...scheduleExtra,
          },
        },
        candidateSlots: {
          create: candidateSlotsData,
        },
        participants: {
          create: { user_id: creatorId },
        },
        chat: {
          create: { name: normalizedTitle },
        },
      },
      include: { candidateSlots: true },
    });

    await notifyFriendsActivityCreated({
      creatorId,
      activityId: activity.id,
    });

    return res.status(201).json({ activity: { id: activity.id } });
  } catch (error) {
    console.error("createActivity 錯誤：", error);
    return res.status(500).json({ message: req.t("common.serverError") });
  }
}

export async function listActivities(req, res) {
  const userId = req.user.userId;

  try {
    // 撈好友 ID（雙向關係）
    const friendships = await prisma.friendship.findMany({
      where: {
        status: "accepted",
        OR: [{ requester_id: userId }, { receiver_id: userId }],
      },
      select: { requester_id: true, receiver_id: true },
    });
    const friendIds = friendships.map((f) =>
      f.requester_id === userId ? f.receiver_id : f.requester_id,
    );

    const activities = await prisma.activity.findMany({
      where: {
        OR: [
          // 我已報名的活動（非已取消）
          {
            status: { not: "cancelled" },
            participants: { some: { user_id: userId, status: "joined" } },
          },
          // 好友建立、揪團中、我還沒加入
          ...(friendIds.length > 0
            ? [
                {
                  status: "recruiting",
                  creator_id: { in: friendIds },
                  NOT: {
                    participants: {
                      some: { user_id: userId, status: "joined" },
                    },
                  },
                },
              ]
            : []),
        ],
      },
      include: {
        creator: {
          select: {
            id: true,
            display_name: true,
            avatar_url: true,
          },
        },
        schedule: { include: { confirmedSlot: true } },
        candidateSlots: true,
        participants: {
          where: { status: "joined" },
          include: {
            user: { select: { id: true, avatar_url: true } },
          },
          orderBy: { joined_at: "asc" },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return res.json({
      activities: activities.map((act) => formatCard(act, userId)),
    });
  } catch (error) {
    console.error("listActivities 錯誤：", error);
    return res.status(500).json({ message: req.t("common.serverError") });
  }
}

export async function getActivity(req, res) {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, display_name: true, avatar_url: true } },
        schedule: { include: { confirmedSlot: true } },
        candidateSlots: { include: { availabilities: true } },
        availabilityRanges: true,
        participants: {
          where: { status: "joined" },
          include: {
            user: {
              select: { id: true, display_name: true, avatar_url: true },
            },
          },
          orderBy: { joined_at: "asc" },
        },
      },
    });

    if (!activity) {
      return res.status(404).json({ message: req.t("activity.notFound") });
    }

    // Lazy 狀態轉換（不用 cron，每次 GET 時觸發）
    const now = new Date();
    const sched = activity.schedule;
    const isRangeMode = sched?.availability_mode === "range";
    let currentStatus = activity.status;
    let confirmedSlot = sched?.confirmedSlot ?? null;
    const joinedCount = activity.participants.length;

    // 四情境統一：招募截止一律看 vote_deadline_at（報名截止），不是 deadline_at
    // （新模型下 deadline_at 是決策硬截止天花板，語意完全不同，不能拿來當招募截止判斷）
    const scheduleVariant = deriveScheduleVariant(
      sched,
      activity.candidateSlots,
    );
    const recruitingDeadline = sched?.vote_deadline_at;

    if (currentStatus === "recruiting" && sched && now >= recruitingDeadline) {
      const target = activity.participant_target;
      let nextStatus;

      if (target && joinedCount < target) {
        nextStatus = "cancelled";
      } else if (
        isRangeMode &&
        !target &&
        (activity.availabilityRanges ?? []).filter(
          (r) => r.user_id !== activity.creator_id,
        ).length === 0
      ) {
        // 情境二專屬：沒設人數上限、到期、且除建立者外無人提交過可用時間 → 直接取消，不進入無意義的 voting
        nextStatus = "cancelled";
      } else {
        // 任何情境都不自動 confirmed——一律進入決策緩衝狀態，等建立者手動 confirmFormation
        nextStatus = "voting";
      }

      // 用 updateMany + where status='recruiting' 當樂觀鎖：GET 可能被併發打到，
      // 只有真正把狀態從 recruiting 搶下來的那個請求才會建立通知，避免重複通知
      const won = await prisma.$transaction(async (tx) => {
        const { count } = await tx.activity.updateMany({
          where: { id, status: "recruiting" },
          data: { status: nextStatus },
        });
        if (count === 0) return false;

        if (nextStatus === "voting") {
          await tx.notification.create({
            data: {
              user_id: activity.creator_id,
              type: "time_to_pick",
              reference_id: id,
              reference_type: "activity",
            },
          });
        } else {
          await tx.notification.createMany({
            data: activity.participants.map((p) => ({
              user_id: p.user_id,
              type: "activity_cancelled",
              reference_id: id,
              reference_type: "activity",
            })),
          });
        }

        return true;
      });

      if (won) {
        currentStatus = nextStatus;
        // LINE 推播只在交易 commit 後發送；樂觀鎖敗者走 else 分支自然不推播
        if (nextStatus === "voting") {
          await sendActivityLifecycleLineNotifications({
            userIds: [activity.creator_id],
            activityId: id,
            type: NOTIFICATION_TYPES.TIME_TO_PICK,
          });
        } else {
          await sendActivityLifecycleLineNotifications({
            userIds: activity.participants.map((p) => p.user_id),
            activityId: id,
            type: NOTIFICATION_TYPES.ACTIVITY_CANCELLED,
          });
        }
      } else {
        // 沒搶到：代表另一個併發請求已經完成轉換，重新讀取最新狀態避免回傳過期資料
        const fresh = await prisma.activity.findUnique({
          where: { id },
          select: {
            status: true,
            schedule: { select: { confirmedSlot: true } },
          },
        });
        currentStatus = fresh.status;
        confirmedSlot = fresh.schedule?.confirmedSlot ?? confirmedSlot;
      }
    } else if (
      currentStatus === "voting" &&
      sched?.deadline_at &&
      now >= sched.deadline_at &&
      !confirmedSlot
    ) {
      // 四情境統一：決策緩衝期（voting 狀態）逾期，建立者還沒手動確認 → 自動取消，通知建立者和報名者
      const won = await prisma.$transaction(async (tx) => {
        const { count } = await tx.activity.updateMany({
          where: { id, status: "voting" },
          data: { status: "cancelled" },
        });
        if (count === 0) return false;

        await tx.notification.createMany({
          data: activity.participants.map((p) => ({
            user_id: p.user_id,
            type: "activity_cancelled",
            reference_id: id,
            reference_type: "activity",
          })),
        });

        return true;
      });

      if (won) {
        currentStatus = "cancelled";
        await sendActivityLifecycleLineNotifications({
          userIds: activity.participants.map((p) => p.user_id),
          activityId: id,
          type: NOTIFICATION_TYPES.ACTIVITY_CANCELLED,
        });
      } else {
        const fresh = await prisma.activity.findUnique({
          where: { id },
          select: {
            status: true,
            schedule: { select: { confirmedSlot: true } },
          },
        });
        currentStatus = fresh.status;
        confirmedSlot = fresh.schedule?.confirmedSlot ?? confirmedSlot;
      }
    }

    // 建立者決策階段：附上目前候選/決選的支持人數，方便建立者選擇
    // recruiting 狀態下（投票制、尚未到期）也要附上，讓建立者可以提前手動成團
    let decisionCandidates = null;
    if (
      currentStatus === "voting" ||
      (currentStatus === "recruiting" && sched?.requires_voting)
    ) {
      if (isRangeMode) {
        const windowStart = sched.time_window_start ?? sched.fixed_date;
        const windowEnd =
          sched.time_window_end ??
          new Date(sched.fixed_date.getTime() + 24 * 60 * 60 * 1000);
        const submittedRanges = getJoinedAvailabilityRanges(activity);
        const participantsById = buildParticipantsById(activity);
        decisionCandidates = computeRangeRanking(
          submittedRanges,
          windowStart,
          windowEnd,
          getJoinedSubmitterCount(activity),
          participantsById,
        );
      } else if (scheduleVariant === "find_date_time") {
        // 情境四：每個候選時段各自跑一次交集運算，讓建立者看到窗口內實際重疊的窄時段，不只是票數；
        // 內層合併後的結果放在 segments，取代原本的 perfect_overlap/partial_overlap 雙陣列。
        // 排除建立者自己的 availability（即使資料庫裡有殘留紀錄），不然 count/segments 會把建立者
        // 也算成支持者，出現 count 超過真人分母的不合理比例
        const participantsById = buildParticipantsById(activity);
        decisionCandidates = activity.candidateSlots
          .map((s) => {
            const realAvailabilities = excludeCreator(
              s.availabilities,
              activity.creator_id,
            );
            return {
              id: s.id,
              slot_start: s.slot_start,
              slot_end: s.slot_end,
              count: realAvailabilities.length,
              segments: computeSlotOverlapRanking(
                { ...s, availabilities: realAvailabilities },
                participantsById,
              ),
            };
          })
          .sort((a, b) => b.count - a.count);
      } else {
        // 情境三：回傳所有候選時段的完整支持度排名，不再只回傳並列最高票，並附上支持者清單；
        // 排除建立者自己的 availability，理由同情境四
        const availabilities = excludeCreator(
          activity.candidateSlots.flatMap((s) => s.availabilities),
          activity.creator_id,
        );
        const votingParticipantCount = getVotingParticipantCount(activity);
        const participantsById = buildParticipantsById(activity);
        decisionCandidates = activity.candidateSlots
          .map((s) => {
            const covering = availabilities.filter(
              (a) => a.candidate_slot_id === s.id,
            );
            const count = covering.length;
            return {
              id: s.id,
              slot_start: s.slot_start,
              slot_end: s.slot_end,
              count,
              is_unanimous: count > 0 && count === votingParticipantCount,
              supporters: covering.map((a) => ({
                user_id: a.user_id,
                display_name: participantsById[a.user_id]?.display_name ?? null,
                avatar_url: participantsById[a.user_id]?.avatar_url ?? null,
              })),
            };
          })
          .sort((a, b) => b.count - a.count);
      }
    }

    const isCreator = activity.creator_id === userId;
    const hasJoined = activity.participants.some((p) => p.user_id === userId);

    return res.json({
      activity: {
        id: activity.id,
        title: activity.title,
        location: activity.location,
        description: activity.description,
        category: activity.category,
        status: currentStatus,
        participant_target: activity.participant_target,
        is_creator: isCreator,
        has_joined: hasJoined,
        creator: activity.creator,
        requires_voting: sched?.requires_voting ?? false,
        availability_mode: sched?.availability_mode ?? "slot",
        schedule_variant: deriveScheduleVariant(sched, activity.candidateSlots),
        deadline_at: sched?.deadline_at ?? null,
        fixed_date: sched?.fixed_date ? formatISODate(sched.fixed_date) : null,
        time_window_start: sched?.time_window_start
          ? formatHHMM(sched.time_window_start)
          : null,
        time_window_end: sched?.time_window_end
          ? formatHHMM(sched.time_window_end)
          : null,
        candidate_slots: activity.candidateSlots.map((s) => {
          const mine = s.availabilities.find((a) => a.user_id === userId);
          const isSelected = !!mine;
          // 非建立者才看得到「跟我同時段的人」，且只有自己選過的候選時段才有意義，沒選的一律空陣列，
          // 不洩漏使用者沒選的時段裡別人選了誰
          let coParticipants = [];
          if (!isCreator && isSelected && decisionCandidates) {
            if (scheduleVariant === "find_date_time") {
              // 情境四：用這個候選時段自己的 segments（子區間交集運算結果），篩出跟我自己的子區間
              // （沒填子區間時 fallback 成整個候選時段窗口，跟 computeSlotOverlapRanking 內部規則一致）
              // 有時間重疊的人
              const group = decisionCandidates.find((dc) => dc.id === s.id);
              if (group) {
                const myStart =
                  mine.range_start && mine.range_end
                    ? mine.range_start
                    : s.slot_start;
                const myEnd =
                  mine.range_start && mine.range_end
                    ? mine.range_end
                    : s.slot_end;
                coParticipants = collectOverlappingCoParticipants(
                  group.segments,
                  myStart,
                  myEnd,
                  userId,
                );
              }
            } else if (scheduleVariant === "find_date") {
              // 情境三：候選時段本身沒有子區間，顆粒度就是「選了同一天」，直接用該候選時段的 supporters 扣掉自己
              const entry = decisionCandidates.find((dc) => dc.id === s.id);
              coParticipants = (entry?.supporters ?? []).filter(
                (sup) => sup.user_id !== userId,
              );
            }
          }
          return {
            id: s.id,
            slot_start: s.slot_start,
            slot_end: s.slot_end,
            all_day: s.all_day,
            is_selected: isSelected,
            // 情境四：這個人自己存的子區間，讓前端「修改報名時段」重開 picker 時可以預填
            my_range:
              mine?.range_start && mine?.range_end
                ? {
                    start: mine.range_start.toISOString(),
                    end: mine.range_end.toISOString(),
                  }
                : null,
            co_participants: coParticipants,
          };
        }),
        // range 模式下這個人自己先前送出的可用時間，讓前端「修改時間」重開 picker 時可以預填，
        // 不用逼使用者重新選一次；非 range 模式一律回空陣列
        my_ranges: isRangeMode
          ? activity.availabilityRanges
              .filter((r) => r.user_id === userId)
              .map((r) => ({
                start: r.range_start.toISOString(),
                end: r.range_end.toISOString(),
                // 非建立者才看得到「跟我同時段的人」，建立者直接拿完整 decision_candidates，不需要這個欄位
                co_participants:
                  !isCreator && decisionCandidates
                    ? collectOverlappingCoParticipants(
                        decisionCandidates,
                        r.range_start,
                        r.range_end,
                        userId,
                      )
                    : [],
              }))
          : [],
        decision_candidates: isCreator ? decisionCandidates : null,
        confirmed_slot: confirmedSlot,
        participants: activity.participants.map((p) => ({
          id: p.user_id,
          display_name: p.user.display_name,
          avatar_url: p.user.avatar_url,
        })),
        current_count: activity.participants.length,
      },
    });
  } catch (error) {
    console.error("getActivity 錯誤：", error);
    return res.status(500).json({ message: req.t("common.serverError") });
  }
}

export async function joinActivity(req, res) {
  const { id } = req.params;
  const userId = req.user.userId;
  const { candidateSlotIds, ranges, candidateSlotRanges } = req.body;

  try {
    // 達標時記下建立者，交易 commit 後才發 LINE 推播（不在交易內做外部 HTTP）
    let formationReadyCreatorId = null;
    const outcome = await prisma.$transaction(async (tx) => {
      // 先鎖住這筆活動的 row，讓同一活動的併發報名請求依序處理，
      // 避免兩個請求同時讀到「還有名額」而一起插入，導致人數超過 participant_target
      await tx.$queryRaw`SELECT id FROM activities WHERE id = ${id} FOR UPDATE`;

      const activity = await tx.activity.findUnique({
        where: { id },
        include: {
          participants: { where: { status: "joined" } },
          schedule: true,
          candidateSlots: { include: { availabilities: true } },
        },
      });

      if (!activity) return { status: 404, message: req.t("activity.notFound") };
      if (activity.creator_id === userId)
        return { status: 400, message: req.t("activity.cannotJoinOwnActivity") };

      // 四個情境皆適用：即使還沒有人打開詳情頁觸發 lazy check 轉換狀態，報名截止一律拒絕報名——
      // 判斷依據是 vote_deadline_at（報名截止），不是 deadline_at（決策硬截止天花板，語意不同）
      if (
        activity.schedule &&
        activity.schedule.vote_deadline_at < new Date()
      ) {
        return { status: 400, message: req.t("activity.registrationClosed") };
      }

      const existing = await tx.activityParticipant.findUnique({
        where: { activity_id_user_id: { activity_id: id, user_id: userId } },
      });
      const isRangeMode = activity.schedule?.availability_mode === "range";
      const requiresVoting = !!activity.schedule?.requires_voting;
      const scheduleVariant = deriveScheduleVariant(
        activity.schedule,
        activity.candidateSlots,
      );
      const isFindDateMode =
        scheduleVariant === "find_date" || scheduleVariant === "find_date_time";
      // range 模式跟 Mode C/D 一樣，已報名者只能在 recruiting 階段重送答案——voting 階段建立者已經在看
      // 彙總後的決選畫面，這時候還讓人改答案會讓建立者看到的東西跟實際不符
      const isRangeResubmission = isRangeMode && existing?.status === "joined";
      const isFindDateResubmission =
        !isRangeMode &&
        requiresVoting &&
        isFindDateMode &&
        existing?.status === "joined";
      const isResubmission = isRangeResubmission || isFindDateResubmission;

      if (!isResubmission && activity.status !== "recruiting") {
        return { status: 400, message: req.t("activity.notRecruiting") };
      }
      if (isResubmission && activity.status !== "recruiting") {
        return { status: 400, message: req.t("activity.notRecruiting") };
      }

      let availabilityData = [];
      let rangesData = [];
      if (isRangeMode) {
        const list = Array.isArray(ranges) ? ranges : [];
        if (list.length === 0) {
          return { status: 400, message: req.t("activity.provideAtLeastOneAvailability") };
        }
        const windowStart = activity.schedule.time_window_start;
        const windowEnd = activity.schedule.time_window_end;
        for (const r of list) {
          const start = new Date(r.start);
          const end = new Date(r.end);
          if (
            (windowStart && start < windowStart) ||
            (windowEnd && end > windowEnd)
          ) {
            return {
              status: 400,
              message: req.t("activity.availabilityOutOfRange"),
            };
          }
        }
        rangesData = list.map((r) => ({
          activity_id: id,
          user_id: userId,
          range_start: new Date(r.start),
          range_end: new Date(r.end),
        }));
      } else if (requiresVoting) {
        const ids = Array.isArray(candidateSlotIds)
          ? [...new Set(candidateSlotIds)]
          : [];
        if (ids.length === 0) {
          return { status: 400, message: req.t("activity.selectAtLeastOneSlot") };
        }
        const slotsById = new Map(
          activity.candidateSlots.map((s) => [s.id, s]),
        );
        if (!ids.every((sid) => slotsById.has(sid))) {
          return { status: 400, message: req.t("activity.slotNotFound") };
        }

        // 情境四：參與者可以額外附上在候選時段窗口內自選的子區間，僅供建立者決策參考顯示，
        // 不信任前端已經做過的邊界檢查，寫入前重新驗證落在對應候選時段的 slot_start~slot_end 之間
        const rangeList = Array.isArray(candidateSlotRanges)
          ? candidateSlotRanges
          : [];
        const rangeBySlotId = new Map();
        for (const r of rangeList) {
          const slot = slotsById.get(r.candidateSlotId);
          if (!slot) {
            return { status: 400, message: req.t("activity.slotNotFound") };
          }
          const rangeStart = new Date(r.rangeStart);
          const rangeEnd = new Date(r.rangeEnd);
          if (rangeStart < slot.slot_start || rangeEnd > slot.slot_end) {
            return { status: 400, message: req.t("activity.subRangeOutOfSlot") };
          }
          rangeBySlotId.set(r.candidateSlotId, { rangeStart, rangeEnd });
        }

        availabilityData = ids.map((candidate_slot_id) => {
          const range = rangeBySlotId.get(candidate_slot_id);
          return {
            candidate_slot_id,
            user_id: userId,
            range_start: range?.rangeStart ?? null,
            range_end: range?.rangeEnd ?? null,
          };
        });
      }

      const currentCount = activity.participants.length;
      if (!isResubmission) {
        if (
          activity.participant_target &&
          currentCount >= activity.participant_target
        ) {
          return { status: 400, message: req.t("activity.full") };
        }
        if (existing?.status === "joined")
          return { status: 400, message: req.t("activity.alreadyJoined") };
      }

      const newCount = isResubmission ? currentCount : currentCount + 1;
      const targetReached =
        !isResubmission &&
        !!activity.participant_target &&
        newCount >= activity.participant_target;

      if (!isResubmission) {
        if (existing) {
          await tx.activityParticipant.update({
            where: { id: existing.id },
            data: { status: "joined", joined_at: new Date() },
          });
        } else {
          await tx.activityParticipant.create({
            data: { activity_id: id, user_id: userId },
          });
        }
      }

      if (isRangeMode) {
        await tx.activityAvailabilityRange.deleteMany({
          where: { activity_id: id, user_id: userId },
        });
        await tx.activityAvailabilityRange.createMany({ data: rangesData });
      } else if (requiresVoting) {
        if (isFindDateResubmission) {
          await tx.activityAvailability.deleteMany({
            where: { user_id: userId, candidateSlot: { activity_id: id } },
          });
        }
        await tx.activityAvailability.createMany({
          data: availabilityData,
          skipDuplicates: true,
        });
      }

      // 人數一達標只提醒建立者，成團永遠要建立者手動 confirmFormation 決定，不自動判定——
      // 四個情境統一：一律轉入決策緩衝狀態（voting）並通知建立者，不再有情境一停留 recruiting、
      // range 模式被排除在外這種各情境不一致的例外
      if (targetReached) {
        await tx.activity.update({ where: { id }, data: { status: "voting" } });
        await tx.notification.create({
          data: {
            user_id: activity.creator_id,
            type: NOTIFICATION_TYPES.FORMATION_READY,
            reference_id: id,
            reference_type: "activity",
          },
        });
        formationReadyCreatorId = activity.creator_id;
      }

      return null;
    });

    if (outcome) {
      return res.status(outcome.status).json({ message: outcome.message });
    }
    if (formationReadyCreatorId) {
      await sendActivityLifecycleLineNotifications({
        userIds: [formationReadyCreatorId],
        activityId: id,
        type: NOTIFICATION_TYPES.FORMATION_READY,
      });
    }
    return res.json({ message: req.t("activity.joinSuccess") });
  } catch (error) {
    console.error("joinActivity 錯誤：", error);
    return res.status(500).json({ message: req.t("common.serverError") });
  }
}

export async function getRankedSlots(req, res) {
  return res.status(400).json({ message: req.t("activity.notSupported") });
}

export async function confirmFormation(req, res) {
  const { id } = req.params;
  const userId = req.user.userId;
  const { candidateSlotId, slotStart, slotEnd } = req.body;

  try {
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: {
        schedule: true,
        candidateSlots: { include: { availabilities: true } },
        availabilityRanges: true,
        participants: { where: { status: "joined" } },
      },
    });

    if (!activity) return res.status(404).json({ message: req.t("activity.notFound") });
    if (activity.creator_id !== userId)
      return res.status(403).json({ message: req.t("activity.onlyCreatorCanConfirm") });

    const requiresVoting = !!activity.schedule?.requires_voting;
    const isRangeMode = activity.schedule?.availability_mode === "range";
    const scheduleVariant = deriveScheduleVariant(
      activity.schedule,
      activity.candidateSlots,
    );
    let winningSlot;
    let newCandidateSlotData = null;

    if (isRangeMode) {
      if (activity.status !== "recruiting" && activity.status !== "voting") {
        return res.status(400).json({ message: req.t("activity.formationNotAllowedInState") });
      }
      if (!slotStart || !slotEnd)
        return res.status(400).json({ message: req.t("activity.selectSlotToConfirm") });

      const sched = activity.schedule;
      const windowStart = sched.time_window_start ?? sched.fixed_date;
      const windowEnd =
        sched.time_window_end ??
        new Date(sched.fixed_date.getTime() + 24 * 60 * 60 * 1000);
      const submittedRanges = getJoinedAvailabilityRanges(activity);
      const candidates = computeRangeRanking(
        submittedRanges,
        windowStart,
        windowEnd,
        getJoinedSubmitterCount(activity),
      );

      const start = new Date(slotStart);
      const end = new Date(slotEnd);
      const matched = candidates.find(
        (c) =>
          c.slot_start.getTime() === start.getTime() &&
          c.slot_end.getTime() === end.getTime(),
      );
      if (!matched)
        return res
          .status(400)
          .json({ message: req.t("activity.slotNotConfirmable") });

      newCandidateSlotData = {
        slot_start: start,
        slot_end: end,
        all_day: false,
      };
    } else if (!requiresVoting) {
      if (activity.status !== "recruiting" && activity.status !== "voting") {
        return res.status(400).json({ message: req.t("activity.formationNotAllowedInState") });
      }
      winningSlot = activity.candidateSlots[0];
    } else if (scheduleVariant === "find_date_time") {
      // 情境四：建立者從交集運算算出的窄窗口裡挑一段，不是直接採用候選時段的原始邊界
      if (activity.status !== "recruiting" && activity.status !== "voting") {
        return res.status(400).json({ message: req.t("activity.formationNotAllowedInState") });
      }
      if (!candidateSlotId)
        return res.status(400).json({ message: req.t("activity.selectCandidateSlotToConfirm") });
      const slot = activity.candidateSlots.find(
        (s) => s.id === candidateSlotId,
      );
      if (!slot)
        return res
          .status(400)
          .json({ message: req.t("activity.slotNotConfirmable") });
      if (!slotStart || !slotEnd)
        return res.status(400).json({ message: req.t("activity.selectSlotToConfirm") });

      const candidates = computeSlotOverlapRanking({
        ...slot,
        availabilities: excludeCreator(
          slot.availabilities,
          activity.creator_id,
        ),
      });
      const start = new Date(slotStart);
      const end = new Date(slotEnd);
      const matched = candidates.find(
        (c) =>
          c.slot_start.getTime() === start.getTime() &&
          c.slot_end.getTime() === end.getTime(),
      );
      if (!matched)
        return res
          .status(400)
          .json({ message: req.t("activity.slotNotConfirmable") });

      newCandidateSlotData = {
        slot_start: start,
        slot_end: end,
        all_day: false,
      };
    } else {
      // 情境三：建立者可以自由選任何一個真實存在的候選時段，不限並列最高票
      if (activity.status !== "recruiting" && activity.status !== "voting") {
        return res.status(400).json({ message: req.t("activity.formationNotAllowedInState") });
      }
      if (!candidateSlotId)
        return res.status(400).json({ message: req.t("activity.selectCandidateSlotToConfirm") });

      winningSlot = activity.candidateSlots.find(
        (s) => s.id === candidateSlotId,
      );
      if (!winningSlot)
        return res
          .status(400)
          .json({ message: req.t("activity.slotNotConfirmable") });
    }

    // 四情境皆適用：拒絕確認一個開始時間已經過去的候選時段/時段（range 模式與情境四是臨時算出的窄窗口）
    const confirmingStart =
      newCandidateSlotData?.slot_start ?? winningSlot?.slot_start;
    if (confirmingStart && confirmingStart <= new Date()) {
      return res.status(400).json({ message: req.t("activity.slotAlreadyPast") });
    }

    const notifyTargets = activity.participants.filter(
      (p) => p.user_id !== userId,
    );

    // 用 updateMany + where status=讀到的狀態 當樂觀鎖，避免同一個創建者重複送出造成重複轉換/重複通知
    const won = await prisma.$transaction(async (tx) => {
      const { count } = await tx.activity.updateMany({
        where: { id, status: activity.status },
        data: { status: "confirmed" },
      });
      if (count === 0) return false;

      // range 模式跟情境四都是在確認成團的當下才臨時建立候選時段（存算出來的窄窗口），
      // 不是沿用建立活動時就存在的候選時段原始邊界
      const confirmedSlotId =
        isRangeMode || scheduleVariant === "find_date_time"
          ? (
              await tx.activityCandidateSlot.create({
                data: { activity_id: id, ...newCandidateSlotData },
              })
            ).id
          : winningSlot.id;

      await tx.activitySchedule.update({
        where: { activity_id: id },
        data: { confirmed_slot_id: confirmedSlotId },
      });

      if (notifyTargets.length > 0) {
        await tx.notification.createMany({
          data: notifyTargets.map((p) => ({
            user_id: p.user_id,
            type: "activity_confirmed",
            reference_id: id,
            reference_type: "activity",
          })),
        });
      }

      return true;
    });

    if (!won) {
      return res
        .status(409)
        .json({ message: req.t("activity.stateChangedConcurrently") });
    }

    await sendActivityLifecycleLineNotifications({
      userIds: notifyTargets.map((p) => p.user_id),
      activityId: id,
      type: NOTIFICATION_TYPES.ACTIVITY_CONFIRMED,
    });

    return res.json({ message: req.t("activity.confirmSuccess") });
  } catch (error) {
    console.error("confirmFormation 錯誤：", error);
    return res.status(500).json({ message: req.t("common.serverError") });
  }
}

export async function cancelActivity(req, res) {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: {
        participants: { where: { status: "joined" } },
      },
    });

    if (!activity) return res.status(404).json({ message: req.t("activity.notFound") });
    if (activity.creator_id !== userId)
      return res.status(403).json({ message: req.t("activity.onlyCreatorCanCancel") });
    if (activity.status === "cancelled" || activity.status === "confirmed") {
      return res.status(400).json({ message: req.t("activity.cannotCancel") });
    }

    const notifyTargets = activity.participants.filter(
      (p) => p.user_id !== userId,
    );

    const won = await prisma.$transaction(async (tx) => {
      const { count } = await tx.activity.updateMany({
        where: { id, status: activity.status },
        data: { status: "cancelled" },
      });
      if (count === 0) return false;

      if (notifyTargets.length > 0) {
        await tx.notification.createMany({
          data: notifyTargets.map((p) => ({
            user_id: p.user_id,
            type: "activity_cancelled",
            reference_id: id,
            reference_type: "activity",
          })),
        });
      }

      return true;
    });

    if (!won) {
      return res
        .status(409)
        .json({ message: req.t("activity.stateChangedConcurrently") });
    }

    await sendActivityLifecycleLineNotifications({
      userIds: notifyTargets.map((p) => p.user_id),
      activityId: id,
      type: NOTIFICATION_TYPES.ACTIVITY_CANCELLED,
    });

    return res.json({ message: req.t("activity.cancelled") });
  } catch (error) {
    console.error("cancelActivity 錯誤：", error);
    return res.status(500).json({ message: req.t("common.serverError") });
  }
}

export async function cancelJoin(req, res) {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const activity = await prisma.activity.findUnique({
      where: { id },
    });

    if (!activity) return res.status(404).json({ message: req.t("activity.notFound") });
    if (activity.status !== "recruiting") {
      return res.status(400).json({ message: req.t("activity.cannotCancelJoinInState") });
    }

    const participant = await prisma.activityParticipant.findUnique({
      where: { activity_id_user_id: { activity_id: id, user_id: userId } },
    });

    if (!participant || participant.status !== "joined") {
      return res.status(400).json({ message: req.t("activity.notJoined") });
    }

    await prisma.$transaction([
      prisma.activityParticipant.update({
        where: { id: participant.id },
        data: { status: "left" },
      }),
      prisma.activityAvailability.deleteMany({
        where: { user_id: userId, candidateSlot: { activity_id: id } },
      }),
      prisma.activityAvailabilityRange.deleteMany({
        where: { activity_id: id, user_id: userId },
      }),
    ]);

    return res.json({ message: req.t("activity.joinCancelled") });
  } catch (error) {
    console.error("cancelJoin 錯誤：", error);
    return res.status(500).json({ message: req.t("common.serverError") });
  }
}

// ── helpers ──────────────────────────────────────────────

function deriveScheduleVariant(schedule, candidateSlots = []) {
  if (!schedule?.requires_voting) return "fixed";
  if (schedule.availability_mode === "range") return "find_time";
  return isUniformMultiDateSlotVoting(candidateSlots)
    ? "find_date"
    : "find_date_time";
}

// 建立者對自己建立的候選時段/活動有空是結構性保證的事實，不是主動投票訊號——即使資料庫裡
// 殘留建立者自己的 availability/range 紀錄（例如舊資料、或建立者本來就是 joined participants
// 之一），計算 count/supporters 前一律要先排除，口徑要跟 getVotingParticipantCount 分母一致，
// 否則會出現 count 大於分母的不合理比例（例如「2/1人」）
function excludeCreator(items, creatorId) {
  return items.filter((item) => item.user_id !== creatorId);
}

function getJoinedAvailabilityRanges(activity) {
  const joinedUserIds = new Set(activity.participants.map((p) => p.user_id));
  return excludeCreator(
    (activity.availabilityRanges ?? []).filter((r) =>
      joinedUserIds.has(r.user_id),
    ),
    activity.creator_id,
  ).map((r) => ({
    start: r.range_start,
    end: r.range_end,
    user_id: r.user_id,
  }));
}

// 把 activity.participants（含 user.display_name/avatar_url）組成 user_id 對照表，供 supporters 組裝使用
function buildParticipantsById(activity) {
  return Object.fromEntries(
    activity.participants.map((p) => [
      p.user_id,
      { display_name: p.user.display_name, avatar_url: p.user.avatar_url },
    ]),
  );
}

// 情境二真正送出可用時間的人數（依 user_id 去重）——一個人可以用「+新增時段」送出多筆不連續
// range，筆數不等於人數，必須去重才能當「是否全員一致」的分母
function getJoinedSubmitterCount(activity) {
  const joinedUserIds = new Set(activity.participants.map((p) => p.user_id));
  return new Set(
    excludeCreator(
      (activity.availabilityRanges ?? []).filter((r) =>
        joinedUserIds.has(r.user_id),
      ),
      activity.creator_id,
    ).map((r) => r.user_id),
  ).size;
}

// 情境三／四「是否全員一致」的分母——排除建立者。建立者對自己建立的候選時段有空是結構性保證的
// 事實，不是主動投票訊號，不該算進「這個時段有沒有得到所有人同意」的分母
function getVotingParticipantCount(activity) {
  return activity.participants.filter((p) => p.user_id !== activity.creator_id)
    .length;
}

function isUniformMultiDateSlotVoting(candidateSlots) {
  if (candidateSlots.length < 2) return false;

  const dates = new Set(
    candidateSlots.map((slot) => formatISODate(slot.slot_start)),
  );
  if (dates.size < 2) return false;

  const [first] = candidateSlots;
  const shape = getSlotTimeShape(first);
  return candidateSlots.every((slot) => getSlotTimeShape(slot) === shape);
}

function getSlotTimeShape(slot) {
  const duration = slot.slot_end.getTime() - slot.slot_start.getTime();
  return [
    slot.all_day ? "all_day" : "timed",
    slot.slot_start.getHours(),
    slot.slot_start.getMinutes(),
    slot.slot_end.getHours(),
    slot.slot_end.getMinutes(),
    duration,
  ].join(":");
}

function sameSupporterSet(a, b) {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

// 把切格計數結果合併成單一排序陣列前的中間步驟：相鄰（前一筆 slot_end === 這一筆 slot_start）、
// count 相同、且支持者集合完全相同才合併——只看 count 相同並不夠：Alice 9-10、Bob 10-11 這種
// 交接情境兩格都是 1 票，但分別是不同的人，誤合併會把兩個不同的人顯示成同一筆的支持者
function mergeAdjacentSameCount(countedSegments) {
  const merged = [];
  for (const seg of countedSegments) {
    if (seg.count === 0) continue;
    const last = merged[merged.length - 1];
    if (
      last &&
      last.count === seg.count &&
      last.slot_end.getTime() === seg.slot_start.getTime() &&
      sameSupporterSet(last.supporterIds, seg.supporterIds)
    ) {
      last.slot_end = seg.slot_end;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

// 情境二重疊排序：以 60 分鐘為間隔切候選格，計算每格有多少真人參與者（不含建立者，由呼叫端組
// 好的 ranges 決定）回報的可用時間涵蓋該格，合併相鄰同票數同支持者的格子，回傳依 count 由高到低
// 排序的單一陣列，每筆附上 is_unanimous 與 supporters
export function computeRangeRanking(
  ranges,
  windowStart,
  windowEnd,
  totalParticipants,
  participantsById = {},
) {
  const segments = [];
  let segStart = new Date(windowStart);
  while (segStart < windowEnd) {
    const segEnd = new Date(
      Math.min(segStart.getTime() + 60 * 60 * 1000, windowEnd.getTime()),
    );
    segments.push({ slot_start: segStart, slot_end: segEnd });
    segStart = segEnd;
  }

  const counted = segments.map((seg) => {
    const covering = ranges.filter(
      (r) => r.start < seg.slot_end && r.end > seg.slot_start,
    );
    const supporterIds = new Set(covering.map((r) => r.user_id));
    // count 是「支持人數」，必須是去重後的人頭數，不是原始 range 筆數——同一個人用「+新增時段」
    // 送出兩筆彼此重疊、都涵蓋同一格的 range 時，不能把她算成兩個支持者
    return {
      ...seg,
      count: supporterIds.size,
      supporterIds,
    };
  });

  return mergeAdjacentSameCount(counted)
    .map((s) => ({
      id: `temp-${s.slot_start.toISOString()}`,
      slot_start: s.slot_start,
      slot_end: s.slot_end,
      count: s.count,
      is_unanimous: s.count === totalParticipants,
      supporters: [...s.supporterIds].map((userId) => ({
        user_id: userId,
        display_name: participantsById[userId]?.display_name ?? null,
        avatar_url: participantsById[userId]?.avatar_url ?? null,
      })),
    }))
    .sort((a, b) => b.count - a.count || a.slot_start - b.slot_start);
}

// 情境四子區間交集運算：重用 computeRangeRanking 的切格計數＋合併邏輯，範圍限定在這個候選時段自己的
// slot_start~slot_end；沒有提交子區間的參與者視為整個候選時段時間都覆蓋，總人數以投給這個
// candidate slot 的人數為準（不是整個活動的報名人數），因為交集運算只在乎「選了這個候選時段的人」彼此之間的重疊
export function computeSlotOverlapRanking(slot, participantsById = {}) {
  const ranges = slot.availabilities.map((a) => ({
    start: a.range_start && a.range_end ? a.range_start : slot.slot_start,
    end: a.range_start && a.range_end ? a.range_end : slot.slot_end,
    user_id: a.user_id,
  }));
  return computeRangeRanking(
    ranges,
    slot.slot_start,
    slot.slot_end,
    slot.availabilities.length,
    participantsById,
  );
}

// 給非建立者看的「同時段的人」：從已經算好的 segments（supporters 已排除建立者）裡，篩出跟
// myStart~myEnd 有時間實際重疊的 segment，把這些 segment 的 supporters 聯集起來、扣掉自己
// （myUserId）。只看時間是否重疊，不看候選時段/切格邊界是否相同——這是跟後端既有切格計數邏輯
// 共用同一份 segments，但用不同的篩選條件產生給參與者看的窄範圍資料
export function collectOverlappingCoParticipants(
  segments,
  myStart,
  myEnd,
  myUserId,
) {
  const seen = new Map();
  for (const seg of segments) {
    if (seg.slot_start >= myEnd || seg.slot_end <= myStart) continue;
    for (const supporter of seg.supporters) {
      if (supporter.user_id === myUserId) continue;
      seen.set(supporter.user_id, supporter);
    }
  }
  return [...seen.values()];
}

function formatCard(act, userId) {
  const sched = act.schedule;
  const confirmedSlot = sched?.confirmedSlot ?? null;
  const displaySlot =
    confirmedSlot ?? (!sched?.requires_voting ? act.candidateSlots[0] : null);

  let date = "";
  // date_iso 只在活動已成團（有 confirmedSlot）時才給值，前端行事曆只依此欄位渲染，
  // 避免情境一（免投票）在 recruiting 階段就被 candidateSlots[0] 誤判成已成團而提前上行事曆
  let dateIso = confirmedSlot ? formatISODate(confirmedSlot.slot_start) : null;
  let time = "";
  if (displaySlot) {
    date = formatShortDate(displaySlot.slot_start);
    time = displaySlot.all_day
      ? "整天"
      : `${formatHHMM(displaySlot.slot_start)} - ${formatHHMM(displaySlot.slot_end)}`;
  } else if (sched?.requires_voting) {
    time = "投票中";
  }

  return {
    id: act.id,
    title: act.title,
    location: act.location || "",
    status: act.status,
    is_creator: act.creator_id === userId,
    has_joined: act.participants.some((p) => p.user_id === userId),
    creator: act.creator,
    date,
    date_iso: dateIso,
    // 供前端在同一天有多筆已成團活動時，依實際開始時間排序用；未成團一律為 null
    confirmed_start: confirmedSlot ? confirmedSlot.slot_start : null,
    time,
    participants: act.participants.slice(0, 5).map((p) => ({
      id: p.user_id,
      avatar_url: p.user.avatar_url,
    })),
    current_count: act.participants.length,
    participant_target: act.participant_target,
  };
}

function formatShortDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 情境二：fixed_date/time_window_start/time_window_end 要回傳伺服器本地時區的 'HH:mm'，
// 不能直接讓 Date 序列化成 UTC ISO 字串，否則 UTC+8 時區下日期會位移少一天
function formatHHMM(date) {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
}

// 過渡期同時接受新格式（HH:MM，24 小時制零填充，格式對齊 formatHHMM 的輸出）跟舊格式
// （上午/下午 H:MM）——部署順序是後端先支援雙格式、前端再切換成只送新格式，等前端穩定
// 上線後才移除舊格式分支
function parseDateTime(dateStr, timeStr) {
  const date = parseDate(dateStr);
  const newFormatMatch = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (newFormatMatch) {
    date.setHours(Number(newFormatMatch[1]), Number(newFormatMatch[2]), 0, 0);
    return date;
  }
  const oldFormatMatch = timeStr.match(/^(上午|下午)\s+(\d+):(\d+)$/);
  if (!oldFormatMatch) return date;
  let hour = Number(oldFormatMatch[2]);
  if (oldFormatMatch[1] === "下午" && hour !== 12) hour += 12;
  if (oldFormatMatch[1] === "上午" && hour === 12) hour = 0;
  date.setHours(hour, Number(oldFormatMatch[3]), 0, 0);
  return date;
}

// 情境 a：把表單的日期/時間欄位組成單一候選時段（slot_start ~ slot_end）
function buildFixedSlot(startDate, startTime, endDate, endTime, allDay) {
  if (allDay) {
    const slotStart = parseDate(startDate);
    const slotEnd = parseDate(endDate ?? startDate);
    slotEnd.setHours(23, 59, 59, 999);
    return { slotStart, slotEnd };
  }

  const slotStart = startTime
    ? parseDateTime(startDate, startTime)
    : parseDate(startDate);
  const slotEnd = endTime
    ? parseDateTime(endDate ?? startDate, endTime)
    : new Date(slotStart.getTime() + 60 * 60 * 1000);

  return { slotStart, slotEnd };
}

// 情境 c：複選的候選日期，套用同一組「統一時間」，各自展開成一筆獨立的候選時段
function buildCandidateDateSlots(candidateDates, uniformTime) {
  return candidateDates.map((date) => ({
    slot_start: parseDateTime(date, uniformTime.startTime),
    slot_end: parseDateTime(date, uniformTime.endTime),
    all_day: false,
  }));
}

// 情境 c：整日模式，每個候選日期展開成當天 00:00 ~ 23:59:59 的候選時段
function buildCandidateDateAllDaySlots(candidateDates) {
  return candidateDates.map((date) => {
    const slotStart = parseDate(date);
    const slotEnd = parseDate(date);
    slotEnd.setHours(23, 59, 59, 999);
    return { slot_start: slotStart, slot_end: slotEnd, all_day: true };
  });
}

// 情境 d：每個候選日期各自帶自己的時段（date + startTime + endTime），逐筆轉成候選時段
function buildDateSlots(dateSlots) {
  return dateSlots.map(({ date, startTime, endTime }) => ({
    slot_start: parseDateTime(date, startTime),
    slot_end: parseDateTime(date, endTime),
    all_day: false,
  }));
}
