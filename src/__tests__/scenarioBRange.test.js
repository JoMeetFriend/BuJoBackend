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
    availabilityRanges: [],
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

  it('已報名者於 recruiting 狀態重新送出 ranges 時，先刪除舊的再寫入新的', async () => {
    prisma.activityParticipant.findUnique.mockResolvedValue({ id: 'participant-row-1', status: 'joined' })
    prisma.activity.findUnique.mockResolvedValue(
      makeRangeActivity({ status: 'recruiting', participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)] }),
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

  it('已報名者於 voting 狀態嘗試重新送出 ranges 時回 400，不寫入任何資料——跟 Mode C 一樣只能在 recruiting 改', async () => {
    prisma.activityParticipant.findUnique.mockResolvedValue({ id: 'participant-row-1', status: 'joined' })
    prisma.activity.findUnique.mockResolvedValue(
      makeRangeActivity({ status: 'voting', participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)] }),
    )
    const res = makeRes()

    const start = new Date('2026-08-01T14:00:00Z')
    const end = new Date('2026-08-01T16:00:00Z')

    await joinActivity(makeReq({ userId: PARTICIPANT_ID, body: { ranges: [{ start, end }] } }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activityAvailabilityRange.deleteMany).not.toHaveBeenCalled()
    expect(prisma.activityAvailabilityRange.createMany).not.toHaveBeenCalled()
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

describe('getActivity - range 模式 decision_candidates', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)))
    prisma.activity.updateMany.mockResolvedValue({ count: 1 })
  })

  it('回傳 decision_candidates 為 {perfect_overlap, partial_overlap}，只反映真人參與者送出的可用時間，不含建立者的幽靈投票', async () => {
    const activity = makeRangeActivity({
      status: 'voting',
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      availabilityRanges: [
        {
          user_id: PARTICIPANT_ID,
          range_start: new Date(2026, 7, 1, 18, 0),
          range_end: new Date(2026, 7, 1, 20, 0),
        },
      ],
      schedule: {
        requires_voting: true,
        availability_mode: 'range',
        deadline_at: new Date('2020-01-01T00:00:00Z'),
        fixed_date: new Date(2026, 7, 1),
        time_window_start: new Date(2026, 7, 1, 18, 0),
        time_window_end: new Date(2026, 7, 1, 20, 0),
        vote_deadline_at: new Date('2099-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    // 只有 1 個真人參與者送出可用時間，count 應該是 1，不是「+ 建立者虛擬整段有空」灌出來的 2
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          availability_mode: 'range',
          decision_candidates: {
            perfect_overlap: [
              expect.objectContaining({
                slot_start: new Date(2026, 7, 1, 18, 0),
                slot_end: new Date(2026, 7, 1, 19, 0),
                count: 1,
              }),
              expect.objectContaining({
                slot_start: new Date(2026, 7, 1, 19, 0),
                slot_end: new Date(2026, 7, 1, 20, 0),
                count: 1,
              }),
            ],
            partial_overlap: [],
          },
        }),
      }),
    )
  })

  it('兩個真人參與者都送出可用時間時，totalParticipants 依 user_id 去重，不因為某人用「+新增時段」送多筆而膨脹', async () => {
    const activity = makeRangeActivity({
      status: 'voting',
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      availabilityRanges: [
        // PARTICIPANT_ID 用「+新增時段」送出兩筆不連續的 range，仍然只算 1 個人
        {
          user_id: PARTICIPANT_ID,
          range_start: new Date(2026, 7, 1, 18, 0),
          range_end: new Date(2026, 7, 1, 19, 0),
        },
        {
          user_id: PARTICIPANT_ID,
          range_start: new Date(2026, 7, 1, 19, 0),
          range_end: new Date(2026, 7, 1, 20, 0),
        },
      ],
      schedule: {
        requires_voting: true,
        availability_mode: 'range',
        deadline_at: new Date('2020-01-01T00:00:00Z'),
        fixed_date: new Date(2026, 7, 1),
        time_window_start: new Date(2026, 7, 1, 18, 0),
        time_window_end: new Date(2026, 7, 1, 20, 0),
        vote_deadline_at: new Date('2099-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    // 兩筆 range 都來自同一個 user_id，totalParticipants 去重後是 1，每一格仍然是 count 1 = 完全重疊
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          decision_candidates: {
            perfect_overlap: [
              expect.objectContaining({
                slot_start: new Date(2026, 7, 1, 18, 0),
                slot_end: new Date(2026, 7, 1, 19, 0),
                count: 1,
              }),
              expect.objectContaining({
                slot_start: new Date(2026, 7, 1, 19, 0),
                slot_end: new Date(2026, 7, 1, 20, 0),
                count: 1,
              }),
            ],
            partial_overlap: [],
          },
        }),
      }),
    )
  })

  it('回傳的 activity 帶上 fixed_date/time_window_start/time_window_end，供前端 AvailabilityPickerModal 使用', async () => {
    const fixedDate = new Date(2026, 7, 1)
    const timeWindowStart = new Date(2026, 7, 1, 18, 0)
    const timeWindowEnd = new Date(2026, 7, 1, 20, 0)
    const activity = makeRangeActivity({
      status: 'recruiting',
      participants: [makeParticipant(CREATOR_ID)],
      availabilityRanges: [],
      schedule: {
        requires_voting: true,
        availability_mode: 'range',
        deadline_at: new Date('2099-01-01T00:00:00Z'),
        fixed_date: fixedDate,
        time_window_start: timeWindowStart,
        time_window_end: timeWindowEnd,
        vote_deadline_at: new Date('2099-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    // 前端 AvailabilityPickerModal 的 fixedDate/timeWindowStart/timeWindowEnd props 期待
    // 'YYYY-MM-DD'／'HH:mm' 這種以伺服器所在時區（本地時間）為準的純字串，不是原始 Date／UTC ISO 字串——
    // 直接回傳 Date 物件會被序列化成 UTC ISO，在 UTC+8 時區下日期會整個位移少一天
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          fixed_date: '2026-08-01',
          time_window_start: '18:00',
          time_window_end: '20:00',
        }),
      }),
    )
  })

  it('my_ranges 只回傳目前請求者自己送出的 ranges，不含其他人的，供前端「修改時間」重開 picker 時預填', async () => {
    const activity = makeRangeActivity({
      status: 'recruiting',
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      availabilityRanges: [
        {
          user_id: PARTICIPANT_ID,
          range_start: new Date('2026-08-01T18:00:00Z'),
          range_end: new Date('2026-08-01T20:00:00Z'),
        },
        {
          user_id: CREATOR_ID,
          range_start: new Date('2026-08-01T10:00:00Z'),
          range_end: new Date('2026-08-01T12:00:00Z'),
        },
      ],
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          my_ranges: [
            { start: '2026-08-01T18:00:00.000Z', end: '2026-08-01T20:00:00.000Z' },
          ],
        }),
      }),
    )
  })

  it('非 range 模式的活動 my_ranges 一律回空陣列', async () => {
    const activity = makeRangeActivity({
      schedule: {
        requires_voting: true,
        availability_mode: 'slot',
        deadline_at: new Date('2099-01-01T00:00:00Z'),
        fixed_date: null,
        time_window_start: null,
        time_window_end: null,
        vote_deadline_at: new Date('2099-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({ my_ranges: [] }),
      }),
    )
  })

  it('取消報名者殘留的 availability ranges 不計入 perfect_overlap 或 partial_overlap', async () => {
    const activity = makeRangeActivity({
      status: 'voting',
      participants: [makeParticipant(CREATOR_ID)],
      availabilityRanges: [
        {
          user_id: PARTICIPANT_ID,
          range_start: new Date(2026, 7, 1, 19, 0),
          range_end: new Date(2026, 7, 1, 20, 0),
        },
      ],
      schedule: {
        requires_voting: true,
        availability_mode: 'range',
        deadline_at: new Date('2020-01-01T00:00:00Z'),
        fixed_date: new Date(2026, 7, 1),
        time_window_start: new Date(2026, 7, 1, 18, 0),
        time_window_end: new Date(2026, 7, 1, 20, 0),
        vote_deadline_at: new Date('2099-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    // 建立者不算真人投票，除了那筆殘留的取消報名者資料外沒有任何真人送出可用時間，
    // decision_candidates 應該整個是空的——不會顯示建立者虛擬投票出來的整段時間，
    // 也不會把已取消報名者的殘留資料算進去
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          decision_candidates: {
            perfect_overlap: [],
            partial_overlap: [],
          },
        }),
      }),
    )
  })
})

describe('cancelJoin - range 模式報名取消清除 availability ranges', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)))
  })

  it('Range-mode cancellation removes stored availability ranges', async () => {
    prisma.activity.findUnique.mockResolvedValue(makeRangeActivity({ status: 'recruiting' }))
    prisma.activityParticipant.findUnique.mockResolvedValue({ id: 'participant-row-1', status: 'joined' })
    const res = makeRes()

    await cancelJoin(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(prisma.activityParticipant.update).toHaveBeenCalledWith({
      where: { id: 'participant-row-1' },
      data: { status: 'left' },
    })
    expect(prisma.activityAvailabilityRange.deleteMany).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID, user_id: PARTICIPANT_ID },
    })
    expect(res.json).toHaveBeenCalledWith({ message: '已取消報名' })
  })
})

describe('getActivity - vote_deadline_at 逾時自動取消（情境二專屬）', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)))
    prisma.activity.updateMany.mockResolvedValue({ count: 1 })
  })

  it('voting 狀態、vote_deadline_at 已過、confirmed_slot_id 仍為空 -> 轉為 cancelled 並通知所有參與者', async () => {
    const activity = makeRangeActivity({
      status: 'voting',
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      schedule: {
        requires_voting: true,
        availability_mode: 'range',
        deadline_at: new Date('2020-01-01T00:00:00Z'),
        fixed_date: new Date(2026, 7, 1),
        time_window_start: null,
        time_window_end: null,
        vote_deadline_at: new Date('2020-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'voting' },
      data: { status: 'cancelled' },
    })
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        { user_id: CREATOR_ID, type: 'activity_cancelled', reference_id: ACTIVITY_ID, reference_type: 'activity' },
        { user_id: PARTICIPANT_ID, type: 'activity_cancelled', reference_id: ACTIVITY_ID, reference_type: 'activity' },
      ],
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ activity: expect.objectContaining({ status: 'cancelled' }) }),
    )
  })
})

describe('getActivity - 情境二零提交自動取消', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)))
    prisma.activity.updateMany.mockResolvedValue({ count: 1 })
  })

  it('recruiting、未設 participant_target、deadline_at 已過、除建立者外無人提交過 range -> 轉為 cancelled', async () => {
    const activity = makeRangeActivity({
      status: 'recruiting',
      participant_target: null,
      availabilityRanges: [],
      schedule: {
        requires_voting: true,
        availability_mode: 'range',
        deadline_at: new Date('2020-01-01T00:00:00Z'),
        fixed_date: new Date(2026, 7, 1),
        time_window_start: null,
        time_window_end: null,
        vote_deadline_at: new Date('2099-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'recruiting' },
      data: { status: 'cancelled' },
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ activity: expect.objectContaining({ status: 'cancelled' }) }),
    )
  })

  it('有人（非建立者）提交過 range 時，即使到期也不會被零提交規則取消，改進入 voting', async () => {
    const activity = makeRangeActivity({
      status: 'recruiting',
      participant_target: null,
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      availabilityRanges: [
        {
          user_id: PARTICIPANT_ID,
          range_start: new Date(2026, 7, 1, 18, 0),
          range_end: new Date(2026, 7, 1, 19, 0),
        },
      ],
      schedule: {
        requires_voting: true,
        availability_mode: 'range',
        deadline_at: new Date('2020-01-01T00:00:00Z'),
        fixed_date: new Date(2026, 7, 1),
        time_window_start: null,
        time_window_end: null,
        vote_deadline_at: new Date('2099-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'recruiting' },
      data: { status: 'voting' },
    })
  })
})

describe('confirmFormation - range 模式確認成團', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)))
    prisma.activity.updateMany.mockResolvedValue({ count: 1 })
  })

  it('帶 {slotStart, slotEnd} 命中候選格時，建立一筆 ActivityCandidateSlot 並寫入 confirmed_slot_id', async () => {
    const activity = makeRangeActivity({
      status: 'voting',
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      availabilityRanges: [
        {
          user_id: PARTICIPANT_ID,
          range_start: new Date(2026, 7, 1, 18, 0),
          range_end: new Date(2026, 7, 1, 20, 0),
        },
      ],
      schedule: {
        requires_voting: true,
        availability_mode: 'range',
        deadline_at: new Date('2020-01-01T00:00:00Z'),
        fixed_date: new Date(2026, 7, 1),
        time_window_start: new Date(2026, 7, 1, 18, 0),
        time_window_end: new Date(2026, 7, 1, 20, 0),
        vote_deadline_at: new Date('2099-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    prisma.activityCandidateSlot.create.mockResolvedValue({
      id: 'new-slot-1',
      slot_start: new Date(2026, 7, 1, 18, 0),
      slot_end: new Date(2026, 7, 1, 19, 0),
    })
    const res = makeRes()

    await confirmFormation(
      makeReq({
        body: { slotStart: new Date(2026, 7, 1, 18, 0), slotEnd: new Date(2026, 7, 1, 19, 0) },
      }),
      res,
    )

    expect(prisma.activityCandidateSlot.create).toHaveBeenCalledWith({
      data: {
        activity_id: ACTIVITY_ID,
        slot_start: new Date(2026, 7, 1, 18, 0),
        slot_end: new Date(2026, 7, 1, 19, 0),
        all_day: false,
      },
    })
    expect(prisma.activitySchedule.update).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID },
      data: { confirmed_slot_id: 'new-slot-1' },
    })
    expect(res.json).toHaveBeenCalledWith({ message: '成團成功' })
  })

  it('{slotStart, slotEnd} 不在目前 decision_candidates 名單內時回 400、不建立 ActivityCandidateSlot', async () => {
    const activity = makeRangeActivity({
      status: 'voting',
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      availabilityRanges: [
        {
          user_id: PARTICIPANT_ID,
          range_start: new Date(2026, 7, 1, 18, 0),
          range_end: new Date(2026, 7, 1, 19, 0),
        },
      ],
      schedule: {
        requires_voting: true,
        availability_mode: 'range',
        deadline_at: new Date('2020-01-01T00:00:00Z'),
        fixed_date: new Date(2026, 7, 1),
        time_window_start: new Date(2026, 7, 1, 18, 0),
        time_window_end: new Date(2026, 7, 1, 20, 0),
        vote_deadline_at: new Date('2099-01-01T00:00:00Z'),
        confirmedSlot: null,
      },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await confirmFormation(
      makeReq({
        body: { slotStart: new Date(2026, 7, 1, 20, 0), slotEnd: new Date(2026, 7, 1, 21, 0) },
      }),
      res,
    )

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activityCandidateSlot.create).not.toHaveBeenCalled()
  })
})
