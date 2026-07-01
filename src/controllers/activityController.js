import prisma from '../lib/prisma.js'

export async function createActivity(req, res) {
  const {
    title, location, limit, note,
    startDate, startTime, endDate, endTime, allDay,
    deadline,
    scheduleType, timeWindowStart, timeWindowEnd, slotDurationMin,
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

  const isRange = scheduleType === 'range'
  const confirmedStart = (!isRange && !allDay && startTime) ? parseDateTime(startDate, startTime) : null
  const confirmedEnd   = (!isRange && !allDay && endTime)   ? parseDateTime(endDate, endTime)     : null
  const windowStart = parseDate(startDate)
  const windowEnd   = parseDate(endDate ?? startDate)
  const deadlineAt  = new Date(deadline)

  const activity = await prisma.activity.create({
    data: {
      creator_id: creatorId,
      title,
      description: note ?? null,
      location: location ?? null,
      max_participants: limit ?? null,
      status: 'recruiting',
      schedule: {
        create: {
          schedule_type: isRange ? 'range' : 'slot',
          window_start: windowStart,
          window_end: windowEnd,
          confirmed_start: confirmedStart,
          confirmed_end: confirmedEnd,
          deadline_at: deadlineAt,
          vote_deadline_at: isRange ? windowStart : null,
          time_window_start: timeWindowStart ? new Date(timeWindowStart) : null,
          time_window_end: timeWindowEnd ? new Date(timeWindowEnd) : null,
          slot_duration_min: slotDurationMin ?? 60,
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
      schedule: true,
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
      schedule: true,
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

  if (
    currentStatus === 'recruiting' &&
    sched?.schedule_type === 'range' &&
    now >= sched.deadline_at
  ) {
    const joinedCount = activity.participants.length
    const minRequired = activity.max_participants ?? 1
    if (joinedCount < minRequired) {
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
      await prisma.$transaction([
        prisma.activity.update({ where: { id }, data: { status: 'voting' } }),
        prisma.notification.create({
          data: { user_id: activity.creator_id, type: 'time_to_pick', reference_id: id, reference_type: 'activity' },
        }),
      ])
      currentStatus = 'voting'
    }
  }

  if (
    currentStatus === 'voting' &&
    sched?.vote_deadline_at &&
    now >= sched.vote_deadline_at &&
    !sched.confirmed_start
  ) {
    await prisma.$transaction([
      prisma.activity.update({ where: { id }, data: { status: 'cancelled' } }),
      ...activity.participants.map((p) =>
        prisma.notification.create({
          data: { user_id: p.user_id, type: 'activity_cancelled', reference_id: id, reference_type: 'activity' },
        })
      ),
    ])
    currentStatus = 'cancelled'
  }

  const isCreator = activity.creator_id === userId
  const hasJoined = activity.participants.some((p) => p.user_id === userId)

  return res.json({
    activity: {
      id: activity.id,
      title: activity.title,
      location: activity.location,
      description: activity.description,
      status: currentStatus,
      max_participants: activity.max_participants,
      is_creator: isCreator,
      has_joined: hasJoined,
      creator: activity.creator,
      schedule: activity.schedule,
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
  const { availability } = req.body

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

  const currentCount = activity.participants.length
  if (activity.max_participants && currentCount >= activity.max_participants) {
    return res.status(400).json({ message: '活動人數已滿' })
  }

  const isRange = activity.schedule?.schedule_type === 'range'
  if (isRange && (!availability || availability.length === 0)) {
    return res.status(400).json({ message: '此活動需要填寫可用時段才能報名' })
  }

  const existing = await prisma.activityParticipant.findUnique({
    where: { activity_id_user_id: { activity_id: id, user_id: userId } },
  })
  if (existing?.status === 'joined') return res.status(400).json({ message: '你已報名此活動' })

  // 將 availability 轉為 ActivityAvailability 記錄
  const availabilityRecords = isRange
    ? availability.flatMap(({ date, timeRanges }) =>
        timeRanges.map(({ from, to }) => ({
          activity_id: id,
          user_id: userId,
          slot_start: parseDateTimeStr(date, from),
          slot_end: parseDateTimeStr(date, to),
        }))
      )
    : []

  const newCount = currentCount + 1
  const notifyCreator = activity.max_participants && newCount >= activity.max_participants

  await prisma.$transaction([
    existing
      ? prisma.activityParticipant.update({
          where: { id: existing.id },
          data: { status: 'joined', joined_at: new Date() },
        })
      : prisma.activityParticipant.create({
          data: { activity_id: id, user_id: userId },
        }),
    ...availabilityRecords.map((r) =>
      prisma.activityAvailability.upsert({
        where: { activity_id_user_id_slot_start: { activity_id: r.activity_id, user_id: r.user_id, slot_start: r.slot_start } },
        create: r,
        update: { slot_end: r.slot_end },
      })
    ),
    ...(notifyCreator
      ? [prisma.notification.create({
          data: { user_id: activity.creator_id, type: 'formation_ready', reference_id: id, reference_type: 'activity' },
        })]
      : []),
  ])

  return res.json({ message: '報名成功' })
}

export async function getRankedSlots(req, res) {
  const { id } = req.params
  const userId = req.user.userId

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: {
      schedule: true,
      participants: { where: { status: 'joined' } },
      availabilities: true,
    },
  })

  if (!activity) return res.status(404).json({ message: '活動不存在' })
  if (activity.creator_id !== userId) return res.status(403).json({ message: '只有創建者可以查看配對結果' })
  if (activity.status !== 'voting') return res.status(400).json({ message: '活動尚未進入選時間階段' })

  const sched = activity.schedule
  const totalParticipants = activity.participants.length
  const submittedUserIds = new Set(activity.availabilities.map((a) => a.user_id))
  const submittedCount = submittedUserIds.size

  // 生成候選時段
  const candidates = generateCandidateSlots(sched)

  // 計算每個候選時段的 overlap 人數
  const participantIds = activity.participants.map((p) => p.user_id)
  const scored = candidates.map((cand) => {
    const availableUsers = participantIds.filter((pid) =>
      activity.availabilities.some(
        (a) =>
          a.user_id === pid &&
          a.slot_start <= cand.slot_end &&
          a.slot_end >= cand.slot_start
      )
    )
    return { ...cand, count: availableUsers.length, userIds: availableUsers }
  })

  // 排序：人數多 → 時間早
  scored.sort((a, b) => b.count - a.count || a.slot_start - b.slot_start)

  // 撈頭像資料
  const users = await prisma.user.findMany({
    where: { id: { in: participantIds } },
    select: { id: true, display_name: true, avatar_url: true },
  })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const toSlotResult = (s) => ({
    slot_start: s.slot_start.toISOString(),
    slot_end: s.slot_end.toISOString(),
    count: s.count,
    users: s.userIds.map((uid) => userMap[uid]).filter(Boolean),
  })

  const perfectOverlap = scored.filter((s) => s.count === totalParticipants).map(toSlotResult)
  const partialOverlap = scored.filter((s) => s.count > 0 && s.count < totalParticipants).slice(0, 3).map(toSlotResult)

  return res.json({ total_participants: totalParticipants, submitted_count: submittedCount, perfect_overlap: perfectOverlap, partial_overlap: partialOverlap })
}

// ── 候選時段生成 ────────────────────────────────────────────
function generateCandidateSlots(sched) {
  const candidates = []
  const slotMs = (sched.slot_duration_min ?? 60) * 60 * 1000

  // Mode C：候選單位是「日期 × 固定時段」
  if (sched.confirmed_start === null && sched.time_window_start && sched.time_window_end) {
    const twStart = sched.time_window_start
    const twEnd = sched.time_window_end
    const cur = new Date(sched.window_start)
    const end = new Date(sched.window_end)
    while (cur <= end) {
      const slot_start = new Date(cur)
      slot_start.setHours(twStart.getHours(), twStart.getMinutes(), 0, 0)
      const slot_end = new Date(cur)
      slot_end.setHours(twEnd.getHours(), twEnd.getMinutes(), 0, 0)
      candidates.push({ slot_start, slot_end })
      cur.setDate(cur.getDate() + 1)
    }
    return candidates
  }

  // Mode B / D：按 slot_duration_min 切片
  const cur = new Date(sched.window_start)
  const endDate = new Date(sched.window_end)
  while (cur <= endDate) {
    const dayStart = new Date(cur)
    dayStart.setHours(
      sched.time_window_start ? sched.time_window_start.getHours() : 0,
      sched.time_window_start ? sched.time_window_start.getMinutes() : 0,
      0, 0
    )
    const dayEnd = new Date(cur)
    dayEnd.setHours(
      sched.time_window_end ? sched.time_window_end.getHours() : 23,
      sched.time_window_end ? sched.time_window_end.getMinutes() : 59,
      0, 0
    )
    let slotStart = new Date(dayStart)
    while (slotStart.getTime() + slotMs <= dayEnd.getTime() + 1) {
      const slotEnd = new Date(slotStart.getTime() + slotMs)
      candidates.push({ slot_start: new Date(slotStart), slot_end: slotEnd })
      slotStart = slotEnd
    }
    cur.setDate(cur.getDate() + 1)
  }
  return candidates
}

export async function confirmFormation(req, res) {
  const { id } = req.params
  const userId = req.user.userId
  const { confirmedStart, confirmedEnd } = req.body

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: {
      schedule: true,
      participants: { where: { status: 'joined' } },
    },
  })

  if (!activity) return res.status(404).json({ message: '活動不存在' })
  if (activity.creator_id !== userId) return res.status(403).json({ message: '只有創建者可以確認成團' })

  const isRange = activity.schedule?.schedule_type === 'range'

  if (isRange) {
    if (activity.status !== 'voting') return res.status(400).json({ message: '此活動狀態不允許確認時間' })
    if (!confirmedStart || !confirmedEnd) return res.status(400).json({ message: '請提供確認的開始與結束時間' })
  } else {
    if (activity.status !== 'recruiting') return res.status(400).json({ message: '此活動狀態不允許確認成團' })
  }

  const notifyTargets = activity.participants.filter((p) => p.user_id !== userId)

  await prisma.$transaction([
    prisma.activity.update({ where: { id }, data: { status: 'confirmed' } }),
    ...(isRange
      ? [prisma.activitySchedule.update({
          where: { activity_id: id },
          data: { confirmed_start: new Date(confirmedStart), confirmed_end: new Date(confirmedEnd) },
        })]
      : []),
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
  let date = ''
  let time = ''

  if (sched) {
    if (!sched.confirmed_start) {
      date = formatShortDate(sched.window_start)
      time = '整天'
    } else if (sched.confirmed_start) {
      date = formatShortDate(sched.confirmed_start)
      const end = sched.confirmed_end ? ` - ${formatTime(sched.confirmed_end)}` : ''
      time = `${formatTime(sched.confirmed_start)}${end}`
    }
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
    max_participants: act.max_participants,
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

// 給 joinActivity 用：date = 'YYYY-MM-DD'，timeStr = '上午 10:00' 格式
function parseDateTimeStr(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const match = timeStr?.match(/^(上午|下午)\s+(\d+):(\d+)$/)
  if (!match) return date
  let hour = Number(match[2])
  if (match[1] === '下午' && hour !== 12) hour += 12
  if (match[1] === '上午' && hour === 12) hour = 0
  date.setHours(hour, Number(match[3]), 0, 0)
  return date
}
