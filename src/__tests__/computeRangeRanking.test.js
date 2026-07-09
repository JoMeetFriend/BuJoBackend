import { computeRangeRanking } from '../controllers/activityController.js'

describe('computeRangeRanking - 情境二重疊排序演算法', () => {
  it('60 分鐘切格、計算重疊人數，分完全符合／最多人有空兩區，平手依時間排序', () => {
    const windowStart = new Date('2026-08-01T18:00:00Z')
    const windowEnd = new Date('2026-08-01T21:00:00Z')
    const ranges = [
      { start: new Date('2026-08-01T18:00:00Z'), end: new Date('2026-08-01T21:00:00Z') }, // creator
      { start: new Date('2026-08-01T18:00:00Z'), end: new Date('2026-08-01T20:00:00Z') }, // alice
      { start: new Date('2026-08-01T19:00:00Z'), end: new Date('2026-08-01T21:00:00Z') }, // bob
    ]

    const result = computeRangeRanking(ranges, windowStart, windowEnd, 3)

    expect(result.perfect_overlap).toEqual([
      expect.objectContaining({
        slot_start: new Date('2026-08-01T19:00:00Z'),
        slot_end: new Date('2026-08-01T20:00:00Z'),
        count: 3,
      }),
    ])
    expect(result.partial_overlap).toEqual([
      expect.objectContaining({
        slot_start: new Date('2026-08-01T18:00:00Z'),
        slot_end: new Date('2026-08-01T19:00:00Z'),
        count: 2,
      }),
      expect.objectContaining({
        slot_start: new Date('2026-08-01T20:00:00Z'),
        slot_end: new Date('2026-08-01T21:00:00Z'),
        count: 2,
      }),
    ])
    expect(result.perfect_overlap[0].id).toMatch(/^temp-/)
  })

  it('零提交時兩區皆為空陣列', () => {
    const windowStart = new Date('2026-08-01T18:00:00Z')
    const windowEnd = new Date('2026-08-01T21:00:00Z')

    const result = computeRangeRanking([], windowStart, windowEnd, 2)

    expect(result.perfect_overlap).toEqual([])
    expect(result.partial_overlap).toEqual([])
  })

  it('零重疊時 perfect_overlap 為空，partial_overlap 顯示最高票的格子', () => {
    const windowStart = new Date('2026-08-01T18:00:00Z')
    const windowEnd = new Date('2026-08-01T20:00:00Z')
    const ranges = [
      { start: new Date('2026-08-01T18:00:00Z'), end: new Date('2026-08-01T19:00:00Z') },
    ]

    const result = computeRangeRanking(ranges, windowStart, windowEnd, 3)

    expect(result.perfect_overlap).toEqual([])
    expect(result.partial_overlap).toEqual([
      expect.objectContaining({
        slot_start: new Date('2026-08-01T18:00:00Z'),
        slot_end: new Date('2026-08-01T19:00:00Z'),
        count: 1,
      }),
    ])
  })
})
