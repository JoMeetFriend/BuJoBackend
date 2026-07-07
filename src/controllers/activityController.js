import prisma from '../lib/prisma.js'
import { notifyFriendsActivityCreated } from '../services/notificationService.js'

// 情境 a（日期時間都固定，單一候選時段、免投票）、情境 b（日期固定、候選時段複選投票）、
// 情境 c（候選日期複選、統一時間）、情境 d（候選日期各自不同時段）皆已支援，皆含到期判定與決選投票。

export async function createActivity(req, res) {
  const {
    title, location, limit, note, type, deadline,
    startDate, startTime, endDate, endTime, allDay,
    singleDate, slots,
    candidateDates, uniformTime,
    dateSlots,
    creatorSlotIndexes,
  } = req.body
  const creatorId = req.user.userId
  const isVotingB = Array.isArray(slots) && slots.length > 0
  const isVotingC = Array.isArray(candidateDates) && candidateDates.length > 0
  const isVotingD = Array.isArray(dateSlots) && dateSlots.length > 0
  const isVoting = isVotingB || isVotingC || isVotingD

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

  if (isVoting) {
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
      let winningSlot = null
      let nextStatus

      if (target && joinedCount < target) {
        nextStatus = 'cancelled'
      } else if (!sched.requires_voting) {
        nextStatus = 'confirmed'
        winningSlot = activity.candidateSlots[0]
      } else {
        const availabilities = activity.candidateSlots.flatMap((s) => s.availabilities)
        const { leaders, isUnanimous } = getLeaderSlots(activity.candidateSlots, availabilities, joinedCount)
        if (isUnanimous) {
          nextStatus = 'confirmed'
          winningSlot = leaders[0]
        } else {
          nextStatus = 'voting'
        }
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
    }

    // 建立者決策階段：附上目前候選/決選的支持人數，方便建立者選擇
    // recruiting 狀態下（投票制、尚未到期）也要附上，讓建立者可以提前手動成團
    let decisionCandidates = null
    if (currentStatus === 'voting' || (currentStatus === 'recruiting' && sched?.requires_voting)) {
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
  } catch (error) {
    console.error('getActivity 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

export async function joinActivity(req, res) {
  const { id } = req.params
  const userId = req.user.userId
  const { candidateSlotIds } = req.body

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
          candidateSlots: true,
        },
      })

      if (!activity) return { status: 404, message: '活動不存在' }
      if (activity.status !== 'recruiting') return { status: 400, message: '此活動不在揪團中' }
      if (activity.creator_id === userId) return { status: 400, message: '不能報名自己建立的活動' }

      const requiresVoting = !!activity.schedule?.requires_voting
      let availabilityData = []
      if (requiresVoting) {
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
      if (activity.participant_target && currentCount >= activity.participant_target) {
        return { status: 400, message: '活動人數已滿' }
      }

      const existing = await tx.activityParticipant.findUnique({
        where: { activity_id_user_id: { activity_id: id, user_id: userId } },
      })
      if (existing?.status === 'joined') return { status: 400, message: '你已報名此活動' }

      const newCount = currentCount + 1
      const notifyCreator = activity.participant_target && newCount >= activity.participant_target

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

      if (requiresVoting) {
        await tx.activityAvailability.createMany({ data: availabilityData, skipDuplicates: true })
      }

      if (notifyCreator) {
        await tx.notification.create({
          data: { user_id: activity.creator_id, type: 'formation_ready', reference_id: id, reference_type: 'activity' },
        })
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
  const { candidateSlotId } = req.body

  try {
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
      if (activity.status !== 'recruiting' && activity.status !== 'voting' && activity.status !== 'tiebreaking') {
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

      await tx.activitySchedule.update({
        where: { activity_id: id },
        data: { confirmed_slot_id: winningSlot.id },
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

export async function startTiebreak(req, res) {
  const { id } = req.params
  const userId = req.user.userId

  try {
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: { participants: { where: { status: 'joined' } } },
    })

    if (!activity) return res.status(404).json({ message: '活動不存在' })
    if (activity.creator_id !== userId) return res.status(403).json({ message: '只有創建者可以發起決選投票' })
    if (activity.status !== 'voting') return res.status(400).json({ message: '此活動狀態不允許發起決選投票' })

    const notifyTargets = activity.participants.filter((p) => p.user_id !== userId)

    const won = await prisma.$transaction(async (tx) => {
      const { count } = await tx.activity.updateMany({
        where: { id, status: 'voting' },
        data: { status: 'tiebreaking' },
      })
      if (count === 0) return false

      if (notifyTargets.length > 0) {
        await tx.notification.createMany({
          data: notifyTargets.map((p) => ({
            user_id: p.user_id,
            type: 'tiebreak_started',
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

    return res.json({ message: '已發起決選投票' })
  } catch (error) {
    console.error('startTiebreak 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

export async function submitTiebreakVote(req, res) {
  const { id } = req.params
  const userId = req.user.userId
  const { candidateSlotId } = req.body

  try {
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
  } catch (error) {
    console.error('submitTiebreakVote 錯誤：', error)
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
  let dateIso = null
  let time = ''
  if (displaySlot) {
    date = formatShortDate(displaySlot.slot_start)
    dateIso = formatISODate(displaySlot.slot_start)
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
