import prisma from '../lib/prisma.js'
import { notifyFriendsActivityCreated } from '../services/notificationService.js'

// 情境 a（日期時間都固定，單一候選時段、免投票）、情境 b（日期固定、候選時段複選投票）、
// 情境 c（候選日期複選、統一時間）、情境 d（候選日期各自不同時段）皆已支援，皆含到期判定。
// 候選時段平票時交由建立者裁決（voting 狀態的 confirmFormation），沒有額外的決選投票關卡。

export async function createActivity(req, res) {
  const {
    title, location, limit, note, type, deadline,
    startDate, startTime, endDate, endTime, allDay,
    singleDate, timeWindowStart, timeWindowEnd,
    candidateDates, uniformTime,
    dateSlots,
    creatorSlotIndexes,
  } = req.body
  const creatorId = req.user.userId
  const isVotingC = Array.isArray(candidateDates) && candidateDates.length > 0
  const isVotingD = Array.isArray(dateSlots) && dateSlots.length > 0
  const isVotingB = !!singleDate && !startDate && !isVotingC && !isVotingD
  const isVoting = isVotingB || isVotingC || isVotingD

  if (!title) {
    return res.status(400).json({ message: '活動名稱為必填' })
  }
  if (!deadline) {
    return res.status(400).json({ message: '流團時間為必填' })
  }
  if (new Date(deadline) <= new Date()) {
    return res.status(400).json({ message: '流團時間已經過去，請調整流團設定或活動時間' })
  }

  let candidateSlotsData
  let scheduleExtra = { availability_mode: 'slot' }
  if (isVotingB) {
    const fixedDate = parseDate(singleDate)
    const timeWindowStartAt = timeWindowStart ? parseDateTime(singleDate, timeWindowStart) : null
    const timeWindowEndAt = timeWindowEnd ? parseDateTime(singleDate, timeWindowEnd) : null
    scheduleExtra = {
      availability_mode: 'range',
      fixed_date: fixedDate,
      time_window_start: timeWindowStartAt,
      time_window_end: timeWindowEndAt,
      vote_deadline_at: timeWindowStartAt ?? fixedDate,
    }
    candidateSlotsData = []
  } else if (isVotingC) {
    if (uniformTime?.allDay) {
      candidateSlotsData = buildCandidateDateAllDaySlots(candidateDates)
    } else if (uniformTime?.startTime && uniformTime?.endTime) {
      candidateSlotsData = buildCandidateDateSlots(candidateDates, uniformTime)
    } else {
      return res.status(400).json({ message: '請設定統一時間或選擇整日' })
    }
  } else if (isVotingD) {
    if (!dateSlots.every((s) => s.date && s.startTime && s.endTime)) {
      return res.status(400).json({ message: '每個候選日期都需要設定時段' })
    }
    candidateSlotsData = buildDateSlots(dateSlots)
  } else {
    if (!startDate) {
      return res.status(400).json({ message: '開始日期為必填' })
    }
    const { slotStart, slotEnd } = buildFixedSlot(startDate, startTime, endDate, endTime, allDay)
    candidateSlotsData = [{ slot_start: slotStart, slot_end: slotEnd, all_day: !!allDay }]
  }

  if (isVotingC || isVotingD) {
    if (!Array.isArray(creatorSlotIndexes) || creatorSlotIndexes.length === 0) {
      return res.status(400).json({ message: '請選擇建立者自己方便的候選時段' })
    }
    if (!creatorSlotIndexes.every((i) => Number.isInteger(i) && i >= 0 && i < candidateSlotsData.length)) {
      return res.status(400).json({ message: '候選時段索引無效' })
    }
  }

  const deadlineAt = new Date(deadline)

  try {
    const activity = await prisma.activity.create({
      data: {
        creator_id: creatorId,
        title,
        description: note ?? null,
        location: location ?? null,
        category: type ?? null,
        participant_target: limit ?? null,
        status: 'recruiting',
        schedule: {
          create: {
            requires_voting: isVoting,
            deadline_at: deadlineAt,
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
          create: { name: title },
        },
      },
      include: { candidateSlots: true },
    })

    if (isVotingC || isVotingD) {
      // 用 slot_start/slot_end 的值把剛建立的候選時段對應回原本陣列的索引（不依賴回傳順序）；
      // 同一組時段可能重複（相同 start/end），用 queue 存 id 逐一取用，避免互相覆蓋、共用同一個 id
      const idsByTiming = new Map()
      for (const s of activity.candidateSlots) {
        const key = `${s.slot_start.getTime()}_${s.slot_end.getTime()}`
        if (!idsByTiming.has(key)) idsByTiming.set(key, [])
        idsByTiming.get(key).push(s.id)
      }
      const creatorAvailability = creatorSlotIndexes.map((i) => {
        const { slot_start, slot_end } = candidateSlotsData[i]
        const key = `${slot_start.getTime()}_${slot_end.getTime()}`
        return {
          candidate_slot_id: idsByTiming.get(key).shift(),
          user_id: creatorId,
        }
      })
      await prisma.activityAvailability.createMany({ data: creatorAvailability, skipDuplicates: true })
    }

    await notifyFriendsActivityCreated({
      creatorId,
      activityId: activity.id,
    })

    return res.status(201).json({ activity: { id: activity.id } })
  } catch (error) {
    console.error('createActivity 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

export async function listActivities(req, res) {
  const userId = req.user.userId

  try {
    // 撈好友 ID（雙向關係）
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ requester_id: userId }, { receiver_id: userId }],
      },
      select: { requester_id: true, receiver_id: true },
    })
    const friendIds = friendships.map((f) =>
      f.requester_id === userId ? f.receiver_id : f.requester_id,
    )

    const activities = await prisma.activity.findMany({
      where: {
        OR: [
          // 我已報名的活動（非已取消）
          {
            status: { not: 'cancelled' },
            participants: { some: { user_id: userId, status: 'joined' } },
          },
          // 好友建立、揪團中、我還沒加入
          ...(friendIds.length > 0
            ? [
                {
                  status: 'recruiting',
                  creator_id: { in: friendIds },
                  NOT: { participants: { some: { user_id: userId, status: 'joined' } } },
                },
              ]
            : []),
        ],
      },
      include: {
        schedule: { include: { confirmedSlot: true } },
        candidateSlots: true,
        participants: {
          where: { status: 'joined' },
          include: {
            user: { select: { id: true, avatar_url: true } },
          },
          orderBy: { joined_at: 'asc' },
        },
      },
      orderBy: { created_at: 'desc' },
    })

    return res.json({
      activities: activities.map((act) => formatCard(act, userId)),
    })
  } catch (error) {
    console.error('listActivities 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

export async function getActivity(req, res) {
  const { id } = req.params
  const userId = req.user.userId

  try {
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, display_name: true, avatar_url: true } },
        schedule: { include: { confirmedSlot: true } },
        candidateSlots: { include: { availabilities: true } },
        availabilityRanges: true,
        participants: {
          where: { status: 'joined' },
          include: {
            user: { select: { id: true, display_name: true, avatar_url: true } },
          },
          orderBy: { joined_at: 'asc' },
        },
      },
    })

    if (!activity) {
      return res.status(404).json({ message: '活動不存在' })
    }

    // Lazy 狀態轉換（不用 cron，每次 GET 時觸發）
    const now = new Date()
    const sched = activity.schedule
    const isRangeMode = sched?.availability_mode === 'range'
    let currentStatus = activity.status
    let confirmedSlot = sched?.confirmedSlot ?? null
    const joinedCount = activity.participants.length

    if (currentStatus === 'recruiting' && sched && now >= sched.deadline_at) {
      const target = activity.participant_target
      let winningSlot = null
      let nextStatus

      if (target && joinedCount < target) {
        nextStatus = 'cancelled'
      } else if (!sched.requires_voting) {
        nextStatus = 'confirmed'
        winningSlot = activity.candidateSlots[0]
      } else if (
        isRangeMode &&
        !target &&
        (activity.availabilityRanges ?? []).filter((r) => r.user_id !== activity.creator_id).length === 0
      ) {
        // 情境二專屬：沒設人數上限、到期、且除建立者外無人提交過可用時間 → 直接取消，不進入無意義的 voting
        nextStatus = 'cancelled'
      } else {
        const availabilities = activity.candidateSlots.flatMap((s) => s.availabilities)
        const outcome = decideFormationOutcome(activity.candidateSlots, availabilities, joinedCount)
        nextStatus = outcome.status
        winningSlot = outcome.winningSlot
      }

      // 用 updateMany + where status='recruiting' 當樂觀鎖：GET 可能被併發打到，
      // 只有真正把狀態從 recruiting 搶下來的那個請求才會建立通知，避免重複通知
      const won = await prisma.$transaction(async (tx) => {
        const { count } = await tx.activity.updateMany({
          where: { id, status: 'recruiting' },
          data: { status: nextStatus },
        })
        if (count === 0) return false

        if (winningSlot) {
          await tx.activitySchedule.update({
            where: { activity_id: id },
            data: { confirmed_slot_id: winningSlot.id },
          })
        }

        if (nextStatus === 'voting') {
          await tx.notification.create({
            data: { user_id: activity.creator_id, type: 'time_to_pick', reference_id: id, reference_type: 'activity' },
          })
        } else {
          await tx.notification.createMany({
            data: activity.participants.map((p) => ({
              user_id: p.user_id,
              type: nextStatus === 'cancelled' ? 'activity_cancelled' : 'activity_confirmed',
              reference_id: id,
              reference_type: 'activity',
            })),
          })
        }

        return true
      })

      if (won) {
        currentStatus = nextStatus
        confirmedSlot = winningSlot ?? confirmedSlot
      } else {
        // 沒搶到：代表另一個併發請求已經完成轉換，重新讀取最新狀態避免回傳過期資料
        const fresh = await prisma.activity.findUnique({
          where: { id },
          select: { status: true, schedule: { select: { confirmedSlot: true } } },
        })
        currentStatus = fresh.status
        confirmedSlot = fresh.schedule?.confirmedSlot ?? confirmedSlot
      }
    } else if (
      currentStatus === 'voting' &&
      isRangeMode &&
      sched.vote_deadline_at &&
      now >= sched.vote_deadline_at &&
      !confirmedSlot
    ) {
      // 情境二專屬：進入 voting 後若建立者逾期未確認任何時段，lazy check 自動轉為 cancelled
      const won = await prisma.$transaction(async (tx) => {
        const { count } = await tx.activity.updateMany({
          where: { id, status: 'voting' },
          data: { status: 'cancelled' },
        })
        if (count === 0) return false

        await tx.notification.createMany({
          data: activity.participants.map((p) => ({
            user_id: p.user_id,
            type: 'activity_cancelled',
            reference_id: id,
            reference_type: 'activity',
          })),
        })

        return true
      })

      if (won) {
        currentStatus = 'cancelled'
      } else {
        const fresh = await prisma.activity.findUnique({
          where: { id },
          select: { status: true, schedule: { select: { confirmedSlot: true } } },
        })
        currentStatus = fresh.status
        confirmedSlot = fresh.schedule?.confirmedSlot ?? confirmedSlot
      }
    }

    // 建立者決策階段：附上目前候選/決選的支持人數，方便建立者選擇
    // recruiting 狀態下（投票制、尚未到期）也要附上，讓建立者可以提前手動成團
    let decisionCandidates = null
    if (currentStatus === 'voting' || (currentStatus === 'recruiting' && sched?.requires_voting)) {
      if (isRangeMode) {
        const windowStart = sched.time_window_start ?? sched.fixed_date
        const windowEnd = sched.time_window_end ?? new Date(sched.fixed_date.getTime() + 24 * 60 * 60 * 1000)
        const submittedRanges = activity.availabilityRanges.map((r) => ({ start: r.range_start, end: r.range_end }))
        // 建立者永遠算「有空」，用一段涵蓋整個基準範圍的虛擬 range 表示，不需要真實資料列
        const allRanges = [...submittedRanges, { start: windowStart, end: windowEnd }]
        decisionCandidates = computeRangeRanking(allRanges, windowStart, windowEnd, joinedCount)
      } else {
        const availabilities = activity.candidateSlots.flatMap((s) => s.availabilities)
        const { leaders } = getLeaderSlots(activity.candidateSlots, availabilities, joinedCount)
        decisionCandidates = leaders.map((s) => ({
          id: s.id,
          slot_start: s.slot_start,
          slot_end: s.slot_end,
          count: availabilities.filter((a) => a.candidate_slot_id === s.id).length,
        }))
      }
    }

    const isCreator = activity.creator_id === userId
    const hasJoined = activity.participants.some((p) => p.user_id === userId)

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
        availability_mode: sched?.availability_mode ?? 'slot',
        deadline_at: sched?.deadline_at ?? null,
        fixed_date: sched?.fixed_date ?? null,
        time_window_start: sched?.time_window_start ?? null,
        time_window_end: sched?.time_window_end ?? null,
        candidate_slots: activity.candidateSlots.map((s) => ({
          id: s.id,
          slot_start: s.slot_start,
          slot_end: s.slot_end,
          all_day: s.all_day,
          is_selected: s.availabilities.some((a) => a.user_id === userId),
        })),
        decision_candidates: decisionCandidates,
        confirmed_slot: confirmedSlot,
        participants: activity.participants.map((p) => ({
          id: p.user_id,
          display_name: p.user.display_name,
          avatar_url: p.user.avatar_url,
        })),
        current_count: activity.participants.length,
      },
    })
  } catch (error) {
    console.error('getActivity 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

export async function joinActivity(req, res) {
  const { id } = req.params
  const userId = req.user.userId
  const { candidateSlotIds, ranges } = req.body

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // 先鎖住這筆活動的 row，讓同一活動的併發報名請求依序處理，
      // 避免兩個請求同時讀到「還有名額」而一起插入，導致人數超過 participant_target
      await tx.$queryRaw`SELECT id FROM activities WHERE id = ${id} FOR UPDATE`

      const activity = await tx.activity.findUnique({
        where: { id },
        include: {
          participants: { where: { status: 'joined' } },
          schedule: true,
          candidateSlots: { include: { availabilities: true } },
        },
      })

      if (!activity) return { status: 404, message: '活動不存在' }
      if (activity.creator_id === userId) return { status: 400, message: '不能報名自己建立的活動' }

      // 四個情境皆適用：即使還沒有人打開詳情頁觸發 lazy check 轉換狀態，過期活動一律拒絕報名
      if (activity.schedule && activity.schedule.deadline_at < new Date()) {
        return { status: 400, message: '此活動已截止報名' }
      }

      const isRangeMode = activity.schedule?.availability_mode === 'range'

      const existing = await tx.activityParticipant.findUnique({
        where: { activity_id_user_id: { activity_id: id, user_id: userId } },
      })
      // range 模式允許已報名者在 recruiting/voting 階段重新送出可用時間；其餘情境維持原行為不可重複報名
      const isResubmission = isRangeMode && existing?.status === 'joined'

      if (!isResubmission && activity.status !== 'recruiting') {
        return { status: 400, message: '此活動不在揪團中' }
      }
      if (isResubmission && activity.status !== 'recruiting' && activity.status !== 'voting') {
        return { status: 400, message: '此活動不在揪團中' }
      }

      const requiresVoting = !!activity.schedule?.requires_voting
      let availabilityData = []
      let rangesData = []
      if (isRangeMode) {
        const list = Array.isArray(ranges) ? ranges : []
        if (list.length === 0) {
          return { status: 400, message: '請提供至少一段可用時間' }
        }
        const windowStart = activity.schedule.time_window_start
        const windowEnd = activity.schedule.time_window_end
        for (const r of list) {
          const start = new Date(r.start)
          const end = new Date(r.end)
          if ((windowStart && start < windowStart) || (windowEnd && end > windowEnd)) {
            return { status: 400, message: '提交的可用時間超出建立者設定的時間範圍' }
          }
        }
        rangesData = list.map((r) => ({
          activity_id: id,
          user_id: userId,
          range_start: new Date(r.start),
          range_end: new Date(r.end),
        }))
      } else if (requiresVoting) {
        const ids = Array.isArray(candidateSlotIds) ? [...new Set(candidateSlotIds)] : []
        if (ids.length === 0) {
          return { status: 400, message: '請選擇至少一個候選時段' }
        }
        const validIds = new Set(activity.candidateSlots.map((s) => s.id))
        if (!ids.every((sid) => validIds.has(sid))) {
          return { status: 400, message: '候選時段不存在' }
        }
        availabilityData = ids.map((candidate_slot_id) => ({ candidate_slot_id, user_id: userId }))
      }

      const currentCount = activity.participants.length
      if (!isResubmission) {
        if (activity.participant_target && currentCount >= activity.participant_target) {
          return { status: 400, message: '活動人數已滿' }
        }
        if (existing?.status === 'joined') return { status: 400, message: '你已報名此活動' }
      }

      const newCount = isResubmission ? currentCount : currentCount + 1
      const targetReached = !isResubmission && !!activity.participant_target && newCount >= activity.participant_target

      if (!isResubmission) {
        if (existing) {
          await tx.activityParticipant.update({
            where: { id: existing.id },
            data: { status: 'joined', joined_at: new Date() },
          })
        } else {
          await tx.activityParticipant.create({
            data: { activity_id: id, user_id: userId },
          })
        }
      }

      if (isRangeMode) {
        await tx.activityAvailabilityRange.deleteMany({ where: { activity_id: id, user_id: userId } })
        await tx.activityAvailabilityRange.createMany({ data: rangesData })
      } else if (requiresVoting) {
        await tx.activityAvailability.createMany({ data: availabilityData, skipDuplicates: true })
      }

      // 人數一達標就立刻判定：免投票直接成團；投票制則交給目前票數決定直接成團或進入 voting 讓建立者選
      // range 模式沒有「投票達成共識」的概念，成團一律交由建立者手動 confirmFormation 決定
      if (targetReached && !isRangeMode) {
        const outcome = requiresVoting
          ? decideFormationOutcome(
              activity.candidateSlots,
              [...activity.candidateSlots.flatMap((s) => s.availabilities), ...availabilityData],
              newCount,
            )
          : { status: 'confirmed', winningSlot: activity.candidateSlots[0] }

        await tx.activity.update({ where: { id }, data: { status: outcome.status } })

        if (outcome.status === 'confirmed') {
          await tx.activitySchedule.update({
            where: { activity_id: id },
            data: { confirmed_slot_id: outcome.winningSlot.id },
          })
          await tx.notification.createMany({
            data: activity.participants.map((p) => ({
              user_id: p.user_id,
              type: 'activity_confirmed',
              reference_id: id,
              reference_type: 'activity',
            })),
          })
        } else {
          await tx.notification.create({
            data: { user_id: activity.creator_id, type: 'time_to_pick', reference_id: id, reference_type: 'activity' },
          })
        }
      }

      return null
    })

    if (outcome) {
      return res.status(outcome.status).json({ message: outcome.message })
    }
    return res.json({ message: '報名成功' })
  } catch (error) {
    console.error('joinActivity 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

export async function getRankedSlots(req, res) {
  return res.status(400).json({ message: '此功能尚未支援' })
}

export async function confirmFormation(req, res) {
  const { id } = req.params
  const userId = req.user.userId
  const { candidateSlotId, slotStart, slotEnd } = req.body

  try {
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: {
        schedule: true,
        candidateSlots: { include: { availabilities: true } },
        availabilityRanges: true,
        participants: { where: { status: 'joined' } },
      },
    })

    if (!activity) return res.status(404).json({ message: '活動不存在' })
    if (activity.creator_id !== userId) return res.status(403).json({ message: '只有創建者可以確認成團' })

    const requiresVoting = !!activity.schedule?.requires_voting
    const isRangeMode = activity.schedule?.availability_mode === 'range'
    let winningSlot
    let newCandidateSlotData = null

    if (isRangeMode) {
      if (activity.status !== 'recruiting' && activity.status !== 'voting') {
        return res.status(400).json({ message: '此活動狀態不允許確認成團' })
      }
      if (!slotStart || !slotEnd) return res.status(400).json({ message: '請選擇要確認的時段' })

      const sched = activity.schedule
      const joinedCount = activity.participants.length
      const windowStart = sched.time_window_start ?? sched.fixed_date
      const windowEnd = sched.time_window_end ?? new Date(sched.fixed_date.getTime() + 24 * 60 * 60 * 1000)
      const submittedRanges = activity.availabilityRanges.map((r) => ({ start: r.range_start, end: r.range_end }))
      const allRanges = [...submittedRanges, { start: windowStart, end: windowEnd }]
      const ranking = computeRangeRanking(allRanges, windowStart, windowEnd, joinedCount)
      const candidates = [...ranking.perfect_overlap, ...ranking.partial_overlap]

      const start = new Date(slotStart)
      const end = new Date(slotEnd)
      const matched = candidates.find(
        (c) => c.slot_start.getTime() === start.getTime() && c.slot_end.getTime() === end.getTime(),
      )
      if (!matched) return res.status(400).json({ message: '此候選時段不在可確認的名單中' })

      newCandidateSlotData = { slot_start: start, slot_end: end, all_day: false }
    } else if (!requiresVoting) {
      if (activity.status !== 'recruiting') return res.status(400).json({ message: '此活動狀態不允許確認成團' })
      winningSlot = activity.candidateSlots[0]
    } else {
      if (activity.status !== 'recruiting' && activity.status !== 'voting') {
        return res.status(400).json({ message: '此活動狀態不允許確認成團' })
      }
      if (!candidateSlotId) return res.status(400).json({ message: '請選擇要確認的候選時段' })

      const joinedCount = activity.participants.length
      const availabilities = activity.candidateSlots.flatMap((s) => s.availabilities)
      const { leaders } = getLeaderSlots(activity.candidateSlots, availabilities, joinedCount)
      winningSlot = leaders.find((s) => s.id === candidateSlotId)
      if (!winningSlot) return res.status(400).json({ message: '此候選時段不在可確認的名單中' })
    }

    const notifyTargets = activity.participants.filter((p) => p.user_id !== userId)

    // 用 updateMany + where status=讀到的狀態 當樂觀鎖，避免同一個創建者重複送出造成重複轉換/重複通知
    const won = await prisma.$transaction(async (tx) => {
      const { count } = await tx.activity.updateMany({
        where: { id, status: activity.status },
        data: { status: 'confirmed' },
      })
      if (count === 0) return false

      // range 模式在建立活動、recruiting/voting 期間都不建立 ActivityCandidateSlot，只在確認成團的當下才臨時建立這一筆
      const confirmedSlotId = isRangeMode
        ? (await tx.activityCandidateSlot.create({ data: { activity_id: id, ...newCandidateSlotData } })).id
        : winningSlot.id

      await tx.activitySchedule.update({
        where: { activity_id: id },
        data: { confirmed_slot_id: confirmedSlotId },
      })

      if (notifyTargets.length > 0) {
        await tx.notification.createMany({
          data: notifyTargets.map((p) => ({
            user_id: p.user_id,
            type: 'activity_confirmed',
            reference_id: id,
            reference_type: 'activity',
          })),
        })
      }

      return true
    })

    if (!won) {
      return res.status(409).json({ message: '此活動狀態已被異動，請重新整理後再試' })
    }

    return res.json({ message: '成團成功' })
  } catch (error) {
    console.error('confirmFormation 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

export async function cancelActivity(req, res) {
  const { id } = req.params
  const userId = req.user.userId

  try {
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: {
        participants: { where: { status: 'joined' } },
      },
    })

    if (!activity) return res.status(404).json({ message: '活動不存在' })
    if (activity.creator_id !== userId) return res.status(403).json({ message: '只有創建者可以取消活動' })
    if (activity.status === 'cancelled' || activity.status === 'confirmed') {
      return res.status(400).json({ message: '此活動無法取消' })
    }

    const notifyTargets = activity.participants.filter((p) => p.user_id !== userId)

    const won = await prisma.$transaction(async (tx) => {
      const { count } = await tx.activity.updateMany({
        where: { id, status: activity.status },
        data: { status: 'cancelled' },
      })
      if (count === 0) return false

      if (notifyTargets.length > 0) {
        await tx.notification.createMany({
          data: notifyTargets.map((p) => ({
            user_id: p.user_id,
            type: 'activity_cancelled',
            reference_id: id,
            reference_type: 'activity',
          })),
        })
      }

      return true
    })

    if (!won) {
      return res.status(409).json({ message: '此活動狀態已被異動，請重新整理後再試' })
    }

    return res.json({ message: '活動已取消' })
  } catch (error) {
    console.error('cancelActivity 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

export async function cancelJoin(req, res) {
  const { id } = req.params
  const userId = req.user.userId

  try {
    const activity = await prisma.activity.findUnique({
      where: { id },
    })

    if (!activity) return res.status(404).json({ message: '活動不存在' })
    if (activity.status !== 'recruiting') {
      return res.status(400).json({ message: '此活動狀態不允許取消報名' })
    }

    const participant = await prisma.activityParticipant.findUnique({
      where: { activity_id_user_id: { activity_id: id, user_id: userId } },
    })

    if (!participant || participant.status !== 'joined') {
      return res.status(400).json({ message: '你尚未報名此活動' })
    }

    await prisma.$transaction([
      prisma.activityParticipant.update({
        where: { id: participant.id },
        data: { status: 'left' },
      }),
      prisma.activityAvailability.deleteMany({
        where: { user_id: userId, candidateSlot: { activity_id: id } },
      }),
    ])

    return res.json({ message: '已取消報名' })
  } catch (error) {
    console.error('cancelJoin 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

// ── helpers ──────────────────────────────────────────────

// 計算候選時段中支持人數最高的一組（可能並列多筆）
function getLeaderSlots(candidateSlots, votes, totalParticipants) {
  const counts = candidateSlots.map((slot) => ({
    slot,
    count: votes.filter((v) => v.candidate_slot_id === slot.id).length,
  }))
  const maxCount = Math.max(0, ...counts.map((c) => c.count))
  const leaders = counts.filter((c) => c.count === maxCount).map((c) => c.slot)
  return {
    leaders,
    maxCount,
    isUnanimous: leaders.length === 1 && maxCount > 0 && maxCount === totalParticipants,
  }
}

// 投票制活動達到成團判定條件時（到期或人數已達 participant_target）決定要直接定案還是交給建立者/決選投票決定
function decideFormationOutcome(candidateSlots, votes, totalParticipants) {
  const { leaders, isUnanimous } = getLeaderSlots(candidateSlots, votes, totalParticipants)
  return isUnanimous ? { status: 'confirmed', winningSlot: leaders[0] } : { status: 'voting', winningSlot: null }
}

// 情境二重疊排序：以 60 分鐘為間隔切候選格，計算每格有多少人（含建立者，由呼叫端併入 ranges）回報的可用時間涵蓋該格，
// 分「完全符合」（人數＝總報名人數）／「最多人有空」（前 3，排除完全符合）兩區，同分依時間先後排序
export function computeRangeRanking(ranges, windowStart, windowEnd, totalParticipants) {
  const segments = []
  let segStart = new Date(windowStart)
  while (segStart < windowEnd) {
    const segEnd = new Date(Math.min(segStart.getTime() + 60 * 60 * 1000, windowEnd.getTime()))
    segments.push({ slot_start: segStart, slot_end: segEnd })
    segStart = segEnd
  }

  const counted = segments.map((seg) => ({
    ...seg,
    count: ranges.filter((r) => r.start < seg.slot_end && r.end > seg.slot_start).length,
  }))

  const toEntry = (s) => ({
    id: `temp-${s.slot_start.toISOString()}`,
    slot_start: s.slot_start,
    slot_end: s.slot_end,
    count: s.count,
  })

  const perfect = counted.filter((s) => s.count > 0 && s.count === totalParticipants)
  const partial = counted
    .filter((s) => s.count > 0 && s.count !== totalParticipants)
    .sort((a, b) => b.count - a.count || a.slot_start - b.slot_start)
    .slice(0, 3)

  return {
    perfect_overlap: perfect.map(toEntry),
    partial_overlap: partial.map(toEntry),
  }
}

function formatCard(act, userId) {
  const sched = act.schedule
  const confirmedSlot = sched?.confirmedSlot ?? null
  const displaySlot = confirmedSlot ?? (!sched?.requires_voting ? act.candidateSlots[0] : null)

  let date = ''
  // date_iso 只在活動已成團（有 confirmedSlot）時才給值，前端行事曆只依此欄位渲染，
  // 避免情境一（免投票）在 recruiting 階段就被 candidateSlots[0] 誤判成已成團而提前上行事曆
  let dateIso = confirmedSlot ? formatISODate(confirmedSlot.slot_start) : null
  let time = ''
  if (displaySlot) {
    date = formatShortDate(displaySlot.slot_start)
    time = displaySlot.all_day ? '整天' : `${formatTime(displaySlot.slot_start)} - ${formatTime(displaySlot.slot_end)}`
  } else if (sched?.requires_voting) {
    time = '投票中'
  }

  return {
    id: act.id,
    title: act.title,
    location: act.location || '',
    status: act.status,
    is_creator: act.creator_id === userId,
    has_joined: act.participants.some((p) => p.user_id === userId),
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
  }
}

function formatShortDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function formatISODate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTime(date) {
  const h = date.getHours()
  const m = date.getMinutes()
  const period = h < 12 ? '上午' : '下午'
  const hour = h % 12 || 12
  return `${period} ${hour}:${String(m).padStart(2, '0')}`
}

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('/').map(Number)
  return new Date(year, month - 1, day)
}

function parseDateTime(dateStr, timeStr) {
  const date = parseDate(dateStr)
  const match = timeStr.match(/^(上午|下午)\s+(\d+):(\d+)$/)
  if (!match) return date
  let hour = Number(match[2])
  if (match[1] === '下午' && hour !== 12) hour += 12
  if (match[1] === '上午' && hour === 12) hour = 0
  date.setHours(hour, Number(match[3]), 0, 0)
  return date
}

// 情境 a：把表單的日期/時間欄位組成單一候選時段（slot_start ~ slot_end）
function buildFixedSlot(startDate, startTime, endDate, endTime, allDay) {
  if (allDay) {
    const slotStart = parseDate(startDate)
    const slotEnd = parseDate(endDate ?? startDate)
    slotEnd.setHours(23, 59, 59, 999)
    return { slotStart, slotEnd }
  }

  const slotStart = startTime ? parseDateTime(startDate, startTime) : parseDate(startDate)
  const slotEnd = endTime
    ? parseDateTime(endDate ?? startDate, endTime)
    : new Date(slotStart.getTime() + 60 * 60 * 1000)

  return { slotStart, slotEnd }
}

// 情境 c：複選的候選日期，套用同一組「統一時間」，各自展開成一筆獨立的候選時段
function buildCandidateDateSlots(candidateDates, uniformTime) {
  return candidateDates.map((date) => ({
    slot_start: parseDateTime(date, uniformTime.startTime),
    slot_end: parseDateTime(date, uniformTime.endTime),
    all_day: false,
  }))
}

// 情境 c：整日模式，每個候選日期展開成當天 00:00 ~ 23:59:59 的候選時段
function buildCandidateDateAllDaySlots(candidateDates) {
  return candidateDates.map((date) => {
    const slotStart = parseDate(date)
    const slotEnd = parseDate(date)
    slotEnd.setHours(23, 59, 59, 999)
    return { slot_start: slotStart, slot_end: slotEnd, all_day: true }
  })
}

// 情境 d：每個候選日期各自帶自己的時段（date + startTime + endTime），逐筆轉成候選時段
function buildDateSlots(dateSlots) {
  return dateSlots.map(({ date, startTime, endTime }) => ({
    slot_start: parseDateTime(date, startTime),
    slot_end: parseDateTime(date, endTime),
    all_day: false,
  }))
}
