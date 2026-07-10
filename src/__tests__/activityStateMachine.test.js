import { jest } from '@jest/globals'

jest.unstable_mockModule('../lib/prisma.js', () => {
  const prisma = {
    activity: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    activitySchedule: { update: jest.fn() },
    activityParticipant: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    activityAvailability: { createMany: jest.fn(), deleteMany: jest.fn() },
    activityAvailabilityRange: { deleteMany: jest.fn() },
    friendship: { findMany: jest.fn(() => Promise.resolve([])) },
    notification: { create: jest.fn(), createMany: jest.fn() },
    $queryRaw: jest.fn(() => Promise.resolve([])),
    $transaction: jest.fn((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
  }

  return { default: prisma }
})

const {
  createActivity,
  getActivity,
  listActivities,
  joinActivity,
  confirmFormation,
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

  it('情境三：最早候選日的 deadline_at 已過，但最晚候選日的 vote_deadline_at 還沒到 -> 維持 recruiting，投票不被腰斬', async () => {
    const slotEarly = makeSlot('slot-early', {
      slot_start: new Date('2026-08-01T01:00:00Z'),
      slot_end: new Date('2026-08-01T02:00:00Z'),
    })
    const slotLate = makeSlot('slot-late', {
      slot_start: new Date('2026-08-29T01:00:00Z'),
      slot_end: new Date('2026-08-29T02:00:00Z'),
    })
    const activity = makeActivity({
      candidateSlots: [slotEarly, slotLate],
      schedule: {
        requires_voting: true,
        // deadline_at 錨定最早候選日（已經過去），vote_deadline_at 錨定最晚候選日（還沒到）
        deadline_at: new Date('2020-01-01T00:00:00Z'),
        vote_deadline_at: new Date('2099-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.activity.updateMany).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ activity: expect.objectContaining({ status: 'recruiting' }) }),
    )
  })

  it('情境三：最晚候選日的 vote_deadline_at 也過了 -> 強制用目前票數判定成團/進入 voting', async () => {
    const slotEarly = makeSlot('slot-early', {
      slot_start: new Date('2026-08-01T01:00:00Z'),
      slot_end: new Date('2026-08-01T02:00:00Z'),
      availabilities: [{ candidate_slot_id: 'slot-early' }, { candidate_slot_id: 'slot-early' }],
    })
    const slotLate = makeSlot('slot-late', {
      slot_start: new Date('2026-08-29T01:00:00Z'),
      slot_end: new Date('2026-08-29T02:00:00Z'),
    })
    const activity = makeActivity({
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      candidateSlots: [slotEarly, slotLate],
      schedule: {
        requires_voting: true,
        deadline_at: new Date('2020-01-01T00:00:00Z'),
        vote_deadline_at: new Date('2020-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
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
      data: { confirmed_slot_id: 'slot-early' },
    })
  })

  it('投票制活動尚未到期時，仍附上 decision_candidates 供建立者提前手動成團', async () => {
    const slotA = makeSlot('slot-a', { availabilities: [{ candidate_slot_id: 'slot-a' }] })
    const slotB = makeSlot('slot-b')
    const activity = makeActivity({
      candidateSlots: [slotA, slotB],
      schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.activity.updateMany).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          status: 'recruiting',
          decision_candidates: [expect.objectContaining({ id: 'slot-a', count: 1 })],
        }),
      }),
    )
  })
})

describe('createActivity - 候選時段的 id 對應（情境三／四共用的候選時段建立邏輯）', () => {
  it('相同 start/end 的候選時段各自對應到不同的 id，不會互相覆蓋', async () => {
    const start = new Date('2026-08-01T01:00:00Z')
    const end = new Date('2026-08-01T02:00:00Z')
    prisma.activity.create.mockResolvedValue({
      id: ACTIVITY_ID,
      candidateSlots: [
        { id: 'slot-x', slot_start: start, slot_end: end },
        { id: 'slot-y', slot_start: start, slot_end: end },
      ],
    })

    const req = makeReq({
      body: {
        title: '重複時段測試',
        deadline: new Date('2026-07-31T00:00:00Z').toISOString(),
        candidateDates: ['2026/08/01', '2026/08/01'],
        uniformTime: { startTime: '上午 9:00', endTime: '上午 10:00' },
        creatorSlotIndexes: [0, 1],
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(prisma.activityAvailability.createMany).toHaveBeenCalledWith({
      data: [
        { candidate_slot_id: 'slot-x', user_id: CREATOR_ID },
        { candidate_slot_id: 'slot-y', user_id: CREATOR_ID },
      ],
      skipDuplicates: true,
    })
    expect(res.status).toHaveBeenCalledWith(201)
  })
})

describe('createActivity - 情境三 vote_deadline_at 錨定在最晚候選日，不是最早', () => {
  it('候選日期不連續時，vote_deadline_at 等於最晚候選日的 slot_start', async () => {
    prisma.activity.create.mockResolvedValue({
      id: ACTIVITY_ID,
      candidateSlots: [
        { id: 'slot-1', slot_start: new Date('2026-08-01T01:00:00Z'), slot_end: new Date('2026-08-01T02:00:00Z') },
        { id: 'slot-2', slot_start: new Date('2026-08-20T01:00:00Z'), slot_end: new Date('2026-08-20T02:00:00Z') },
        { id: 'slot-3', slot_start: new Date('2026-08-29T01:00:00Z'), slot_end: new Date('2026-08-29T02:00:00Z') },
      ],
    })

    const req = makeReq({
      body: {
        title: '不連續候選日測試',
        deadline: new Date('2026-07-31T00:00:00Z').toISOString(),
        // 刻意打亂順序，確認不是「取陣列最後一筆」而是真的比較時間
        candidateDates: ['2026/08/20', '2026/08/01', '2026/08/29'],
        uniformTime: { startTime: '上午 9:00', endTime: '上午 10:00' },
        creatorSlotIndexes: [0],
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schedule: expect.objectContaining({
            create: expect.objectContaining({
              vote_deadline_at: new Date('2026-08-29T01:00:00Z'),
            }),
          }),
        }),
      }),
    )
  })
})

describe('createActivity - deadline 必須在未來', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('情境一（全固定）：deadline 已經過去時回 400，且不建立任何紀錄', async () => {
    const req = makeReq({
      body: {
        title: '過期流團活動',
        deadline: new Date('2026-07-01T00:00:00Z').toISOString(),
        startDate: '2026/08/01',
        startTime: '上午 10:00',
        endDate: '2026/08/01',
        endTime: '上午 12:00',
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activity.create).not.toHaveBeenCalled()
  })

  it('deadline 等於目前伺服器時間時回 400', async () => {
    const now = new Date('2026-08-01T00:00:00Z')
    jest.useFakeTimers({ now })

    const req = makeReq({
      body: {
        title: '邊界流團活動',
        deadline: now.toISOString(),
        startDate: '2026/08/02',
        startTime: '上午 10:00',
        endDate: '2026/08/02',
        endTime: '上午 12:00',
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activity.create).not.toHaveBeenCalled()
  })

  it('合法的未來 deadline 仍可正常建立活動（回歸測試，鎖住現況行為）', async () => {
    prisma.activity.create.mockResolvedValue(makeActivity())

    const req = makeReq({
      body: {
        title: '正常流團活動',
        deadline: new Date('2099-01-01T00:00:00Z').toISOString(),
        startDate: '2099/01/02',
        startTime: '上午 10:00',
        endDate: '2099/01/02',
        endTime: '上午 12:00',
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(prisma.activity.create).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })

  const expiredDeadline = new Date('2026-07-01T00:00:00Z').toISOString()

  it.each([
    [
      '情境二（日期固定・時間投票）',
      {
        title: '過期流團活動-情境二',
        deadline: expiredDeadline,
        singleDate: '2026/08/01',
        timeWindowStart: '上午 09:00',
        timeWindowEnd: '下午 06:00',
      },
    ],
    [
      '情境三（候選日期複選・統一時間）',
      {
        title: '過期流團活動-情境三',
        deadline: expiredDeadline,
        candidateDates: ['2026/08/01', '2026/08/02'],
        uniformTime: { startTime: '上午 09:00', endTime: '上午 10:00' },
        creatorSlotIndexes: [0],
      },
    ],
    [
      '情境四（候選日期各自時段）',
      {
        title: '過期流團活動-情境四',
        deadline: expiredDeadline,
        dateSlots: [
          { date: '2026/08/01', startTime: '上午 09:00', endTime: '上午 10:00' },
          { date: '2026/08/02', startTime: '上午 09:00', endTime: '上午 10:00' },
        ],
        creatorSlotIndexes: [0],
      },
    ],
  ])('%s：deadline 已經過去時回 400，且不建立任何紀錄', async (_label, body) => {
    const req = makeReq({ body })
    const res = makeRes()

    await createActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activity.create).not.toHaveBeenCalled()
  })
})

describe('joinActivity - 只能報名 recruiting 中的活動', () => {
  it.each(['voting', 'confirmed', 'cancelled'])('狀態為 %s 時拒絕報名', async (status) => {
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

  it('已達 participant_target 上限時拒絕報名，且有先鎖住 activity row 避免併發超收', async () => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'recruiting',
        participant_target: 1,
        participants: [makeParticipant(CREATOR_ID)],
      }),
    )
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(prisma.$queryRaw).toHaveBeenCalled()
    expect(prisma.activityParticipant.create).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '活動人數已滿' })
  })
})

describe('joinActivity - 報名後人數達標，立即判定成團（不用等到期）', () => {
  it('情境一（免投票）達標時直接成團並通知其他參與者', async () => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'recruiting',
        participant_target: 2,
        participants: [makeParticipant(CREATOR_ID)],
        candidateSlots: [makeSlot('slot-1')],
        schedule: { requires_voting: false, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
      }),
    )
    prisma.activityParticipant.findUnique.mockResolvedValue(null)
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(prisma.activity.update).toHaveBeenCalledWith({ where: { id: ACTIVITY_ID }, data: { status: 'confirmed' } })
    expect(prisma.activitySchedule.update).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID },
      data: { confirmed_slot_id: 'slot-1' },
    })
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [{ user_id: CREATOR_ID, type: 'activity_confirmed', reference_id: ACTIVITY_ID, reference_type: 'activity' }],
    })
    expect(res.json).toHaveBeenCalledWith({ message: '報名成功' })
  })

  it('投票制達標且全員一致時直接成團', async () => {
    const slotA = makeSlot('slot-a', { availabilities: [{ candidate_slot_id: 'slot-a', user_id: CREATOR_ID }] })
    const slotB = makeSlot('slot-b', { availabilities: [] })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'recruiting',
        participant_target: 2,
        participants: [makeParticipant(CREATOR_ID)],
        candidateSlots: [slotA, slotB],
        schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
      }),
    )
    prisma.activityParticipant.findUnique.mockResolvedValue(null)
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID, body: { candidateSlotIds: ['slot-a'] } }), res)

    expect(prisma.activity.update).toHaveBeenCalledWith({ where: { id: ACTIVITY_ID }, data: { status: 'confirmed' } })
    expect(prisma.activitySchedule.update).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID },
      data: { confirmed_slot_id: 'slot-a' },
    })
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [{ user_id: CREATOR_ID, type: 'activity_confirmed', reference_id: ACTIVITY_ID, reference_type: 'activity' }],
    })
  })

  it('投票制達標但未達成共識時進入 voting 並通知建立者去選', async () => {
    const slotA = makeSlot('slot-a', { availabilities: [{ candidate_slot_id: 'slot-a', user_id: CREATOR_ID }] })
    const slotB = makeSlot('slot-b', { availabilities: [] })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'recruiting',
        participant_target: 2,
        participants: [makeParticipant(CREATOR_ID)],
        candidateSlots: [slotA, slotB],
        schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
      }),
    )
    prisma.activityParticipant.findUnique.mockResolvedValue(null)
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID, body: { candidateSlotIds: ['slot-b'] } }), res)

    expect(prisma.activity.update).toHaveBeenCalledWith({ where: { id: ACTIVITY_ID }, data: { status: 'voting' } })
    expect(prisma.activitySchedule.update).not.toHaveBeenCalled()
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { user_id: CREATOR_ID, type: 'time_to_pick', reference_id: ACTIVITY_ID, reference_type: 'activity' },
    })
  })

  it('未設定 participant_target 時，報名不會觸發成團判定', async () => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'recruiting',
        participant_target: null,
        candidateSlots: [makeSlot('slot-1')],
        schedule: { requires_voting: false, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
      }),
    )
    prisma.activityParticipant.findUnique.mockResolvedValue(null)
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(prisma.activity.update).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ message: '報名成功' })
  })
})

describe('joinActivity - Scenario C slot resubmission during recruiting', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)))
    prisma.activity.updateMany.mockResolvedValue({ count: 1 })
  })

  function makeScenarioCActivity(overrides = {}) {
    return makeActivity({
      status: 'recruiting',
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      candidateSlots: [
        makeSlot('slot-a', {
          slot_start: new Date('2026-08-01T10:00:00Z'),
          slot_end: new Date('2026-08-01T12:00:00Z'),
          availabilities: [{ candidate_slot_id: 'slot-a', user_id: PARTICIPANT_ID }],
        }),
        makeSlot('slot-b', {
          slot_start: new Date('2026-08-02T10:00:00Z'),
          slot_end: new Date('2026-08-02T12:00:00Z'),
          availabilities: [],
        }),
      ],
      schedule: {
        requires_voting: true,
        availability_mode: 'slot',
        deadline_at: new Date('2099-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
      ...overrides,
    })
  }

  it('已報名者於 recruiting 重新送 candidateSlotIds 時覆寫 ActivityAvailability，不新增 participant', async () => {
    prisma.activity.findUnique.mockResolvedValue(makeScenarioCActivity())
    prisma.activityParticipant.findUnique.mockResolvedValue({ id: 'participant-row-1', status: 'joined' })
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID, body: { candidateSlotIds: ['slot-b'] } }), res)

    expect(prisma.activityAvailability.deleteMany).toHaveBeenCalledWith({
      where: { user_id: PARTICIPANT_ID, candidateSlot: { activity_id: ACTIVITY_ID } },
    })
    expect(prisma.activityAvailability.createMany).toHaveBeenCalledWith({
      data: [{ candidate_slot_id: 'slot-b', user_id: PARTICIPANT_ID }],
      skipDuplicates: true,
    })
    expect(prisma.activityParticipant.create).not.toHaveBeenCalled()
    expect(prisma.activityParticipant.update).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ message: '報名成功' })
  })

  it.each(['voting', 'confirmed'])('已報名者於 %s 重新送 candidateSlotIds 時回 400 且不改資料', async (status) => {
    prisma.activity.findUnique.mockResolvedValue(makeScenarioCActivity({ status }))
    prisma.activityParticipant.findUnique.mockResolvedValue({ id: 'participant-row-1', status: 'joined' })
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID, body: { candidateSlotIds: ['slot-b'] } }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activityAvailability.deleteMany).not.toHaveBeenCalled()
    expect(prisma.activityAvailability.createMany).not.toHaveBeenCalled()
  })
})

describe('getActivity - candidate_slots 附上目前使用者自己的勾選狀態', () => {
  it('回傳的 candidate_slots 依目前使用者是否已在該時段留下 availability 標記 is_selected', async () => {
    const slotA = makeSlot('slot-a', { availabilities: [{ candidate_slot_id: 'slot-a', user_id: PARTICIPANT_ID }] })
    const slotB = makeSlot('slot-b', { availabilities: [{ candidate_slot_id: 'slot-b', user_id: CREATOR_ID }] })
    const activity = makeActivity({
      candidateSlots: [slotA, slotB],
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          candidate_slots: [
            expect.objectContaining({ id: 'slot-a', is_selected: true }),
            expect.objectContaining({ id: 'slot-b', is_selected: false }),
          ],
        }),
      }),
    )
  })
})

describe('getActivity - Activity detail exposes schedule variant', () => {
  it.each([
    [
      'fixed',
      {
        schedule: {
          requires_voting: false,
          availability_mode: 'slot',
          deadline_at: new Date('2099-01-01T00:00:00Z'),
          confirmedSlot: null,
        },
        candidateSlots: [makeSlot('slot-fixed')],
      },
    ],
    [
      'find_time',
      {
        schedule: {
          requires_voting: true,
          availability_mode: 'range',
          deadline_at: new Date('2099-01-01T00:00:00Z'),
          fixed_date: new Date('2026-08-01T00:00:00Z'),
          confirmedSlot: null,
        },
        candidateSlots: [],
        availabilityRanges: [],
      },
    ],
    [
      'find_date',
      {
        schedule: {
          requires_voting: true,
          availability_mode: 'slot',
          deadline_at: new Date('2099-01-01T00:00:00Z'),
          confirmedSlot: null,
        },
        candidateSlots: [
          makeSlot('slot-a', {
            slot_start: new Date('2026-08-01T10:00:00Z'),
            slot_end: new Date('2026-08-01T12:00:00Z'),
          }),
          makeSlot('slot-b', {
            slot_start: new Date('2026-08-02T10:00:00Z'),
            slot_end: new Date('2026-08-02T12:00:00Z'),
          }),
        ],
      },
    ],
    [
      'find_date_time',
      {
        schedule: {
          requires_voting: true,
          availability_mode: 'slot',
          deadline_at: new Date('2099-01-01T00:00:00Z'),
          confirmedSlot: null,
        },
        candidateSlots: [
          makeSlot('slot-a', {
            slot_start: new Date('2026-08-01T10:00:00Z'),
            slot_end: new Date('2026-08-01T12:00:00Z'),
          }),
          makeSlot('slot-b', {
            slot_start: new Date('2026-08-02T14:00:00Z'),
            slot_end: new Date('2026-08-02T16:00:00Z'),
          }),
        ],
      },
    ],
  ])('回傳 schedule_variant: %s', async (scheduleVariant, overrides) => {
    prisma.activity.findUnique.mockResolvedValue(makeActivity(overrides))
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({ schedule_variant: scheduleVariant }),
      }),
    )
  })
})

describe('confirmFormation - voting 合法轉移到 confirmed', () => {
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

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'recruiting' },
      data: { status: 'confirmed' },
    })
    expect(prisma.activitySchedule.update).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID },
      data: { confirmed_slot_id: 'slot-1' },
    })
  })

  it('已被其他請求搶先確認成團時回傳 409，不會重複建立通知', async () => {
    const slot = makeSlot('slot-1')
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'recruiting',
        candidateSlots: [slot],
        participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
        schedule: { requires_voting: false, deadline_at: new Date(), confirmedSlot: null },
      }),
    )
    prisma.activity.updateMany.mockResolvedValueOnce({ count: 0 })
    const res = makeRes()

    await confirmFormation(makeReq(), res)

    expect(prisma.notification.createMany).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ message: '此活動狀態已被異動，請重新整理後再試' })
  })

  it.each(['confirmed', 'cancelled'])('投票制活動在 %s 狀態不能確認成團', async (status) => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({ status, schedule: { requires_voting: true, deadline_at: new Date(), confirmedSlot: null } }),
    )
    const res = makeRes()

    await confirmFormation(makeReq({ body: { candidateSlotId: 'slot-1' } }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '此活動狀態不允許確認成團' })
  })

  it.each(['recruiting', 'voting'])('投票制活動可以從 %s 確認成團（建立者可提前手動成團）', async (status) => {
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

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status },
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

  it.each(['recruiting', 'voting'])('狀態為 %s 時創建者可以取消活動', async (status) => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({ status, participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)] }),
    )
    const res = makeRes()

    await cancelActivity(makeReq(), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status },
      data: { status: 'cancelled' },
    })
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [{ user_id: PARTICIPANT_ID, type: 'activity_cancelled', reference_id: ACTIVITY_ID, reference_type: 'activity' }],
    })
    expect(res.json).toHaveBeenCalledWith({ message: '活動已取消' })
  })

  it('已被其他請求搶先取消時回傳 409，不會重複建立通知', async () => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'recruiting',
        participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      }),
    )
    prisma.activity.updateMany.mockResolvedValueOnce({ count: 0 })
    const res = makeRes()

    await cancelActivity(makeReq(), res)

    expect(prisma.notification.createMany).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ message: '此活動狀態已被異動，請重新整理後再試' })
  })
})

describe('cancelJoin - 只能在 recruiting 狀態取消報名', () => {
  it.each(['voting', 'confirmed', 'cancelled'])('狀態為 %s 時拒絕取消報名', async (status) => {
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

describe('listActivities - formatCard 的 date_iso 只在已成團時才給值（行事曆渲染依據）', () => {
  it('情境一（免投票）尚未成團時，date_iso 為 null，不應提前上行事曆', async () => {
    const activity = makeActivity({
      status: 'recruiting',
      schedule: { requires_voting: false, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findMany.mockResolvedValue([activity])
    const res = makeRes()

    await listActivities(makeReq(), res)

    expect(res.json).toHaveBeenCalledWith({
      activities: [expect.objectContaining({ status: 'recruiting', date_iso: null, confirmed_start: null })],
    })
  })

  it('情境一（免投票）已成團時，date_iso 帶入確認時段，confirmed_start 帶入確認時段的實際開始時間', async () => {
    const confirmedSlot = makeSlot('slot-1')
    const activity = makeActivity({
      status: 'confirmed',
      schedule: { requires_voting: false, deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot },
    })
    prisma.activity.findMany.mockResolvedValue([activity])
    const res = makeRes()

    await listActivities(makeReq(), res)

    expect(res.json).toHaveBeenCalledWith({
      activities: [
        expect.objectContaining({
          status: 'confirmed',
          date_iso: '2026-08-01',
          confirmed_start: confirmedSlot.slot_start,
        }),
      ],
    })
  })

  it.each(['recruiting', 'voting'])(
    '情境二三四（投票制）在 %s 狀態、尚未成團時，date_iso 為 null',
    async (status) => {
      const activity = makeActivity({
        status,
        candidateSlots: [makeSlot('slot-a', { availabilities: [{ candidate_slot_id: 'slot-a' }] })],
        schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
      })
      prisma.activity.findMany.mockResolvedValue([activity])
      const res = makeRes()

      await listActivities(makeReq(), res)

      expect(res.json).toHaveBeenCalledWith({
        activities: [expect.objectContaining({ status, date_iso: null })],
      })
    },
  )

  it('情境二三四（投票制）已成團時，date_iso 帶入確認時段', async () => {
    const confirmedSlot = makeSlot('slot-a')
    const activity = makeActivity({
      status: 'confirmed',
      candidateSlots: [confirmedSlot],
      schedule: { requires_voting: true, deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot },
    })
    prisma.activity.findMany.mockResolvedValue([activity])
    const res = makeRes()

    await listActivities(makeReq(), res)

    expect(res.json).toHaveBeenCalledWith({
      activities: [expect.objectContaining({ status: 'confirmed', date_iso: '2026-08-01' })],
    })
  })
})
