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
    activityAvailabilityRange: {
      create: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(() => Promise.resolve([])),
    },
    activityCandidateSlot: { create: jest.fn() },
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
  joinActivity,
  confirmFormation,
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

function makeParticipant(userId, overrides = {}) {
  return {
    user_id: userId,
    status: 'joined',
    user: { id: userId, display_name: userId, avatar_url: null },
    ...overrides,
  }
}

function makeRangeActivity(overrides = {}) {
  return {
    id: ACTIVITY_ID,
    creator_id: CREATOR_ID,
    creator: { id: CREATOR_ID, display_name: 'creator', avatar_url: null },
    status: 'recruiting',
    title: '情境二活動',
    description: null,
    location: null,
    category: null,
    participant_target: null,
    candidateSlots: [],
    participants: [makeParticipant(CREATOR_ID)],
    schedule: {
      requires_voting: true,
      availability_mode: 'range',
      deadline_at: new Date('2099-01-01T00:00:00Z'),
      fixed_date: new Date(2026, 7, 1),
      time_window_start: null,
      time_window_end: null,
      vote_deadline_at: new Date(2026, 7, 1),
      confirmedSlot: null,
    },
    ...overrides,
  }
}

describe('createActivity - 情境二 range 模式', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)))
    prisma.activity.updateMany.mockResolvedValue({ count: 1 })
    prisma.activityAvailabilityRange.findMany.mockResolvedValue([])
  })

  it('收到 singleDate + timeWindowStart/timeWindowEnd 時，寫入 range 模式欄位且不建立任何候選時段', async () => {
    prisma.activity.create.mockResolvedValue({
      id: ACTIVITY_ID,
      candidateSlots: [],
    })

    const req = makeReq({
      body: {
        title: '情境二測試',
        deadline: '2026-07-31T00:00:00.000Z',
        singleDate: '2026/08/01',
        timeWindowStart: '上午 9:00',
        timeWindowEnd: '下午 6:00',
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schedule: {
            create: expect.objectContaining({
              requires_voting: true,
              availability_mode: 'range',
              fixed_date: new Date(2026, 7, 1),
              time_window_start: new Date(2026, 7, 1, 9, 0),
              time_window_end: new Date(2026, 7, 1, 18, 0),
              vote_deadline_at: new Date(2026, 7, 1, 9, 0),
            }),
          },
          candidateSlots: { create: [] },
        }),
      }),
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })
})

describe('joinActivity - 情境二 range 模式報名', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)))
    prisma.activity.updateMany.mockResolvedValue({ count: 1 })
    prisma.activityAvailabilityRange.findMany.mockResolvedValue([])
    prisma.activityParticipant.findUnique.mockResolvedValue(null)
  })

  it('帶 {ranges: [...]} 時寫入對應數量的 ActivityAvailabilityRange', async () => {
    prisma.activity.findUnique.mockResolvedValue(makeRangeActivity())
    const res = makeRes()

    const start = new Date('2026-08-01T10:00:00Z')
    const end = new Date('2026-08-01T12:00:00Z')

    await joinActivity(makeReq({ userId: PARTICIPANT_ID, body: { ranges: [{ start, end }] } }), res)

    expect(prisma.activityAvailabilityRange.createMany).toHaveBeenCalledWith({
      data: [{ activity_id: ACTIVITY_ID, user_id: PARTICIPANT_ID, range_start: start, range_end: end }],
    })
    expect(res.json).toHaveBeenCalledWith({ message: '報名成功' })
  })

  it('空 ranges 陣列回 400、不寫入任何資料', async () => {
    prisma.activity.findUnique.mockResolvedValue(makeRangeActivity())
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID, body: { ranges: [] } }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activityAvailabilityRange.createMany).not.toHaveBeenCalled()
  })

  it('submitted range 超出 time_window_start/time_window_end 時回 400', async () => {
    prisma.activity.findUnique.mockResolvedValue(
      makeRangeActivity({
        schedule: {
          requires_voting: true,
          availability_mode: 'range',
          deadline_at: new Date('2099-01-01T00:00:00Z'),
          fixed_date: new Date(2026, 7, 1),
          time_window_start: new Date(2026, 7, 1, 9, 0),
          time_window_end: new Date(2026, 7, 1, 18, 0),
          vote_deadline_at: new Date(2026, 7, 1, 9, 0),
          confirmedSlot: null,
        },
      }),
    )
    const res = makeRes()

    const start = new Date(2026, 7, 1, 7, 0) // 早於 time_window_start
    const end = new Date(2026, 7, 1, 10, 0)

    await joinActivity(makeReq({ userId: PARTICIPANT_ID, body: { ranges: [{ start, end }] } }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activityAvailabilityRange.createMany).not.toHaveBeenCalled()
  })

  it('已報名者於 recruiting/voting 狀態重新送出 ranges 時，先刪除舊的再寫入新的', async () => {
    prisma.activityParticipant.findUnique.mockResolvedValue({ id: 'participant-row-1', status: 'joined' })
    prisma.activity.findUnique.mockResolvedValue(
      makeRangeActivity({ status: 'voting', participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)] }),
    )
    const res = makeRes()

    const start = new Date('2026-08-01T14:00:00Z')
    const end = new Date('2026-08-01T16:00:00Z')

    await joinActivity(makeReq({ userId: PARTICIPANT_ID, body: { ranges: [{ start, end }] } }), res)

    expect(prisma.activityAvailabilityRange.deleteMany).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID, user_id: PARTICIPANT_ID },
    })
    expect(prisma.activityAvailabilityRange.createMany).toHaveBeenCalledWith({
      data: [{ activity_id: ACTIVITY_ID, user_id: PARTICIPANT_ID, range_start: start, range_end: end }],
    })
    expect(prisma.activityParticipant.create).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ message: '報名成功' })
  })
})

describe('joinActivity - deadline_at 已過的活動一律拒絕報名（四情境皆適用）', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)))
    prisma.activityParticipant.findUnique.mockResolvedValue(null)
  })

  it('status 仍是 recruiting 但 deadline_at < now 時拒絕報名、不建立 ActivityParticipant', async () => {
    prisma.activity.findUnique.mockResolvedValue(
      makeRangeActivity({
        schedule: {
          requires_voting: true,
          availability_mode: 'range',
          deadline_at: new Date('2020-01-01T00:00:00Z'),
          fixed_date: new Date(2026, 7, 1),
          time_window_start: null,
          time_window_end: null,
          vote_deadline_at: new Date(2026, 7, 1),
          confirmedSlot: null,
        },
      }),
    )
    const res = makeRes()

    await joinActivity(
      makeReq({
        userId: PARTICIPANT_ID,
        body: { ranges: [{ start: new Date('2026-08-01T10:00:00Z'), end: new Date('2026-08-01T12:00:00Z') }] },
      }),
      res,
    )

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activityParticipant.create).not.toHaveBeenCalled()
  })
})
