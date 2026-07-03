import prisma from '../lib/prisma.js'

// 情境 a（日期時間都固定，單一候選時段、免投票）、情境 b（日期固定、候選時段複選投票）、
// 情境 c（候選日期複選、統一時間）皆已支援，皆含到期判定與決選投票。情境 d（候選日期各自不同時段）之後再實作。

export async function createActivity(req, res) {
  const {
    title, location, limit, note, type, deadline,
    startDate, startTime, endDate, endTime, allDay,
    singleDate, slots,
    candidateDates, uniformTime,
    creatorSlotIndexes,
  } = req.body
  const creatorId = req.user.userId
  const isVotingB = Array.isArray(slots) && slots.length > 0
  const isVotingC = Array.isArray(candidateDates) && candidateDates.length > 0
  const isVoting = isVotingB || isVotingC

  if (!title) {
    return res.status(400).json({ message: '活動名稱為必填' })
  }
  if (!deadline) {
    return res.status(400).json({ message: '流團時間為必填' })
  }

  let candidateSlotsData
  if (isVotingB) {
    if (!singleDate) {
      return res.status(400).json({ message: '活動日期為必填' })
    }
    candidateSlotsData = buildVoteSlots(singleDate, slots)
  } else if (isVotingC) {
    if (!uniformTime?.startTime || !uniformTime?.endTime) {
      return res.status(400).json({ message: '請設定統一時間' })
    }
    candidateSlotsData = buildCandidateDateSlots(candidateDates, uniformTime)
  } else {
    if (!startDate) {
      return res.status(400).json({ message: '開始日期為必填' })
    }
    const { slotStart, slotEnd } = buildFixedSlot(startDate, startTime, endDate, endTime, allDay)
    candidateSlotsData = [{ slot_start: slotStart, slot_end: slotEnd, all_day: !!allDay }]
  }

  if (isVoting) {
    if (!Array.isArray(creatorSlotIndexes) || creatorSlotIndexes.length === 0) {
      return res.status(400).json({ message: '請選擇建立者自己方便的候選時段' })
    }
    if (!creatorSlotIndexes.every((i) => Number.isInteger(i) && i >= 0 && i < candidateSlotsData.length)) {
      return res.status(400).json({ message: '候選時段索引無效' })
    }
  }

  const deadlineAt = new Date(deadline)

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

  if (isVoting) {
    // 用 slot_start/slot_end 的值把剛建立的候選時段對應回原本陣列的索引（不依賴回傳順序）
    const idByTiming = new Map(
      activity.candidateSlots.map((s) => [`${s.slot_start.getTime()}_${s.slot_end.getTime()}`, s.id]),
    )
    const creatorAvailability = creatorSlotIndexes.map((i) => {
      const { slot_start, slot_end } = candidateSlotsData[i]
      return {
        candidate_slot_id: idByTiming.get(`${slot_start.getTime()}_${slot_end.getTime()}`),
        user_id: creatorId,
      }
    })
    await prisma.activityAvailability.createMany({ data: creatorAvailability, skipDuplicates: true })
  }

  return res.status(201).json({ activity: { id: activity.id } })
}

export async function listActivities(req, res) {
  const userId = req.user.userId

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
}

export async function getActivity(req, res) {
  const { id } = req.params
  const userId = req.user.userId

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, display_name: true, avatar_url: true } },
      schedule: { include: { confirmedSlot: true } },
      candidateSlots: { include: { availabilities: true, tiebreakVotes: true } },
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
  let currentStatus = activity.status
  let confirmedSlot = sched?.confirmedSlot ?? null
  const joinedCount = activity.participants.length

  if (currentStatus === 'recruiting' && sched && now >= sched.deadline_at) {
    const target = activity.participant_target
    if (target && joinedCount < target) {
      await prisma.$transaction([
        prisma.activity.update({ where: { id }, data: { status: 'cancelled' } }),
        ...activity.participants.map((p) =>
          prisma.notification.create({
            data: { user_id: p.user_id, type: 'activity_cancelled', reference_id: id, reference_type: 'activity' },
          })
        ),
      ])
      currentStatus = 'cancelled'
    } else if (!sched.requires_voting) {
      const winningSlot = activity.candidateSlots[0]
      await prisma.$transaction([
        prisma.activity.update({ where: { id }, data: { status: 'confirmed' } }),
        prisma.activitySchedule.update({ where: { activity_id: id }, data: { confirmed_slot_id: winningSlot.id } }),
        ...activity.participants.map((p) =>
          prisma.notification.create({
            data: { user_id: p.user_id, type: 'activity_confirmed', reference_id: id, reference_type: 'activity' },
          })
        ),
      ])
      currentStatus = 'confirmed'
      confirmedSlot = winningSlot
    } else {
      const availabilities = activity.candidateSlots.flatMap((s) => s.availabilities)
      const { leaders, isUnanimous } = getLeaderSlots(activity.candidateSlots, availabilities, joinedCount)
      if (isUnanimous) {
        const winningSlot = leaders[0]
        await prisma.$transaction([
          prisma.activity.update({ where: { id }, data: { status: 'confirmed' } }),
          prisma.activitySchedule.update({ where: { activity_id: id }, data: { confirmed_slot_id: winningSlot.id } }),
          ...activity.participants.map((p) =>
            prisma.notification.create({
              data: { user_id: p.user_id, type: 'activity_confirmed', reference_id: id, reference_type: 'activity' },
            })
          ),
        ])
        currentStatus = 'confirmed'
        confirmedSlot = winningSlot
      } else {
        await prisma.$transaction([
          prisma.activity.update({ where: { id }, data: { status: 'voting' } }),
          prisma.notification.create({
            data: { user_id: activity.creator_id, type: 'time_to_pick', reference_id: id, reference_type: 'activity' },
          }),
        ])
        currentStatus = 'voting'
      }
    }
  }

  // 建立者決策階段：附上目前候選/決選的支持人數，方便建立者選擇
  let decisionCandidates = null
  if (currentStatus === 'voting') {
    const availabilities = activity.candidateSlots.flatMap((s) => s.availabilities)
    const { leaders } = getLeaderSlots(activity.candidateSlots, availabilities, joinedCount)
    decisionCandidates = leaders.map((s) => ({
      id: s.id,
      slot_start: s.slot_start,
      slot_end: s.slot_end,
      count: availabilities.filter((a) => a.candidate_slot_id === s.id).length,
    }))
  } else if (currentStatus === 'tiebreaking') {
    const availabilities = activity.candidateSlots.flatMap((s) => s.availabilities)
    const { leaders } = getLeaderSlots(activity.candidateSlots, availabilities, joinedCount)
    const tiebreakVotes = activity.candidateSlots.flatMap((s) => s.tiebreakVotes)
    decisionCandidates = leaders.map((s) => ({
      id: s.id,
      slot_start: s.slot_start,
      slot_end: s.slot_end,
      count: tiebreakVotes.filter((v) => v.candidate_slot_id === s.id).length,
    }))
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
      deadline_at: sched?.deadline_at ?? null,
      candidate_slots: activity.candidateSlots.map((s) => ({
        id: s.id,
        slot_start: s.slot_start,
        slot_end: s.slot_end,
        all_day: s.all_day,
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
}

export async function joinActivity(req, res) {
  const { id } = req.params
  const userId = req.user.userId
  const { candidateSlotIds } = req.body

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: {
      participants: { where: { status: 'joined' } },
      schedule: true,
      candidateSlots: true,
    },
  })

  if (!activity) return res.status(404).json({ message: '活動不存在' })
  if (activity.status !== 'recruiting') return res.status(400).json({ message: '此活動不在揪團中' })
  if (activity.creator_id === userId) return res.status(400).json({ message: '不能報名自己建立的活動' })

  const requiresVoting = !!activity.schedule?.requires_voting
  let availabilityData = []
  if (requiresVoting) {
    const ids = Array.isArray(candidateSlotIds) ? [...new Set(candidateSlotIds)] : []
    if (ids.length === 0) {
      return res.status(400).json({ message: '請選擇至少一個候選時段' })
    }
    const validIds = new Set(activity.candidateSlots.map((s) => s.id))
    if (!ids.every((sid) => validIds.has(sid))) {
      return res.status(400).json({ message: '候選時段不存在' })
    }
    availabilityData = ids.map((candidate_slot_id) => ({ candidate_slot_id, user_id: userId }))
  }

  const currentCount = activity.participants.length
  if (activity.participant_target && currentCount >= activity.participant_target) {
    return res.status(400).json({ message: '活動人數已滿' })
  }

  const existing = await prisma.activityParticipant.findUnique({
    where: { activity_id_user_id: { activity_id: id, user_id: userId } },
  })
  if (existing?.status === 'joined') return res.status(400).json({ message: '你已報名此活動' })

  const newCount = currentCount + 1
  const notifyCreator = activity.participant_target && newCount >= activity.participant_target

  await prisma.$transaction([
    existing
      ? prisma.activityParticipant.update({
          where: { id: existing.id },
          data: { status: 'joined', joined_at: new Date() },
        })
      : prisma.activityParticipant.create({
          data: { activity_id: id, user_id: userId },
        }),
    ...(requiresVoting
      ? [prisma.activityAvailability.createMany({ data: availabilityData, skipDuplicates: true })]
      : []),
    ...(notifyCreator
      ? [prisma.notification.create({
          data: { user_id: activity.creator_id, type: 'formation_ready', reference_id: id, reference_type: 'activity' },
        })]
      : []),
  ])

  return res.json({ message: '報名成功' })
}

export async function getRankedSlots(req, res) {
  return res.status(400).json({ message: '此功能尚未支援' })
}

export async function confirmFormation(req, res) {
  const { id } = req.params
  const userId = req.user.userId
  const { candidateSlotId } = req.body

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: {
      schedule: true,
      candidateSlots: { include: { availabilities: true } },
      participants: { where: { status: 'joined' } },
    },
  })

  if (!activity) return res.status(404).json({ message: '活動不存在' })
  if (activity.creator_id !== userId) return res.status(403).json({ message: '只有創建者可以確認成團' })

  const requiresVoting = !!activity.schedule?.requires_voting
  let winningSlot

  if (!requiresVoting) {
    if (activity.status !== 'recruiting') return res.status(400).json({ message: '此活動狀態不允許確認成團' })
    winningSlot = activity.candidateSlots[0]
  } else {
    if (activity.status !== 'voting' && activity.status !== 'tiebreaking') {
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

  await prisma.$transaction([
    prisma.activity.update({ where: { id }, data: { status: 'confirmed' } }),
    prisma.activitySchedule.update({ where: { activity_id: id }, data: { confirmed_slot_id: winningSlot.id } }),
    ...notifyTargets.map((p) =>
      prisma.notification.create({
        data: {
          user_id: p.user_id,
          type: 'activity_confirmed',
          reference_id: id,
          reference_type: 'activity',
        },
      })
    ),
  ])

  return res.json({ message: '成團成功' })
}

export async function startTiebreak(req, res) {
  const { id } = req.params
  const userId = req.user.userId

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: { participants: { where: { status: 'joined' } } },
  })

  if (!activity) return res.status(404).json({ message: '活動不存在' })
  if (activity.creator_id !== userId) return res.status(403).json({ message: '只有創建者可以發起決選投票' })
  if (activity.status !== 'voting') return res.status(400).json({ message: '此活動狀態不允許發起決選投票' })

  const notifyTargets = activity.participants.filter((p) => p.user_id !== userId)

  await prisma.$transaction([
    prisma.activity.update({ where: { id }, data: { status: 'tiebreaking' } }),
    ...notifyTargets.map((p) =>
      prisma.notification.create({
        data: { user_id: p.user_id, type: 'tiebreak_started', reference_id: id, reference_type: 'activity' },
      })
    ),
  ])

  return res.json({ message: '已發起決選投票' })
}

export async function submitTiebreakVote(req, res) {
  const { id } = req.params
  const userId = req.user.userId
  const { candidateSlotId } = req.body

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: {
      candidateSlots: { include: { availabilities: true } },
      participants: { where: { status: 'joined' } },
    },
  })

  if (!activity) return res.status(404).json({ message: '活動不存在' })
  if (activity.status !== 'tiebreaking') return res.status(400).json({ message: '此活動目前不在決選投票階段' })

  const isParticipant = activity.participants.some((p) => p.user_id === userId)
  if (!isParticipant) return res.status(403).json({ message: '你不是此活動的參與者' })
  if (!candidateSlotId) return res.status(400).json({ message: '請選擇一個候選時段' })

  const joinedCount = activity.participants.length
  const availabilities = activity.candidateSlots.flatMap((s) => s.availabilities)
  const { leaders } = getLeaderSlots(activity.candidateSlots, availabilities, joinedCount)
  if (!leaders.some((s) => s.id === candidateSlotId)) {
    return res.status(400).json({ message: '此候選時段不在決選名單中' })
  }

  await prisma.activityTiebreakVote.upsert({
    where: { activity_id_user_id: { activity_id: id, user_id: userId } },
    create: { activity_id: id, candidate_slot_id: candidateSlotId, user_id: userId },
    update: { candidate_slot_id: candidateSlotId },
  })

  return res.json({ message: '決選投票成功' })
}

export async function cancelActivity(req, res) {
  const { id } = req.params
  const userId = req.user.userId

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

  await prisma.$transaction([
    prisma.activity.update({ where: { id }, data: { status: 'cancelled' } }),
    ...notifyTargets.map((p) =>
      prisma.notification.create({
        data: {
          user_id: p.user_id,
          type: 'activity_cancelled',
          reference_id: id,
          reference_type: 'activity',
        },
      })
    ),
  ])

  return res.json({ message: '活動已取消' })
}

export async function cancelJoin(req, res) {
  const { id } = req.params
  const userId = req.user.userId

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
}

// ── helpers ──────────────────────────────────────────────

// 計算候選時段中支持人數最高的一組（可能並列多筆）；votes 可以是 ActivityAvailability 或 ActivityTiebreakVote
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

function formatCard(act, userId) {
  const sched = act.schedule
  const displaySlot = sched?.confirmedSlot ?? (!sched?.requires_voting ? act.candidateSlots[0] : null)

  let date = ''
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

// 情境 b：同一個固定日期，把建立者手動輸入的多個候選時段（時段1/2/3...）各自轉成一筆
function buildVoteSlots(singleDate, slots) {
  return slots.map(({ startTime, endTime }) => ({
    slot_start: parseDateTime(singleDate, startTime),
    slot_end: parseDateTime(singleDate, endTime),
    all_day: false,
  }))
}

// 情境 c：複選的候選日期，套用同一組「統一時間」，各自展開成一筆獨立的候選時段
function buildCandidateDateSlots(candidateDates, uniformTime) {
  return candidateDates.map((date) => ({
    slot_start: parseDateTime(date, uniformTime.startTime),
    slot_end: parseDateTime(date, uniformTime.endTime),
    all_day: false,
  }))
}
