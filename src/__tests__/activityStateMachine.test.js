import { jest } from '@jest/globals'

jest.unstable_mockModule('../lib/prisma.js', () => {
  const prisma = {
    activity: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    activitySchedule: { update: jest.fn() },
    activityParticipant: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    activityAvailability: { createMany: jest.fn(), deleteMany: jest.fn() },
    activityTiebreakVote: { upsert: jest.fn() },
    notification: { create: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
  }

  return { default: prisma }
})

const {
  getActivity,
  joinActivity,
  confirmFormation,
  startTiebreak,
  submitTiebreakVote,
  cancelActivity,
  cancelJoin,
} = await import('../controllers/activityController.js')
const { default: prisma } = await import('../lib/prisma.js')

const CREATOR_ID = 'creator-1'
const PARTICIPANT_ID = 'participant-1'
const ACTIVITY_ID = 'activity-1'

function makeReq({ params = { id: ACTIVITY_ID }, body = {}, userId = CREATOR_ID } = {}) {
  return { params, body, user: { userId } }
}

function makeRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) }
  return res
}

function makeSlot(id, overrides = {}) {
  return {
    id,
    slot_start: new Date('2026-08-01T10:00:00Z'),
    slot_end: new Date('2026-08-01T12:00:00Z'),
    all_day: false,
    availabilities: [],
    tiebreakVotes: [],
    ...overrides,
  }
}

function makeParticipant(userId, overrides = {}) {
  return {
    user_id: userId,
    status: 'joined',
    user: { id: userId, display_name: userId, avatar_url: null },
    ...overrides,
  }
}

function makeActivity(overrides = {}) {
  return {
    id: ACTIVITY_ID,
    creator_id: CREATOR_ID,
    creator: { id: CREATOR_ID, display_name: 'creator', avatar_url: null },
    status: 'recruiting',
    title: '揪團活動',
    description: null,
    location: null,
    category: null,
    participant_target: null,
    candidateSlots: [makeSlot('slot-1')],
    participants: [makeParticipant(CREATOR_ID)],
    schedule: {
      requires_voting: false,
      deadline_at: new Date('2099-01-01T00:00:00Z'),
      confirmedSlot: null,
    },
    ...overrides,
  }
}

describe('getActivity - recruiting 到期後的合法自動轉移', () => {
  it('未達標人數且已過期 -> cancelled', async () => {
    const activity = makeActivity({
      participant_target: 3,
      participants: [makeParticipant(CREATOR_ID)],
      schedule: { requires_voting: false, deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'recruiting' },
      data: { status: 'cancelled' },
    })
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [{ user_id: CREATOR_ID, type: 'activity_cancelled', reference_id: ACTIVITY_ID, reference_type: 'activity' }],
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ activity: expect.objectContaining({ status: 'cancelled' }) }),
    )
  })

  it('併發請求已搶先把狀態轉為 cancelled 時，不重複建立通知，改讀取最新狀態', async () => {
    const activity = makeActivity({
      participant_target: 3,
      participants: [makeParticipant(CREATOR_ID)],
      schedule: { requires_voting: false, deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique
      .mockResolvedValueOnce(activity)
      .mockResolvedValueOnce({ status: 'cancelled', schedule: { confirmedSlot: null } })
    prisma.activity.updateMany.mockResolvedValueOnce({ count: 0 })
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.notification.createMany).not.toHaveBeenCalled()
    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ activity: expect.objectContaining({ status: 'cancelled' }) }),
    )
  })

  it('免投票活動已過期 -> 直接 confirmed 並帶入唯一候選時段', async () => {
    const slot = makeSlot('slot-1')
    const activity = makeActivity({
      candidateSlots: [slot],
      schedule: { requires_voting: false, deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'recruiting' },
      data: { status: 'confirmed' },
    })
    expect(prisma.activitySchedule.update).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID },
      data: { confirmed_slot_id: 'slot-1' },
    })
  })

  it('投票制活動已過期且全員一致 -> 跳過 voting 直接 confirmed', async () => {
    const slotA = makeSlot('slot-a', {
      availabilities: [{ candidate_slot_id: 'slot-a' }, { candidate_slot_id: 'slot-a' }],
    })
    const slotB = makeSlot('slot-b')
    const activity = makeActivity({
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      candidateSlots: [slotA, slotB],
      schedule: { requires_voting: true, deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'recruiting' },
      data: { status: 'confirmed' },
    })
    expect(prisma.activitySchedule.update).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID },
      data: { confirmed_slot_id: 'slot-a' },
    })
  })

  it('投票制活動已過期但未達成共識 -> 轉為 voting 並通知創建者', async () => {
    const slotA = makeSlot('slot-a', { availabilities: [{ candidate_slot_id: 'slot-a' }] })
    const slotB = makeSlot('slot-b', { availabilities: [{ candidate_slot_id: 'slot-b' }] })
    const activity = makeActivity({
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      candidateSlots: [slotA, slotB],
      schedule: { requires_voting: true, deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'recruiting' },
      data: { status: 'voting' },
    })
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { user_id: CREATOR_ID, type: 'time_to_pick', reference_id: ACTIVITY_ID, reference_type: 'activity' },
    })
  })

  it('尚未到期時維持 recruiting，不觸發任何狀態轉移', async () => {
    const activity = makeActivity({
      schedule: { requires_voting: false, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.activity.update).not.toHaveBeenCalled()
    expect(prisma.activity.updateMany).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ activity: expect.objectContaining({ status: 'recruiting' }) }),
    )
  })
})

describe('joinActivity - 只能報名 recruiting 中的活動', () => {
  it.each(['voting', 'tiebreaking', 'confirmed', 'cancelled'])('狀態為 %s 時拒絕報名', async (status) => {
    prisma.activity.findUnique.mockResolvedValue(makeActivity({ status }))
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '此活動不在揪團中' })
  })

  it('recruiting 中的活動可以成功報名', async () => {
    prisma.activity.findUnique.mockResolvedValue(makeActivity({ status: 'recruiting' }))
    prisma.activityParticipant.findUnique.mockResolvedValue(null)
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(prisma.activityParticipant.create).toHaveBeenCalledWith({
      data: { activity_id: ACTIVITY_ID, user_id: PARTICIPANT_ID },
    })
    expect(res.json).toHaveBeenCalledWith({ message: '報名成功' })
  })
})

describe('confirmFormation - voting/tiebreaking 合法轉移到 confirmed', () => {
  it('非創建者不能確認成團 (403)', async () => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({ status: 'voting', schedule: { requires_voting: true, deadline_at: new Date(), confirmedSlot: null } }),
    )
    const res = makeRes()

    await confirmFormation(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('免投票活動只能從 recruiting 確認成團', async () => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({ status: 'cancelled', schedule: { requires_voting: false, deadline_at: new Date(), confirmedSlot: null } }),
    )
    const res = makeRes()

    await confirmFormation(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '此活動狀態不允許確認成團' })
  })

  it('免投票活動可以從 recruiting 確認成團', async () => {
    const slot = makeSlot('slot-1')
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'recruiting',
        candidateSlots: [slot],
        schedule: { requires_voting: false, deadline_at: new Date(), confirmedSlot: null },
      }),
    )
    const res = makeRes()

    await confirmFormation(makeReq(), res)

    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID },
      data: { status: 'confirmed' },
    })
    expect(prisma.activitySchedule.update).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID },
      data: { confirmed_slot_id: 'slot-1' },
    })
  })

  it.each(['recruiting', 'cancelled'])('投票制活動在 %s 狀態不能確認成團', async (status) => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({ status, schedule: { requires_voting: true, deadline_at: new Date(), confirmedSlot: null } }),
    )
    const res = makeRes()

    await confirmFormation(makeReq({ body: { candidateSlotId: 'slot-1' } }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '此活動狀態不允許確認成團' })
  })

  it.each(['voting', 'tiebreaking'])('投票制活動可以從 %s 確認成團', async (status) => {
    const slotA = makeSlot('slot-a', { availabilities: [{ candidate_slot_id: 'slot-a' }] })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status,
        candidateSlots: [slotA],
        schedule: { requires_voting: true, deadline_at: new Date(), confirmedSlot: null },
      }),
    )
    const res = makeRes()

    await confirmFormation(makeReq({ body: { candidateSlotId: 'slot-a' } }), res)

    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID },
      data: { status: 'confirmed' },
    })
    expect(prisma.activitySchedule.update).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID },
      data: { confirmed_slot_id: 'slot-a' },
    })
  })

  it('選擇不在候選名單中的時段會被拒絕', async () => {
    const slotA = makeSlot('slot-a', { availabilities: [{ candidate_slot_id: 'slot-a' }] })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'voting',
        candidateSlots: [slotA],
        schedule: { requires_voting: true, deadline_at: new Date(), confirmedSlot: null },
      }),
    )
    const res = makeRes()

    await confirmFormation(makeReq({ body: { candidateSlotId: 'slot-not-exist' } }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '此候選時段不在可確認的名單中' })
  })
})

describe('startTiebreak - 只有 voting 可以合法轉移到 tiebreaking', () => {
  it('非創建者不能發起決選投票 (403)', async () => {
    prisma.activity.findUnique.mockResolvedValue(makeActivity({ status: 'voting' }))
    const res = makeRes()

    await startTiebreak(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it.each(['recruiting', 'tiebreaking', 'confirmed', 'cancelled'])(
    '狀態為 %s 時不能發起決選投票',
    async (status) => {
      prisma.activity.findUnique.mockResolvedValue(makeActivity({ status }))
      const res = makeRes()

      await startTiebreak(makeReq(), res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: '此活動狀態不允許發起決選投票' })
    },
  )

  it('voting 狀態可以發起決選投票並通知其他參與者', async () => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'voting',
        participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      }),
    )
    const res = makeRes()

    await startTiebreak(makeReq(), res)

    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID },
      data: { status: 'tiebreaking' },
    })
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { user_id: PARTICIPANT_ID, type: 'tiebreak_started', reference_id: ACTIVITY_ID, reference_type: 'activity' },
    })
  })
})

describe('submitTiebreakVote - 只能在 tiebreaking 狀態投票', () => {
  it.each(['recruiting', 'voting', 'confirmed', 'cancelled'])('狀態為 %s 時拒絕決選投票', async (status) => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({ status, participants: [makeParticipant(PARTICIPANT_ID)] }),
    )
    const res = makeRes()

    await submitTiebreakVote(makeReq({ body: { candidateSlotId: 'slot-1' }, userId: PARTICIPANT_ID }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '此活動目前不在決選投票階段' })
  })

  it('tiebreaking 狀態下參與者可以投票', async () => {
    const slotA = makeSlot('slot-a', { availabilities: [{ candidate_slot_id: 'slot-a' }] })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'tiebreaking',
        candidateSlots: [slotA],
        participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      }),
    )
    const res = makeRes()

    await submitTiebreakVote(makeReq({ body: { candidateSlotId: 'slot-a' }, userId: PARTICIPANT_ID }), res)

    expect(prisma.activityTiebreakVote.upsert).toHaveBeenCalledWith({
      where: { activity_id_user_id: { activity_id: ACTIVITY_ID, user_id: PARTICIPANT_ID } },
      create: { activity_id: ACTIVITY_ID, candidate_slot_id: 'slot-a', user_id: PARTICIPANT_ID },
      update: { candidate_slot_id: 'slot-a' },
    })
    expect(res.json).toHaveBeenCalledWith({ message: '決選投票成功' })
  })
})

describe('cancelActivity - confirmed/cancelled 是終止狀態，不可再取消', () => {
  it('非創建者不能取消活動 (403)', async () => {
    prisma.activity.findUnique.mockResolvedValue(makeActivity({ status: 'recruiting' }))
    const res = makeRes()

    await cancelActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it.each(['cancelled', 'confirmed'])('狀態為 %s 時無法再次取消', async (status) => {
    prisma.activity.findUnique.mockResolvedValue(makeActivity({ status }))
    const res = makeRes()

    await cancelActivity(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '此活動無法取消' })
  })

  it.each(['recruiting', 'voting', 'tiebreaking'])('狀態為 %s 時創建者可以取消活動', async (status) => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({ status, participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)] }),
    )
    const res = makeRes()

    await cancelActivity(makeReq(), res)

    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID },
      data: { status: 'cancelled' },
    })
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { user_id: PARTICIPANT_ID, type: 'activity_cancelled', reference_id: ACTIVITY_ID, reference_type: 'activity' },
    })
    expect(res.json).toHaveBeenCalledWith({ message: '活動已取消' })
  })
})

describe('cancelJoin - 只能在 recruiting 狀態取消報名', () => {
  it.each(['voting', 'tiebreaking', 'confirmed', 'cancelled'])('狀態為 %s 時拒絕取消報名', async (status) => {
    prisma.activity.findUnique.mockResolvedValue(makeActivity({ status }))
    const res = makeRes()

    await cancelJoin(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '此活動狀態不允許取消報名' })
  })

  it('recruiting 狀態下已報名者可以取消報名', async () => {
    prisma.activity.findUnique.mockResolvedValue(makeActivity({ status: 'recruiting' }))
    prisma.activityParticipant.findUnique.mockResolvedValue({ id: 'participant-row-1', status: 'joined' })
    const res = makeRes()

    await cancelJoin(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(prisma.activityParticipant.update).toHaveBeenCalledWith({
      where: { id: 'participant-row-1' },
      data: { status: 'left' },
    })
    expect(res.json).toHaveBeenCalledWith({ message: '已取消報名' })
  })
})
