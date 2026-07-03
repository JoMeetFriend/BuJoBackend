import prisma from '../lib/prisma.js'

// 目前只支援情境 a（日期時間都固定，單一候選時段、免投票）。
// 情境 b/c/d（候選時段複選投票、決選）之後串接時再實作。

export async function createActivity(req, res) {
  const {
    title, location, limit, note, type,
    startDate, startTime, endDate, endTime, allDay,
    deadline,
  } = req.body
  const creatorId = req.user.userId

  if (!title) {
    return res.status(400).json({ message: '活動名稱為必填' })
  }
  if (!startDate) {
    return res.status(400).json({ message: '開始日期為必填' })
  }
  if (!deadline) {
    return res.status(400).json({ message: '流團時間為必填' })
  }

  const { slotStart, slotEnd } = buildFixedSlot(startDate, startTime, endDate, endTime, allDay)
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
          requires_voting: false,
          deadline_at: deadlineAt,
        },
      },
      candidateSlots: {
        create: {
          slot_start: slotStart,
          slot_end: slotEnd,
          all_day: !!allDay,
        },
      },
      participants: {
        create: { user_id: creatorId },
      },
      chat: {
        create: { name: title },
      },
    },
  })

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
      candidateSlots: true,
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
  // 目前只處理情境 a（免投票，單一候選時段）：達標→自動成團，未達標→流團
  const now = new Date()
  const sched = activity.schedule
  let currentStatus = activity.status

  if (
    currentStatus === 'recruiting' &&
    sched &&
    !sched.requires_voting &&
    now >= sched.deadline_at
  ) {
    const joinedCount = activity.participants.length
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
    } else {
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
      deadline_at: sched?.deadline_at ?? null,
      candidate_slots: activity.candidateSlots.map((s) => ({
        id: s.id,
        slot_start: s.slot_start,
        slot_end: s.slot_end,
        all_day: s.all_day,
      })),
      confirmed_slot: sched?.confirmedSlot ?? null,
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

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: {
      participants: { where: { status: 'joined' } },
      schedule: true,
    },
  })

  if (!activity) return res.status(404).json({ message: '活動不存在' })
  if (activity.status !== 'recruiting') return res.status(400).json({ message: '此活動不在揪團中' })
  if (activity.creator_id === userId) return res.status(400).json({ message: '不能報名自己建立的活動' })

  if (activity.schedule?.requires_voting) {
    return res.status(400).json({ message: '此活動需要投票候選時段，此功能尚未支援' })
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

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: {
      schedule: true,
      candidateSlots: true,
      participants: { where: { status: 'joined' } },
    },
  })

  if (!activity) return res.status(404).json({ message: '活動不存在' })
  if (activity.creator_id !== userId) return res.status(403).json({ message: '只有創建者可以確認成團' })

  if (activity.schedule?.requires_voting) {
    return res.status(400).json({ message: '此功能尚未支援' })
  }

  if (activity.status !== 'recruiting') return res.status(400).json({ message: '此活動狀態不允許確認成團' })

  const winningSlot = activity.candidateSlots[0]
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

  await prisma.activityParticipant.update({
    where: { id: participant.id },
    data: { status: 'left' },
  })

  return res.json({ message: '已取消報名' })
}

// ── helpers ──────────────────────────────────────────────

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
