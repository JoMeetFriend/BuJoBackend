import { computeRangeRanking } from '../controllers/activityController.js'

const ALICE = { display_name: 'Alice', avatar_url: 'alice.png' }
const BOB = { display_name: 'Bob', avatar_url: 'bob.png' }
const CAROL = { display_name: 'Carol', avatar_url: 'carol.png' }
const DAVE = { display_name: 'Dave', avatar_url: 'dave.png' }

const participantsById = {
  alice: ALICE,
  bob: BOB,
  carol: CAROL,
  dave: DAVE,
}

describe('computeRangeRanking - 情境二重疊排序演算法（單一排序陣列＋合併＋支持者）', () => {
  it('60 分鐘切格、計算重疊人數，回傳依 count 由高到低排序的單一陣列，含 is_unanimous 與 supporters', () => {
    const windowStart = new Date('2026-08-01T18:00:00Z')
    const windowEnd = new Date('2026-08-01T21:00:00Z')
    const ranges = [
      { start: new Date('2026-08-01T18:00:00Z'), end: new Date('2026-08-01T20:00:00Z'), user_id: 'alice' },
      { start: new Date('2026-08-01T19:00:00Z'), end: new Date('2026-08-01T21:00:00Z'), user_id: 'bob' },
    ]

    const result = computeRangeRanking(ranges, windowStart, windowEnd, 2, participantsById)

    expect(result[0]).toEqual(
      expect.objectContaining({
        slot_start: new Date('2026-08-01T19:00:00Z'),
        slot_end: new Date('2026-08-01T20:00:00Z'),
        count: 2,
        is_unanimous: true,
      }),
    )
    expect(result[0].supporters).toEqual(
      expect.arrayContaining([
        { user_id: 'alice', display_name: 'Alice', avatar_url: 'alice.png' },
        { user_id: 'bob', display_name: 'Bob', avatar_url: 'bob.png' },
      ]),
    )
    expect(result[0].id).toMatch(/^temp-/)
    expect(result.slice(1)).toEqual([
      expect.objectContaining({
        slot_start: new Date('2026-08-01T18:00:00Z'),
        slot_end: new Date('2026-08-01T19:00:00Z'),
        count: 1,
        is_unanimous: false,
      }),
      expect.objectContaining({
        slot_start: new Date('2026-08-01T20:00:00Z'),
        slot_end: new Date('2026-08-01T21:00:00Z'),
        count: 1,
        is_unanimous: false,
      }),
    ])
  })

  it('零提交時回傳空陣列', () => {
    const windowStart = new Date('2026-08-01T18:00:00Z')
    const windowEnd = new Date('2026-08-01T21:00:00Z')

    const result = computeRangeRanking([], windowStart, windowEnd, 2, {})

    expect(result).toEqual([])
  })

  it('零重疊時仍然包含非全員一致的格子，不會被濾掉', () => {
    const windowStart = new Date('2026-08-01T18:00:00Z')
    const windowEnd = new Date('2026-08-01T20:00:00Z')
    const ranges = [
      { start: new Date('2026-08-01T18:00:00Z'), end: new Date('2026-08-01T19:00:00Z'), user_id: 'alice' },
    ]

    const result = computeRangeRanking(ranges, windowStart, windowEnd, 3, participantsById)

    expect(result).toEqual([
      expect.objectContaining({
        slot_start: new Date('2026-08-01T18:00:00Z'),
        slot_end: new Date('2026-08-01T19:00:00Z'),
        count: 1,
        is_unanimous: false,
      }),
    ])
  })

  it('相鄰、票數相同、支持者相同的格子合併成一筆', () => {
    const windowStart = new Date('2026-08-01T09:00:00Z')
    const windowEnd = new Date('2026-08-01T12:00:00Z')
    const ranges = [
      { start: new Date('2026-08-01T09:00:00Z'), end: new Date('2026-08-01T12:00:00Z'), user_id: 'alice' },
    ]

    const result = computeRangeRanking(ranges, windowStart, windowEnd, 1, participantsById)

    expect(result).toEqual([
      expect.objectContaining({
        slot_start: new Date('2026-08-01T09:00:00Z'),
        slot_end: new Date('2026-08-01T12:00:00Z'),
        count: 1,
        is_unanimous: true,
      }),
    ])
  })

  it('票數中途變化時正確斷開成不同筆（design.md 範例：Alice 18:00-19:00、Bob 18:00-21:00）', () => {
    const windowStart = new Date('2026-08-01T18:00:00Z')
    const windowEnd = new Date('2026-08-01T21:00:00Z')
    const ranges = [
      { start: new Date('2026-08-01T18:00:00Z'), end: new Date('2026-08-01T19:00:00Z'), user_id: 'alice' },
      { start: new Date('2026-08-01T18:00:00Z'), end: new Date('2026-08-01T21:00:00Z'), user_id: 'bob' },
    ]

    const result = computeRangeRanking(ranges, windowStart, windowEnd, 2, participantsById)

    expect(result).toEqual([
      expect.objectContaining({
        slot_start: new Date('2026-08-01T18:00:00Z'),
        slot_end: new Date('2026-08-01T19:00:00Z'),
        count: 2,
        is_unanimous: true,
      }),
      expect.objectContaining({
        slot_start: new Date('2026-08-01T19:00:00Z'),
        slot_end: new Date('2026-08-01T21:00:00Z'),
        count: 1,
        is_unanimous: false,
      }),
    ])
  })

  it('票數相同但支持者不同（交接情境）不會合併', () => {
    const windowStart = new Date('2026-08-01T09:00:00Z')
    const windowEnd = new Date('2026-08-01T11:00:00Z')
    const ranges = [
      { start: new Date('2026-08-01T09:00:00Z'), end: new Date('2026-08-01T10:00:00Z'), user_id: 'alice' },
      { start: new Date('2026-08-01T10:00:00Z'), end: new Date('2026-08-01T11:00:00Z'), user_id: 'bob' },
    ]

    const result = computeRangeRanking(ranges, windowStart, windowEnd, 2, participantsById)

    expect(result).toEqual([
      expect.objectContaining({
        slot_start: new Date('2026-08-01T09:00:00Z'),
        slot_end: new Date('2026-08-01T10:00:00Z'),
        count: 1,
      }),
      expect.objectContaining({
        slot_start: new Date('2026-08-01T10:00:00Z'),
        slot_end: new Date('2026-08-01T11:00:00Z'),
        count: 1,
      }),
    ])
    expect(result[0].supporters).toEqual([{ user_id: 'alice', display_name: 'Alice', avatar_url: 'alice.png' }])
    expect(result[1].supporters).toEqual([{ user_id: 'bob', display_name: 'Bob', avatar_url: 'bob.png' }])
  })

  it('平手的筆依時間先後排序', () => {
    const windowStart = new Date('2026-08-01T09:00:00Z')
    const windowEnd = new Date('2026-08-01T15:00:00Z')
    const ranges = [
      { start: new Date('2026-08-01T09:00:00Z'), end: new Date('2026-08-01T10:00:00Z'), user_id: 'alice' },
      { start: new Date('2026-08-01T09:00:00Z'), end: new Date('2026-08-01T10:00:00Z'), user_id: 'bob' },
      { start: new Date('2026-08-01T14:00:00Z'), end: new Date('2026-08-01T15:00:00Z'), user_id: 'carol' },
      { start: new Date('2026-08-01T14:00:00Z'), end: new Date('2026-08-01T15:00:00Z'), user_id: 'dave' },
    ]

    const result = computeRangeRanking(ranges, windowStart, windowEnd, 4, participantsById)

    expect(result[0].slot_start).toEqual(new Date('2026-08-01T09:00:00Z'))
    expect(result[1].slot_start).toEqual(new Date('2026-08-01T14:00:00Z'))
  })
})
