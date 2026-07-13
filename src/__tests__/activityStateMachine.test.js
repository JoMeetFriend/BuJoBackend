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
    activityCandidateSlot: { create: jest.fn() },
    friendship: { findMany: jest.fn(() => Promise.resolve([])) },
    notification: { create: jest.fn(), createMany: jest.fn() },
    userIdentity: { findFirst: jest.fn() },
    notificationPreference: { findUnique: jest.fn() },
    $queryRaw: jest.fn(() => Promise.resolve([])),
    $transaction: jest.fn((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
  }

  return { default: prisma }
})

jest.unstable_mockModule('../services/lineMessagingService.js', () => ({
  sendLinePushMessage: jest.fn(() => Promise.resolve({ status: 'sent' })),
}))

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
const { sendLinePushMessage } = await import('../services/lineMessagingService.js')

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
      schedule: { requires_voting: false, vote_deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
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
      schedule: { requires_voting: false, vote_deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
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

  it('情境一（免投票）活動報名截止 -> 轉為 voting，不自動 confirmed，等待建立者手動確認', async () => {
    const slot = makeSlot('slot-1')
    const activity = makeActivity({
      candidateSlots: [slot],
      schedule: { requires_voting: false, vote_deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'recruiting' },
      data: { status: 'voting' },
    })
    expect(prisma.activitySchedule.update).not.toHaveBeenCalled()
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { user_id: CREATOR_ID, type: 'time_to_pick', reference_id: ACTIVITY_ID, reference_type: 'activity' },
    })
  })

  it('投票制活動報名截止且全員一致，仍轉為 voting，不自動 confirmed（拿掉 decideFormationOutcome 自動判定）', async () => {
    const slotA = makeSlot('slot-a', {
      availabilities: [{ candidate_slot_id: 'slot-a' }, { candidate_slot_id: 'slot-a' }],
    })
    const slotB = makeSlot('slot-b')
    const activity = makeActivity({
      // 全員一致的分母排除建立者，2 筆 availability 要對應 2 個真人參與者才會判定一致
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID), makeParticipant('participant-2')],
      candidateSlots: [slotA, slotB],
      schedule: { requires_voting: true, vote_deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'recruiting' },
      data: { status: 'voting' },
    })
    expect(prisma.activitySchedule.update).not.toHaveBeenCalled()
  })

  it('投票制活動已過期但未達成共識 -> 轉為 voting 並通知創建者', async () => {
    const slotA = makeSlot('slot-a', { availabilities: [{ candidate_slot_id: 'slot-a' }] })
    const slotB = makeSlot('slot-b', { availabilities: [{ candidate_slot_id: 'slot-b' }] })
    const activity = makeActivity({
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      candidateSlots: [slotA, slotB],
      schedule: { requires_voting: true, vote_deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
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
      schedule: { requires_voting: false, vote_deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
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

  it('情境三：最晚候選日的 vote_deadline_at 也過了 -> 強制轉 voting（即使目前票數全員一致，仍不自動 confirmed）', async () => {
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
      // 全員一致的分母排除建立者，2 筆 availability 要對應 2 個真人參與者才會判定一致
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID), makeParticipant('participant-2')],
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
      data: { status: 'voting' },
    })
    expect(prisma.activitySchedule.update).not.toHaveBeenCalled()
  })

  it('情境四：最早候選時段的 deadline_at 已過，但最晚候選時段的 vote_deadline_at 還沒到 -> 維持 recruiting，投票不被腰斬', async () => {
    const slotEarly = makeSlot('slot-early', {
      slot_start: new Date('2026-08-01T01:00:00Z'),
      slot_end: new Date('2026-08-01T02:00:00Z'),
    })
    const slotLate = makeSlot('slot-late', {
      slot_start: new Date('2026-08-29T11:00:00Z'),
      slot_end: new Date('2026-08-29T12:00:00Z'),
    })
    const activity = makeActivity({
      candidateSlots: [slotEarly, slotLate],
      schedule: {
        requires_voting: true,
        // deadline_at 錨定最早候選時段（已經過去），vote_deadline_at 錨定最晚候選時段（還沒到）
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

  it('情境四：最晚候選時段的 vote_deadline_at 也過了 -> 強制轉 voting（即使目前票數全員一致，仍不自動 confirmed）', async () => {
    const slotEarly = makeSlot('slot-early', {
      slot_start: new Date('2026-08-01T01:00:00Z'),
      slot_end: new Date('2026-08-01T02:00:00Z'),
      availabilities: [{ candidate_slot_id: 'slot-early' }, { candidate_slot_id: 'slot-early' }],
    })
    const slotLate = makeSlot('slot-late', {
      slot_start: new Date('2026-08-29T11:00:00Z'),
      slot_end: new Date('2026-08-29T12:00:00Z'),
    })
    const activity = makeActivity({
      // 全員一致的分母排除建立者，2 筆 availability 要對應 2 個真人參與者才會判定一致
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID), makeParticipant('participant-2')],
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
      data: { status: 'voting' },
    })
    expect(prisma.activitySchedule.update).not.toHaveBeenCalled()
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
          // 完整排名清單，不再只回傳並列最高票——兩個候選時段都要出現，依票數由高到低排序
          decision_candidates: [
            expect.objectContaining({ id: 'slot-a', count: 1 }),
            expect.objectContaining({ id: 'slot-b', count: 0 }),
          ],
        }),
      }),
    )
  })
})

describe('createActivity - 不再要求/寫入建立者的幽靈投票', () => {
  it('情境三／四建立活動不再要求 creatorSlotIndexes，缺少這個欄位也能成功建立', async () => {
    prisma.activity.create.mockResolvedValue({
      id: ACTIVITY_ID,
      candidateSlots: [
        { id: 'slot-x', slot_start: new Date('2026-08-01T01:00:00Z'), slot_end: new Date('2026-08-01T02:00:00Z') },
      ],
    })

    const req = makeReq({
      body: {
        title: '重複時段測試',
        deadline: new Date('2026-07-31T00:00:00Z').toISOString(),
        candidateDates: ['2026/08/01'],
        uniformTime: { startTime: '上午 9:00', endTime: '上午 10:00' },
        // 刻意不帶 creatorSlotIndexes
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(prisma.activityAvailability.createMany).not.toHaveBeenCalled()
  })
})

describe('createActivity - 情境三 deadline_at 天花板錨定在最晚候選日，不是最早', () => {
  it('候選日期不連續時，deadline_at 等於最晚候選日的 slot_start，vote_deadline_at 等於送出的 deadline', async () => {
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
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schedule: expect.objectContaining({
            create: expect.objectContaining({
              deadline_at: new Date('2026-08-29T01:00:00Z'),
              vote_deadline_at: new Date('2026-07-31T00:00:00Z'),
            }),
          }),
        }),
      }),
    )
  })
})

describe('createActivity - 情境四 deadline_at 天花板錨定在最晚候選時段，不是最早', () => {
  it('候選日期各自時段、日期不連續時，deadline_at 等於最晚候選時段的 slot_start，vote_deadline_at 等於送出的 deadline', async () => {
    prisma.activity.create.mockResolvedValue({
      id: ACTIVITY_ID,
      candidateSlots: [
        { id: 'slot-1', slot_start: new Date('2026-08-01T01:00:00Z'), slot_end: new Date('2026-08-01T02:00:00Z') },
        { id: 'slot-2', slot_start: new Date('2026-08-20T11:00:00Z'), slot_end: new Date('2026-08-20T12:00:00Z') },
        { id: 'slot-3', slot_start: new Date('2026-08-10T01:00:00Z'), slot_end: new Date('2026-08-10T02:00:00Z') },
      ],
    })

    const req = makeReq({
      body: {
        title: '情境四不連續候選時段測試',
        deadline: new Date('2026-07-31T00:00:00Z').toISOString(),
        // 刻意打亂順序，確認不是「取陣列最後一筆」而是真的比較時間
        dateSlots: [
          { date: '2026/08/20', startTime: '下午 7:00', endTime: '下午 8:00' },
          { date: '2026/08/01', startTime: '上午 9:00', endTime: '上午 10:00' },
          { date: '2026/08/10', startTime: '上午 9:00', endTime: '上午 10:00' },
        ],
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schedule: expect.objectContaining({
            create: expect.objectContaining({
              deadline_at: new Date('2026-08-20T11:00:00Z'),
              vote_deadline_at: new Date('2026-07-31T00:00:00Z'),
            }),
          }),
        }),
      }),
    )
  })
})

describe('createActivity - 情境一／二 deadline_at 天花板公式與 vote_deadline_at 語意反轉', () => {
  it('情境一（固定時段）：deadline_at 等於活動本身的 slot_start，vote_deadline_at 等於送出的 deadline', async () => {
    prisma.activity.create.mockResolvedValue({ id: ACTIVITY_ID, candidateSlots: [] })

    const req = makeReq({
      body: {
        title: '情境一天花板測試',
        deadline: new Date(2026, 6, 31).toISOString(),
        startDate: '2026/08/01',
        startTime: '下午 2:00',
        endDate: '2026/08/01',
        endTime: '下午 4:00',
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schedule: expect.objectContaining({
            create: expect.objectContaining({
              deadline_at: new Date(2026, 7, 1, 14, 0),
              vote_deadline_at: new Date(2026, 6, 31),
            }),
          }),
        }),
      }),
    )
  })

  it('情境二（range 模式）：deadline_at 等於 time_window_start，未提供時間窗則等於 fixed_date', async () => {
    prisma.activity.create.mockResolvedValue({ id: ACTIVITY_ID, candidateSlots: [] })

    const req = makeReq({
      body: {
        title: '情境二天花板測試',
        deadline: new Date(2026, 6, 31, 9, 0).toISOString(),
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
          schedule: expect.objectContaining({
            create: expect.objectContaining({
              deadline_at: new Date(2026, 7, 1, 9, 0),
              vote_deadline_at: new Date(2026, 6, 31, 9, 0),
            }),
          }),
        }),
      }),
    )
  })
})

describe('createActivity - 情境四每個候選日期只能有一組時段', () => {
  it('dateSlots 有重複日期時回 400，不建立任何候選時段', async () => {
    const req = makeReq({
      body: {
        title: '情境四重複日期測試',
        deadline: new Date('2026-07-31T00:00:00Z').toISOString(),
        dateSlots: [
          { date: '2026/08/20', startTime: '上午 9:00', endTime: '上午 10:00' },
          { date: '2026/08/20', startTime: '下午 7:00', endTime: '下午 8:00' },
        ],
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '每個候選日期只能設定一組時段' })
    expect(prisma.activity.create).not.toHaveBeenCalled()
  })

  it('dateSlots 每個日期都不同時正常建立', async () => {
    prisma.activity.create.mockResolvedValue({
      id: ACTIVITY_ID,
      candidateSlots: [
        { id: 'slot-1', slot_start: new Date('2026-08-01T01:00:00Z'), slot_end: new Date('2026-08-01T02:00:00Z') },
        { id: 'slot-2', slot_start: new Date('2026-08-20T11:00:00Z'), slot_end: new Date('2026-08-20T12:00:00Z') },
      ],
    })
    const req = makeReq({
      body: {
        title: '情境四不重複日期測試',
        deadline: new Date('2026-07-31T00:00:00Z').toISOString(),
        dateSlots: [
          { date: '2026/08/01', startTime: '上午 9:00', endTime: '上午 10:00' },
          { date: '2026/08/20', startTime: '下午 7:00', endTime: '下午 8:00' },
        ],
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(res.status).not.toHaveBeenCalledWith(400)
    expect(prisma.activity.create).toHaveBeenCalled()
  })
})

describe('createActivity - 伺服器算出的 deadline_at 天花板必須晚於現在', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('情境一（全固定）：算出的 deadline_at（活動開始時間）已經過去時回 400，且不建立任何紀錄', async () => {
    const req = makeReq({
      body: {
        title: '過期流團活動',
        deadline: new Date(2020, 6, 1).toISOString(),
        startDate: '2020/08/01',
        startTime: '上午 10:00',
        endDate: '2020/08/01',
        endTime: '上午 12:00',
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activity.create).not.toHaveBeenCalled()
  })

  it('算出的 deadline_at 等於目前伺服器時間時回 400', async () => {
    const now = new Date(2026, 7, 1, 10, 0)
    jest.useFakeTimers({ now })

    const req = makeReq({
      body: {
        title: '邊界流團活動',
        deadline: new Date(2026, 6, 31).toISOString(),
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

  it('合法的未來 deadline_at 仍可正常建立活動（回歸測試，鎖住現況行為）', async () => {
    prisma.activity.create.mockResolvedValue(makeActivity())

    const req = makeReq({
      body: {
        title: '正常流團活動',
        deadline: new Date(2098, 11, 31).toISOString(),
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

  it.each([
    [
      '情境二（日期固定・時間投票）',
      {
        title: '過期流團活動-情境二',
        deadline: new Date(2020, 6, 1).toISOString(),
        singleDate: '2020/08/01',
        timeWindowStart: '上午 09:00',
        timeWindowEnd: '下午 06:00',
      },
    ],
    [
      '情境三（候選日期複選・統一時間）',
      {
        title: '過期流團活動-情境三',
        deadline: new Date(2020, 6, 1).toISOString(),
        candidateDates: ['2020/08/01', '2020/08/02'],
        uniformTime: { startTime: '上午 09:00', endTime: '上午 10:00' },
      },
    ],
    [
      '情境四（候選日期各自時段）',
      {
        title: '過期流團活動-情境四',
        deadline: new Date(2020, 6, 1).toISOString(),
        dateSlots: [
          { date: '2020/08/01', startTime: '上午 09:00', endTime: '上午 10:00' },
          { date: '2020/08/02', startTime: '上午 09:00', endTime: '上午 10:00' },
        ],
      },
    ],
  ])('%s：算出的 deadline_at 已經過去時回 400，且不建立任何紀錄', async (_label, body) => {
    const req = makeReq({ body })
    const res = makeRes()

    await createActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activity.create).not.toHaveBeenCalled()
  })
})

describe('createActivity - vote_deadline_at 不能晚於伺服器算出的 deadline_at', () => {
  it('送出的 deadline 晚於算出的 deadline_at 時回 400，且不建立任何紀錄', async () => {
    const req = makeReq({
      body: {
        title: '報名截止晚於決策截止測試',
        // deadline_at（天花板）算出來是 2026/08/01 14:00，這裡送出的 deadline 故意晚於它
        deadline: new Date(2026, 7, 1, 15, 0).toISOString(),
        startDate: '2026/08/01',
        startTime: '下午 2:00',
        endDate: '2026/08/01',
        endTime: '下午 4:00',
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activity.create).not.toHaveBeenCalled()
  })

  it('送出的 deadline 等於算出的 deadline_at 時仍可正常建立（無報名緩衝的合法邊界，不是錯誤）', async () => {
    // 活動快開始、連最小預設都不安全時，前端智慧預設演算法會 fallback 成
    // vote_deadline_at = deadline_at（報名開放到跟決策截止同一刻），這是刻意設計的合法狀態，
    // 不能被「須早於」擋掉，只有真正「晚於」天花板才是不合理
    prisma.activity.create.mockResolvedValue(makeActivity())

    const req = makeReq({
      body: {
        title: '報名截止等於決策截止測試',
        deadline: new Date(2026, 7, 1, 14, 0).toISOString(),
        startDate: '2026/08/01',
        startTime: '下午 2:00',
        endDate: '2026/08/01',
        endTime: '下午 4:00',
      },
    })
    const res = makeRes()

    await createActivity(req, res)

    expect(prisma.activity.create).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })
})

describe('joinActivity - vote_deadline_at 已過的活動一律拒絕報名（不受 deadline_at 影響）', () => {
  it('status 仍是 recruiting 但 vote_deadline_at < now 時拒絕報名，即使 deadline_at 還沒到', async () => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'recruiting',
        schedule: {
          requires_voting: false,
          // deadline_at（決策硬截止天花板）還沒到，但 vote_deadline_at（報名截止）已經過去
          deadline_at: new Date('2099-01-01T00:00:00Z'),
          vote_deadline_at: new Date('2020-01-01T00:00:00Z'),
          confirmedSlot: null,
        },
      }),
    )
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '此活動已截止報名' })
    expect(prisma.activityParticipant.create).not.toHaveBeenCalled()
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

describe('joinActivity - 報名後人數達標，通知建立者，但不自動成團（Reaching the participant target never auto-confirms an activity）', () => {
  it('情境一（免投票）達標時轉入 voting 並通知建立者，不再停留 recruiting、也不自動 confirmed', async () => {
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

    expect(prisma.activity.update).toHaveBeenCalledWith({ where: { id: ACTIVITY_ID }, data: { status: 'voting' } })
    expect(prisma.activitySchedule.update).not.toHaveBeenCalled()
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { user_id: CREATOR_ID, type: 'formation_ready', reference_id: ACTIVITY_ID, reference_type: 'activity' },
    })
    expect(res.json).toHaveBeenCalledWith({ message: '報名成功' })
  })

  it('投票制達標且全員一致時仍轉 voting、不自動成團，交由建立者手動確認', async () => {
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

    expect(prisma.activity.update).toHaveBeenCalledWith({ where: { id: ACTIVITY_ID }, data: { status: 'voting' } })
    expect(prisma.activitySchedule.update).not.toHaveBeenCalled()
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { user_id: CREATOR_ID, type: 'formation_ready', reference_id: ACTIVITY_ID, reference_type: 'activity' },
    })
  })

  it('建立者在收到通知後手動呼叫 confirmFormation 能正常成團', async () => {
    const slotA = makeSlot('slot-a', {
      slot_start: new Date('2026-08-01T10:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
      availabilities: [{ candidate_slot_id: 'slot-a' }],
    })
    const slotB = makeSlot('slot-b', {
      slot_start: new Date('2026-08-02T10:00:00Z'),
      slot_end: new Date('2026-08-02T12:00:00Z'),
      availabilities: [],
    })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'voting',
        candidateSlots: [slotA, slotB],
        schedule: { requires_voting: true, deadline_at: new Date(), confirmedSlot: null },
      }),
    )
    const res = makeRes()

    await confirmFormation(makeReq({ body: { candidateSlotId: 'slot-a' } }), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'voting' },
      data: { status: 'confirmed' },
    })
    expect(prisma.activitySchedule.update).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID },
      data: { confirmed_slot_id: 'slot-a' },
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
      data: { user_id: CREATOR_ID, type: 'formation_ready', reference_id: ACTIVITY_ID, reference_type: 'activity' },
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
      data: [{ candidate_slot_id: 'slot-b', user_id: PARTICIPANT_ID, range_start: null, range_end: null }],
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

describe('joinActivity - Scenario D slot resubmission during recruiting', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)))
    prisma.activity.updateMany.mockResolvedValue({ count: 1 })
  })

  function makeScenarioDActivity(overrides = {}) {
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
          slot_start: new Date('2026-08-02T14:00:00Z'),
          slot_end: new Date('2026-08-02T16:00:00Z'),
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
    prisma.activity.findUnique.mockResolvedValue(makeScenarioDActivity())
    prisma.activityParticipant.findUnique.mockResolvedValue({ id: 'participant-row-1', status: 'joined' })
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID, body: { candidateSlotIds: ['slot-b'] } }), res)

    expect(prisma.activityAvailability.deleteMany).toHaveBeenCalledWith({
      where: { user_id: PARTICIPANT_ID, candidateSlot: { activity_id: ACTIVITY_ID } },
    })
    expect(prisma.activityAvailability.createMany).toHaveBeenCalledWith({
      data: [{ candidate_slot_id: 'slot-b', user_id: PARTICIPANT_ID, range_start: null, range_end: null }],
      skipDuplicates: true,
    })
    expect(prisma.activityParticipant.create).not.toHaveBeenCalled()
    expect(prisma.activityParticipant.update).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ message: '報名成功' })
  })

  it.each(['voting', 'confirmed'])('已報名者於 %s 重新送 candidateSlotIds 時回 400 且不改資料', async (status) => {
    prisma.activity.findUnique.mockResolvedValue(makeScenarioDActivity({ status }))
    prisma.activityParticipant.findUnique.mockResolvedValue({ id: 'participant-row-1', status: 'joined' })
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID, body: { candidateSlotIds: ['slot-b'] } }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activityAvailability.deleteMany).not.toHaveBeenCalled()
    expect(prisma.activityAvailability.createMany).not.toHaveBeenCalled()
  })
})

describe('joinActivity - Participant sub-range within a candidate slot', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)))
    prisma.activity.updateMany.mockResolvedValue({ count: 1 })
    prisma.activityParticipant.findUnique.mockResolvedValue(null)
  })

  function makeScenarioDActivity(overrides = {}) {
    return makeActivity({
      status: 'recruiting',
      participants: [makeParticipant(CREATOR_ID)],
      candidateSlots: [
        makeSlot('slot-a', {
          slot_start: new Date('2026-08-01T10:00:00Z'),
          slot_end: new Date('2026-08-01T12:00:00Z'),
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

  it('子區間落在窗口內時正確寫入 range_start/range_end', async () => {
    prisma.activity.findUnique.mockResolvedValue(makeScenarioDActivity())
    const res = makeRes()

    await joinActivity(
      makeReq({
        userId: PARTICIPANT_ID,
        body: {
          candidateSlotIds: ['slot-a'],
          candidateSlotRanges: [
            { candidateSlotId: 'slot-a', rangeStart: '2026-08-01T10:30:00Z', rangeEnd: '2026-08-01T11:30:00Z' },
          ],
        },
      }),
      res,
    )

    expect(prisma.activityAvailability.createMany).toHaveBeenCalledWith({
      data: [
        {
          candidate_slot_id: 'slot-a',
          user_id: PARTICIPANT_ID,
          range_start: new Date('2026-08-01T10:30:00Z'),
          range_end: new Date('2026-08-01T11:30:00Z'),
        },
      ],
      skipDuplicates: true,
    })
    expect(res.json).toHaveBeenCalledWith({ message: '報名成功' })
  })

  it('子區間超出窗口時回 400 且不寫入任何資料', async () => {
    prisma.activity.findUnique.mockResolvedValue(makeScenarioDActivity())
    const res = makeRes()

    await joinActivity(
      makeReq({
        userId: PARTICIPANT_ID,
        body: {
          candidateSlotIds: ['slot-a'],
          candidateSlotRanges: [
            { candidateSlotId: 'slot-a', rangeStart: '2026-08-01T09:00:00Z', rangeEnd: '2026-08-01T11:30:00Z' },
          ],
        },
      }),
      res,
    )

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activityAvailability.createMany).not.toHaveBeenCalled()
    expect(prisma.activityParticipant.create).not.toHaveBeenCalled()
  })

  it('沒有對應 range 的 candidateSlotIds 仍正常計票、range_start/range_end 為 null', async () => {
    prisma.activity.findUnique.mockResolvedValue(makeScenarioDActivity())
    const res = makeRes()

    await joinActivity(
      makeReq({ userId: PARTICIPANT_ID, body: { candidateSlotIds: ['slot-a'] } }),
      res,
    )

    expect(prisma.activityAvailability.createMany).toHaveBeenCalledWith({
      data: [{ candidate_slot_id: 'slot-a', user_id: PARTICIPANT_ID, range_start: null, range_end: null }],
      skipDuplicates: true,
    })
    expect(res.json).toHaveBeenCalledWith({ message: '報名成功' })
  })
})

describe('getActivity - Formation decision candidates are not filtered to only the leading option', () => {
  it('候選時段 X 3 票、Y 2 票時，decision_candidates 同時包含兩者且 X 排在前面', async () => {
    const slotX = makeSlot('slot-x', {
      slot_start: new Date('2026-08-01T10:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
      availabilities: [
        { candidate_slot_id: 'slot-x' },
        { candidate_slot_id: 'slot-x' },
        { candidate_slot_id: 'slot-x' },
      ],
    })
    const slotY = makeSlot('slot-y', {
      slot_start: new Date('2026-08-02T10:00:00Z'),
      slot_end: new Date('2026-08-02T12:00:00Z'),
      availabilities: [{ candidate_slot_id: 'slot-y' }, { candidate_slot_id: 'slot-y' }],
    })
    const activity = makeActivity({
      candidateSlots: [slotY, slotX],
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          decision_candidates: [
            expect.objectContaining({ id: 'slot-x', count: 3 }),
            expect.objectContaining({ id: 'slot-y', count: 2 }),
          ],
        }),
      }),
    )
  })

  it('find_date 活動每筆 decision_candidates 正確包含 count、是否全員一致、與 supporters（兩個真人參與者都投同一時段）', async () => {
    const slotX = makeSlot('slot-x', {
      slot_start: new Date('2026-08-01T10:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
      availabilities: [
        { candidate_slot_id: 'slot-x', user_id: PARTICIPANT_ID },
        { candidate_slot_id: 'slot-x', user_id: 'participant-2' },
      ],
    })
    const slotY = makeSlot('slot-y', {
      slot_start: new Date('2026-08-02T10:00:00Z'),
      slot_end: new Date('2026-08-02T12:00:00Z'),
      availabilities: [],
    })
    const activity = makeActivity({
      candidateSlots: [slotX, slotY],
      // 全員一致的分母排除建立者，2 筆 availability 對應 2 個真人參與者才會判定一致
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID), makeParticipant('participant-2')],
      schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          decision_candidates: [
            expect.objectContaining({
              id: 'slot-x',
              count: 2,
              is_unanimous: true,
              supporters: expect.arrayContaining([
                { user_id: PARTICIPANT_ID, display_name: PARTICIPANT_ID, avatar_url: null },
                { user_id: 'participant-2', display_name: 'participant-2', avatar_url: null },
              ]),
            }),
            expect.objectContaining({ id: 'slot-y', count: 0, is_unanimous: false, supporters: [] }),
          ],
        }),
      }),
    )
  })

  it('只有 1 個真人參與者投給某候選時段時，count 正確等於 1，不會被建立者的幽靈投票灌成 2', async () => {
    // 需要至少兩個不同日期、相同時間形狀的候選時段，deriveScheduleVariant 才會判定成
    // find_date（情境三），否則單一候選時段會被判定成 find_date_time（情境四）分支
    const slotX = makeSlot('slot-x', {
      slot_start: new Date('2026-08-01T10:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
      availabilities: [{ candidate_slot_id: 'slot-x' }],
    })
    const slotY = makeSlot('slot-y', {
      slot_start: new Date('2026-08-02T10:00:00Z'),
      slot_end: new Date('2026-08-02T12:00:00Z'),
      availabilities: [],
    })
    const activity = makeActivity({
      candidateSlots: [slotX, slotY],
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          decision_candidates: expect.arrayContaining([
            expect.objectContaining({ id: 'slot-x', count: 1, is_unanimous: true }),
          ]),
        }),
      }),
    )
  })

  it('情境四只有 1 個真人參與者提交子區間時，decision_candidates 該候選時段的 count 正確等於 1，不是 2，內層 segments 帶 supporters', async () => {
    // 單一候選時段（不觸發 isUniformMultiDateSlotVoting）會被判定成 find_date_time（情境四）分支
    const slotX = makeSlot('slot-x', {
      slot_start: new Date('2026-08-01T09:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
      availabilities: [
        {
          candidate_slot_id: 'slot-x',
          user_id: PARTICIPANT_ID,
          range_start: new Date('2026-08-01T10:00:00Z'),
          range_end: new Date('2026-08-01T11:00:00Z'),
        },
      ],
    })
    const activity = makeActivity({
      candidateSlots: [slotX],
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          schedule_variant: 'find_date_time',
          decision_candidates: [
            expect.objectContaining({
              id: 'slot-x',
              slot_start: slotX.slot_start,
              slot_end: slotX.slot_end,
              count: 1,
              segments: [
                expect.objectContaining({
                  slot_start: new Date('2026-08-01T10:00:00Z'),
                  slot_end: new Date('2026-08-01T11:00:00Z'),
                  count: 1,
                  is_unanimous: true,
                  supporters: [{ user_id: PARTICIPANT_ID, display_name: PARTICIPANT_ID, avatar_url: null }],
                }),
              ],
            }),
          ],
        }),
      }),
    )
  })

  it('情境四：非建立者請求時 decision_candidates 為 null；建立者不受影響', async () => {
    const slotX = makeSlot('slot-x', {
      slot_start: new Date('2026-08-01T09:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
      availabilities: [
        {
          candidate_slot_id: 'slot-x',
          user_id: PARTICIPANT_ID,
          range_start: new Date('2026-08-01T10:00:00Z'),
          range_end: new Date('2026-08-01T11:00:00Z'),
        },
      ],
    })
    const activity = makeActivity({
      candidateSlots: [slotX],
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)

    const nonCreatorRes = makeRes()
    await getActivity(makeReq({ userId: PARTICIPANT_ID }), nonCreatorRes)
    expect(nonCreatorRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ activity: expect.objectContaining({ decision_candidates: null }) }),
    )

    const creatorRes = makeRes()
    await getActivity(makeReq(), creatorRes)
    expect(creatorRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          decision_candidates: expect.arrayContaining([expect.objectContaining({ id: 'slot-x', count: 1 })]),
        }),
      }),
    )
  })

  it('情境四：candidate_slots co_participants 用子區間交集運算篩出跟自己重疊的人，沒填子區間視為整個窗口，未選的候選時段是空陣列', async () => {
    // design.md 的三參與者範例：候選時段 09:00-12:00，A 09:00-10:00、B 09:30-11:00、C 無子區間
    const slotX = makeSlot('slot-x', {
      slot_start: new Date('2026-08-01T09:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
      availabilities: [
        {
          candidate_slot_id: 'slot-x',
          user_id: PARTICIPANT_ID, // A
          range_start: new Date('2026-08-01T09:00:00Z'),
          range_end: new Date('2026-08-01T10:00:00Z'),
        },
        {
          candidate_slot_id: 'slot-x',
          user_id: 'participant-2', // B：跟 A 的子區間重疊（09:30-11:00 vs 09:00-10:00）
          range_start: new Date('2026-08-01T09:30:00Z'),
          range_end: new Date('2026-08-01T11:00:00Z'),
        },
        {
          candidate_slot_id: 'slot-x',
          user_id: 'participant-3', // C：沒填子區間，視為整個候選時段都覆蓋，理應跟 A 也重疊
          range_start: null,
          range_end: null,
        },
      ],
    })
    const slotY = makeSlot('slot-y', {
      slot_start: new Date('2026-08-03T09:00:00Z'),
      slot_end: new Date('2026-08-03T10:00:00Z'),
      availabilities: [],
    })
    const activity = makeActivity({
      candidateSlots: [slotX, slotY],
      participants: [
        makeParticipant(CREATOR_ID),
        makeParticipant(PARTICIPANT_ID),
        makeParticipant('participant-2'),
        makeParticipant('participant-3'),
      ],
      schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          candidate_slots: [
            expect.objectContaining({
              id: 'slot-x',
              is_selected: true,
              co_participants: expect.arrayContaining([
                expect.objectContaining({ user_id: 'participant-2' }),
                expect.objectContaining({ user_id: 'participant-3' }),
              ]),
            }),
            expect.objectContaining({ id: 'slot-y', is_selected: false, co_participants: [] }),
          ],
        }),
      }),
    )
    const responseBody = res.json.mock.calls[0][0]
    const slotXResult = responseBody.activity.candidate_slots.find((s) => s.id === 'slot-x')
    expect(slotXResult.co_participants).toHaveLength(2)
  })

  it('情境四：建立者自己的 availability 紀錄（即使殘留在資料庫裡）不會被算進 count 或 supporters', async () => {
    // 重現真實環境觀察到的問題：候選時段底下同時有建立者自己的 availability（沒填子區間，
    // 視為整個候選時段都覆蓋）跟一個真人參與者的子區間，count/supporters 都不該包含建立者，
    // 否則會出現「2/1人」這種 count 超過真人分母的不合理比例
    const slotX = makeSlot('slot-x', {
      slot_start: new Date('2026-08-01T09:00:00Z'),
      slot_end: new Date('2026-08-01T11:00:00Z'),
      availabilities: [
        { candidate_slot_id: 'slot-x', user_id: CREATOR_ID, range_start: null, range_end: null },
        {
          candidate_slot_id: 'slot-x',
          user_id: PARTICIPANT_ID,
          range_start: new Date('2026-08-01T10:00:00Z'),
          range_end: new Date('2026-08-01T11:00:00Z'),
        },
      ],
    })
    const activity = makeActivity({
      candidateSlots: [slotX],
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          decision_candidates: [
            expect.objectContaining({
              id: 'slot-x',
              count: 1, // 只有真人參與者算，不含建立者
              segments: [
                expect.objectContaining({
                  slot_start: new Date('2026-08-01T10:00:00Z'),
                  slot_end: new Date('2026-08-01T11:00:00Z'),
                  count: 1,
                  is_unanimous: true,
                  supporters: [{ user_id: PARTICIPANT_ID, display_name: PARTICIPANT_ID, avatar_url: null }],
                }),
              ],
            }),
          ],
        }),
      }),
    )
  })

  it('情境三：建立者自己的 availability 紀錄不會被算進 count 或 supporters', async () => {
    const slotX = makeSlot('slot-x', {
      slot_start: new Date('2026-08-01T10:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
      availabilities: [
        { candidate_slot_id: 'slot-x', user_id: CREATOR_ID },
        { candidate_slot_id: 'slot-x', user_id: PARTICIPANT_ID },
      ],
    })
    const slotY = makeSlot('slot-y', {
      slot_start: new Date('2026-08-02T10:00:00Z'),
      slot_end: new Date('2026-08-02T12:00:00Z'),
      availabilities: [],
    })
    const activity = makeActivity({
      candidateSlots: [slotX, slotY],
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          decision_candidates: expect.arrayContaining([
            expect.objectContaining({
              id: 'slot-x',
              count: 1,
              is_unanimous: true,
              supporters: [{ user_id: PARTICIPANT_ID, display_name: PARTICIPANT_ID, avatar_url: null }],
            }),
          ]),
        }),
      }),
    )
  })
})

describe('getActivity - 情境一（fixed，免投票）建立者可見已報名人數與頭像', () => {
  it('回應正確包含 current_count 與 participants（含 display_name/avatar_url），確認後端資料層沒有缺漏', async () => {
    const activity = makeActivity({
      schedule: { requires_voting: false, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
      participants: [
        makeParticipant(CREATOR_ID, { user: { id: CREATOR_ID, display_name: '創建者', avatar_url: 'creator.png' } }),
        makeParticipant(PARTICIPANT_ID, { user: { id: PARTICIPANT_ID, display_name: '小明', avatar_url: 'p1.png' } }),
      ],
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          schedule_variant: 'fixed',
          current_count: 2,
          participants: [
            { id: CREATOR_ID, display_name: '創建者', avatar_url: 'creator.png' },
            { id: PARTICIPANT_ID, display_name: '小明', avatar_url: 'p1.png' },
          ],
        }),
      }),
    )
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

describe('getActivity - 情境三（find_date）decision_candidates 限定建立者、candidate_slots 新增 co_participants', () => {
  function makeScenarioCActivity(overrides = {}) {
    const slotX = makeSlot('slot-x', {
      slot_start: new Date('2026-08-01T10:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
      availabilities: [
        { candidate_slot_id: 'slot-x', user_id: PARTICIPANT_ID },
        { candidate_slot_id: 'slot-x', user_id: 'participant-2' },
      ],
    })
    const slotY = makeSlot('slot-y', {
      slot_start: new Date('2026-08-02T10:00:00Z'),
      slot_end: new Date('2026-08-02T12:00:00Z'),
      availabilities: [{ candidate_slot_id: 'slot-y', user_id: 'participant-3' }],
    })
    return makeActivity({
      candidateSlots: [slotX, slotY],
      participants: [
        makeParticipant(CREATOR_ID),
        makeParticipant(PARTICIPANT_ID),
        makeParticipant('participant-2'),
        makeParticipant('participant-3'),
      ],
      schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
      ...overrides,
    })
  }

  it('非建立者請求時 decision_candidates 為 null；建立者不受影響', async () => {
    const activity = makeScenarioCActivity()
    prisma.activity.findUnique.mockResolvedValue(activity)

    const nonCreatorRes = makeRes()
    await getActivity(makeReq({ userId: PARTICIPANT_ID }), nonCreatorRes)
    expect(nonCreatorRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ activity: expect.objectContaining({ decision_candidates: null }) }),
    )

    const creatorRes = makeRes()
    await getActivity(makeReq(), creatorRes)
    expect(creatorRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          decision_candidates: expect.arrayContaining([expect.objectContaining({ id: 'slot-x', count: 2 })]),
        }),
      }),
    )
  })

  it('candidate_slots co_participants：同一天互相看得到，不同天看不到，未選的候選時段是空陣列', async () => {
    const activity = makeScenarioCActivity()
    prisma.activity.findUnique.mockResolvedValue(activity)
    const res = makeRes()

    await getActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        activity: expect.objectContaining({
          candidate_slots: [
            expect.objectContaining({
              id: 'slot-x',
              is_selected: true,
              co_participants: [
                expect.objectContaining({ user_id: 'participant-2' }),
              ],
            }),
            expect.objectContaining({
              id: 'slot-y',
              is_selected: false,
              co_participants: [],
            }),
          ],
        }),
      }),
    )
  })
})

describe('getActivity - Activity detail exposes the current user\'s selected sub-range per candidate slot', () => {
  it('使用者有存子區間時 my_range 正確回傳 {start, end}', async () => {
    const slotA = makeSlot('slot-a', {
      availabilities: [
        {
          candidate_slot_id: 'slot-a',
          user_id: PARTICIPANT_ID,
          range_start: new Date('2026-08-01T10:30:00Z'),
          range_end: new Date('2026-08-01T11:30:00Z'),
        },
      ],
    })
    const activity = makeActivity({
      candidateSlots: [slotA],
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
            expect.objectContaining({
              id: 'slot-a',
              my_range: { start: '2026-08-01T10:30:00.000Z', end: '2026-08-01T11:30:00.000Z' },
            }),
          ],
        }),
      }),
    )
  })

  it('使用者投票但沒有子區間、或完全沒投該時段時 my_range 為 null', async () => {
    const slotA = makeSlot('slot-a', {
      availabilities: [{ candidate_slot_id: 'slot-a', user_id: PARTICIPANT_ID, range_start: null, range_end: null }],
    })
    const slotB = makeSlot('slot-b', { availabilities: [] })
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
            expect.objectContaining({ id: 'slot-a', my_range: null }),
            expect.objectContaining({ id: 'slot-b', my_range: null }),
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

  it.each(['confirmed', 'cancelled'])('免投票活動在 %s 狀態不能確認成團', async (status) => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({ status, schedule: { requires_voting: false, deadline_at: new Date(), confirmedSlot: null } }),
    )
    const res = makeRes()

    await confirmFormation(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '此活動狀態不允許確認成團' })
  })

  it('免投票活動轉入 voting 後（例如報名截止但決策硬截止還沒到）仍可成功確認成團', async () => {
    const slot = makeSlot('slot-1')
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'voting',
        candidateSlots: [slot],
        schedule: { requires_voting: false, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
      }),
    )
    const res = makeRes()

    await confirmFormation(makeReq(), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'voting' },
      data: { status: 'confirmed' },
    })
    expect(prisma.activitySchedule.update).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID },
      data: { confirmed_slot_id: 'slot-1' },
    })
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

  it.each(['recruiting', 'voting'])('情境三活動可以從 %s 確認成團（建立者可提前手動成團）', async (status) => {
    // 兩個候選時段、不同日期、相同時間形狀 -> deriveScheduleVariant 判定為 find_date（情境三）
    const slotA = makeSlot('slot-a', {
      slot_start: new Date('2026-08-01T10:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
      availabilities: [{ candidate_slot_id: 'slot-a' }],
    })
    const slotB = makeSlot('slot-b', {
      slot_start: new Date('2026-08-02T10:00:00Z'),
      slot_end: new Date('2026-08-02T12:00:00Z'),
      availabilities: [],
    })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status,
        candidateSlots: [slotA, slotB],
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

  it('情境三可以確認非最高票的候選時段（建立者自由選，不限並列最高票）', async () => {
    const slotA = makeSlot('slot-a', {
      slot_start: new Date('2026-08-01T10:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
      availabilities: [{ candidate_slot_id: 'slot-a' }, { candidate_slot_id: 'slot-a' }, { candidate_slot_id: 'slot-a' }],
    })
    const slotB = makeSlot('slot-b', {
      slot_start: new Date('2026-08-02T10:00:00Z'),
      slot_end: new Date('2026-08-02T12:00:00Z'),
      availabilities: [{ candidate_slot_id: 'slot-b' }, { candidate_slot_id: 'slot-b' }],
    })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'voting',
        candidateSlots: [slotA, slotB],
        schedule: { requires_voting: true, deadline_at: new Date(), confirmedSlot: null },
      }),
    )
    const res = makeRes()

    // slot-a 3 票、slot-b 2 票，建立者選票數較低的 slot-b
    await confirmFormation(makeReq({ body: { candidateSlotId: 'slot-b' } }), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'voting' },
      data: { status: 'confirmed' },
    })
    expect(prisma.activitySchedule.update).toHaveBeenCalledWith({
      where: { activity_id: ACTIVITY_ID },
      data: { confirmed_slot_id: 'slot-b' },
    })
  })

  it('情境三選擇不屬於此活動的候選時段會被拒絕', async () => {
    const slotA = makeSlot('slot-a', {
      slot_start: new Date('2026-08-01T10:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
    })
    const slotB = makeSlot('slot-b', {
      slot_start: new Date('2026-08-02T10:00:00Z'),
      slot_end: new Date('2026-08-02T12:00:00Z'),
    })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'voting',
        candidateSlots: [slotA, slotB],
        schedule: { requires_voting: true, deadline_at: new Date(), confirmedSlot: null },
      }),
    )
    const res = makeRes()

    await confirmFormation(makeReq({ body: { candidateSlotId: 'slot-not-exist' } }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '此候選時段不在可確認的名單中' })
    expect(prisma.activity.updateMany).not.toHaveBeenCalled()
  })

  describe('情境四：confirmFormation 從交集運算排名挑選窄窗口', () => {
    function makeScenarioDSlot(overrides = {}) {
      return makeSlot('slot-d', {
        slot_start: new Date('2026-08-01T09:00:00Z'),
        slot_end: new Date('2026-08-01T12:00:00Z'),
        availabilities: [],
        ...overrides,
      })
    }

    it('確認一個交集運算算出的窄窗口，正確建立新候選時段並設為 confirmed_slot_id', async () => {
      const slotD = makeScenarioDSlot({
        availabilities: [
          { candidate_slot_id: 'slot-d', user_id: PARTICIPANT_ID, range_start: new Date('2026-08-01T09:00:00Z'), range_end: new Date('2026-08-01T10:00:00Z') },
          { candidate_slot_id: 'slot-d', user_id: 'participant-2', range_start: new Date('2026-08-01T09:30:00Z'), range_end: new Date('2026-08-01T11:00:00Z') },
        ],
      })
      prisma.activity.findUnique.mockResolvedValue(
        makeActivity({
          status: 'voting',
          candidateSlots: [slotD],
          schedule: { requires_voting: true, deadline_at: new Date(), confirmedSlot: null },
        }),
      )
      prisma.activityCandidateSlot.create.mockResolvedValue({ id: 'new-slot-1' })
      const res = makeRes()

      await confirmFormation(
        makeReq({
          body: {
            candidateSlotId: 'slot-d',
            slotStart: '2026-08-01T09:00:00.000Z',
            slotEnd: '2026-08-01T10:00:00.000Z',
          },
        }),
        res,
      )

      expect(prisma.activityCandidateSlot.create).toHaveBeenCalledWith({
        data: {
          activity_id: ACTIVITY_ID,
          slot_start: new Date('2026-08-01T09:00:00.000Z'),
          slot_end: new Date('2026-08-01T10:00:00.000Z'),
          all_day: false,
        },
      })
      expect(prisma.activitySchedule.update).toHaveBeenCalledWith({
        where: { activity_id: ACTIVITY_ID },
        data: { confirmed_slot_id: 'new-slot-1' },
      })
    })

    it('送出的時間不在交集運算排名清單裡時回 400', async () => {
      const slotD = makeScenarioDSlot({
        availabilities: [
          { candidate_slot_id: 'slot-d', range_start: null, range_end: null },
        ],
      })
      prisma.activity.findUnique.mockResolvedValue(
        makeActivity({
          status: 'voting',
          candidateSlots: [slotD],
          schedule: { requires_voting: true, deadline_at: new Date(), confirmedSlot: null },
        }),
      )
      const res = makeRes()

      await confirmFormation(
        makeReq({
          body: {
            candidateSlotId: 'slot-d',
            // 這個候選時段是 09:00~12:00，13:00~14:00 完全在範圍外，不會出現在交集運算結果裡
            slotStart: '2026-08-01T13:00:00.000Z',
            slotEnd: '2026-08-01T14:00:00.000Z',
          },
        }),
        res,
      )

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ message: '此候選時段不在可確認的名單中' })
      expect(prisma.activity.updateMany).not.toHaveBeenCalled()
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

describe('confirmFormation - 拒絕確認開始時間已經過去的候選時段/時段（四情境皆適用）', () => {
  it('情境一（免投票）：唯一候選時段已經過去時回 400，不寫入 confirmed_slot_id', async () => {
    const expiredSlot = makeSlot('slot-1', {
      slot_start: new Date('2020-01-01T10:00:00Z'),
      slot_end: new Date('2020-01-01T12:00:00Z'),
    })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'recruiting',
        candidateSlots: [expiredSlot],
        schedule: { requires_voting: false, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
      }),
    )
    const res = makeRes()

    await confirmFormation(makeReq(), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activity.updateMany).not.toHaveBeenCalled()
    expect(prisma.activitySchedule.update).not.toHaveBeenCalled()
  })

  it('情境三（find_date）：選擇的候選時段已經過去時回 400，不寫入 confirmed_slot_id', async () => {
    const expiredSlot = makeSlot('slot-a', {
      slot_start: new Date('2020-08-01T10:00:00Z'),
      slot_end: new Date('2020-08-01T12:00:00Z'),
      availabilities: [{ candidate_slot_id: 'slot-a' }],
    })
    const futureSlot = makeSlot('slot-b', {
      slot_start: new Date('2026-08-02T10:00:00Z'),
      slot_end: new Date('2026-08-02T12:00:00Z'),
    })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'voting',
        candidateSlots: [expiredSlot, futureSlot],
        schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
      }),
    )
    const res = makeRes()

    await confirmFormation(makeReq({ body: { candidateSlotId: 'slot-a' } }), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activity.updateMany).not.toHaveBeenCalled()
    expect(prisma.activitySchedule.update).not.toHaveBeenCalled()
  })

  it('情境四（find_date_time）：交集運算算出的窄窗口 slotStart 已經過去時回 400，不建立新候選時段', async () => {
    const slotD = makeSlot('slot-d', {
      slot_start: new Date('2020-01-01T09:00:00Z'),
      slot_end: new Date('2020-01-01T12:00:00Z'),
      availabilities: [
        {
          candidate_slot_id: 'slot-d',
          user_id: PARTICIPANT_ID,
          range_start: new Date('2020-01-01T09:00:00Z'),
          range_end: new Date('2020-01-01T10:00:00Z'),
        },
      ],
    })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'voting',
        candidateSlots: [slotD],
        schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
      }),
    )
    const res = makeRes()

    await confirmFormation(
      makeReq({
        body: {
          candidateSlotId: 'slot-d',
          slotStart: new Date('2020-01-01T09:00:00Z'),
          slotEnd: new Date('2020-01-01T10:00:00Z'),
        },
      }),
      res,
    )

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.activityCandidateSlot.create).not.toHaveBeenCalled()
    expect(prisma.activitySchedule.update).not.toHaveBeenCalled()
  })

  it('仍是未來的候選時段可以正常確認成團（回歸測試，鎖住現況行為）', async () => {
    // 兩個候選時段、不同日期、相同時間形狀 -> deriveScheduleVariant 判定為 find_date（情境三），
    // 只需要 candidateSlotId，不需要 slotStart/slotEnd
    const slotA = makeSlot('slot-a', {
      slot_start: new Date('2026-08-01T10:00:00Z'),
      slot_end: new Date('2026-08-01T12:00:00Z'),
      availabilities: [{ candidate_slot_id: 'slot-a' }],
    })
    const slotB = makeSlot('slot-b', {
      slot_start: new Date('2026-08-02T10:00:00Z'),
      slot_end: new Date('2026-08-02T12:00:00Z'),
      availabilities: [],
    })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'voting',
        candidateSlots: [slotA, slotB],
        schedule: { requires_voting: true, deadline_at: new Date('2099-01-01T00:00:00Z'), confirmedSlot: null },
      }),
    )
    const res = makeRes()

    await confirmFormation(makeReq({ body: { candidateSlotId: 'slot-a' } }), res)

    expect(prisma.activity.updateMany).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, status: 'voting' },
      data: { status: 'confirmed' },
    })
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

describe('lazy 狀態轉換的 LINE 推播（LINE push delivery for activity lifecycle notifications）', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$queryRaw.mockResolvedValue([])
    prisma.friendship.findMany.mockResolvedValue([])
    prisma.activity.updateMany.mockResolvedValue({ count: 1 })
    prisma.notificationPreference.findUnique.mockResolvedValue(null)
    sendLinePushMessage.mockResolvedValue({ status: 'sent' })
  })

  it('招募截止轉入 voting 後對建立者推播 time_to_pick 文案', async () => {
    const activity = makeActivity({
      schedule: { requires_voting: true, vote_deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-creator' })
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(sendLinePushMessage).toHaveBeenCalledTimes(1)
    expect(sendLinePushMessage).toHaveBeenCalledWith({
      to: 'U-line-creator',
      text: '「揪團活動」候選時段票數不相上下，請選擇最終時段',
    })
  })

  it('招募截止未達標轉 cancelled 後對全體參與者推播 activity_cancelled 文案', async () => {
    const activity = makeActivity({
      participant_target: 3,
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      schedule: { requires_voting: false, vote_deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    prisma.userIdentity.findFirst
      .mockResolvedValueOnce({ provider_user_id: 'U-line-creator' })
      .mockResolvedValueOnce({ provider_user_id: 'U-line-participant' })
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(sendLinePushMessage).toHaveBeenCalledTimes(2)
    expect(sendLinePushMessage).toHaveBeenNthCalledWith(1, {
      to: 'U-line-creator',
      text: '「揪團活動」已取消',
    })
    expect(sendLinePushMessage).toHaveBeenNthCalledWith(2, {
      to: 'U-line-participant',
      text: '「揪團活動」已取消',
    })
  })

  it('決策期逾期自動取消後對全體參與者推播 activity_cancelled 文案', async () => {
    const activity = makeActivity({
      status: 'voting',
      participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      schedule: { requires_voting: true, deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique.mockResolvedValue(activity)
    prisma.userIdentity.findFirst
      .mockResolvedValueOnce({ provider_user_id: 'U-line-creator' })
      .mockResolvedValueOnce({ provider_user_id: 'U-line-participant' })
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(sendLinePushMessage).toHaveBeenCalledTimes(2)
    expect(sendLinePushMessage).toHaveBeenNthCalledWith(1, {
      to: 'U-line-creator',
      text: '「揪團活動」已取消',
    })
    expect(sendLinePushMessage).toHaveBeenNthCalledWith(2, {
      to: 'U-line-participant',
      text: '「揪團活動」已取消',
    })
  })

  it('樂觀鎖敗者（另一請求已完成轉換）不推播', async () => {
    const activity = makeActivity({
      participant_target: 3,
      participants: [makeParticipant(CREATOR_ID)],
      schedule: { requires_voting: false, vote_deadline_at: new Date('2020-01-01T00:00:00Z'), confirmedSlot: null },
    })
    prisma.activity.findUnique
      .mockResolvedValueOnce(activity)
      .mockResolvedValueOnce({ status: 'cancelled', schedule: { confirmedSlot: null } })
    prisma.activity.updateMany.mockResolvedValueOnce({ count: 0 })
    prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-creator' })
    const res = makeRes()

    await getActivity(makeReq(), res)

    expect(sendLinePushMessage).not.toHaveBeenCalled()
  })
})

describe('joinActivity／confirmFormation／cancelActivity 的 LINE 推播接線', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$queryRaw.mockResolvedValue([])
    prisma.friendship.findMany.mockResolvedValue([])
    prisma.activity.updateMany.mockResolvedValue({ count: 1 })
    prisma.notificationPreference.findUnique.mockResolvedValue(null)
    sendLinePushMessage.mockResolvedValue({ status: 'sent' })
  })

  it('報名達標後對建立者推播 formation_ready 文案，且仍回報名成功', async () => {
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
    prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-creator' })
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(sendLinePushMessage).toHaveBeenCalledTimes(1)
    expect(sendLinePushMessage).toHaveBeenCalledWith({
      to: 'U-line-creator',
      text: '「揪團活動」人數已滿，請確認成團',
    })
    expect(res.json).toHaveBeenCalledWith({ message: '報名成功' })
  })

  it('確認成團後對其他參與者推播 activity_confirmed 文案，建立者自己不收推播', async () => {
    const slotA = makeSlot('slot-a', {
      slot_start: new Date('2099-08-01T10:00:00Z'),
      slot_end: new Date('2099-08-01T12:00:00Z'),
      availabilities: [{ candidate_slot_id: 'slot-a' }],
    })
    const slotB = makeSlot('slot-b', {
      slot_start: new Date('2099-08-02T10:00:00Z'),
      slot_end: new Date('2099-08-02T12:00:00Z'),
      availabilities: [],
    })
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'voting',
        participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
        candidateSlots: [slotA, slotB],
        schedule: { requires_voting: true, deadline_at: new Date(), confirmedSlot: null },
      }),
    )
    prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-participant' })
    const res = makeRes()

    await confirmFormation(makeReq({ body: { candidateSlotId: 'slot-a' } }), res)

    expect(sendLinePushMessage).toHaveBeenCalledTimes(1)
    expect(sendLinePushMessage).toHaveBeenCalledWith({
      to: 'U-line-participant',
      text: '「揪團活動」已確認成團',
    })
    expect(res.json).toHaveBeenCalledWith({ message: '成團成功' })
  })

  it('建立者手動取消後對其他參與者推播 activity_cancelled 文案', async () => {
    prisma.activity.findUnique.mockResolvedValue(
      makeActivity({
        status: 'recruiting',
        participants: [makeParticipant(CREATOR_ID), makeParticipant(PARTICIPANT_ID)],
      }),
    )
    prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-participant' })
    const res = makeRes()

    await cancelActivity(makeReq(), res)

    expect(sendLinePushMessage).toHaveBeenCalledTimes(1)
    expect(sendLinePushMessage).toHaveBeenCalledWith({
      to: 'U-line-participant',
      text: '「揪團活動」已取消',
    })
    expect(res.json).toHaveBeenCalledWith({ message: '活動已取消' })
  })

  it('LINE 推播拋錯時 API 仍回成功，不影響站內通知', async () => {
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
    prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-creator' })
    sendLinePushMessage.mockRejectedValue(new Error('LINE timeout'))
    const res = makeRes()

    await joinActivity(makeReq({ userId: PARTICIPANT_ID }), res)

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { user_id: CREATOR_ID, type: 'formation_ready', reference_id: ACTIVITY_ID, reference_type: 'activity' },
    })
    expect(res.status).not.toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ message: '報名成功' })
  })
})
