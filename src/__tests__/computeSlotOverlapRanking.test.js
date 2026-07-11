import { computeSlotOverlapRanking } from '../controllers/activityController.js'

function makeSlot(overrides = {}) {
  return {
    slot_start: new Date('2026-08-01T09:00:00Z'),
    slot_end: new Date('2026-08-01T12:00:00Z'),
    availabilities: [],
    ...overrides,
  }
}

describe('computeSlotOverlapRanking - 情境四子區間交集運算，範圍限定在單一候選時段內', () => {
  it('三個參與者不同子區間時，各時段的覆蓋人數計算正確', () => {
    const slot = makeSlot({
      availabilities: [
        { range_start: new Date('2026-08-01T09:00:00Z'), range_end: new Date('2026-08-01T10:00:00Z') }, // A
        { range_start: new Date('2026-08-01T09:30:00Z'), range_end: new Date('2026-08-01T11:00:00Z') }, // B
        { range_start: null, range_end: null }, // C：沒填子區間，視為整個候選時段都覆蓋
      ],
    })

    const result = computeSlotOverlapRanking(slot)

    expect(result.perfect_overlap).toEqual([
      expect.objectContaining({
        slot_start: new Date('2026-08-01T09:00:00Z'),
        slot_end: new Date('2026-08-01T10:00:00Z'),
        count: 3,
      }),
    ])
    expect(result.partial_overlap).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slot_start: new Date('2026-08-01T10:00:00Z'),
          slot_end: new Date('2026-08-01T11:00:00Z'),
          count: 2,
        }),
        expect.objectContaining({
          slot_start: new Date('2026-08-01T11:00:00Z'),
          slot_end: new Date('2026-08-01T12:00:00Z'),
          count: 1,
        }),
      ]),
    )
  })

  it('沒有子區間的參與者在整個候選時段每一格都算覆蓋', () => {
    const slot = makeSlot({
      slot_start: new Date('2026-08-01T09:00:00Z'),
      slot_end: new Date('2026-08-01T11:00:00Z'),
      availabilities: [{ range_start: null, range_end: null }],
    })

    const result = computeSlotOverlapRanking(slot)

    // 只有一個人、沒有子區間 → 每一格都算他覆蓋 → 每一格都是 perfect_overlap（count === 總人數 1）
    expect(result.perfect_overlap).toEqual([
      expect.objectContaining({ slot_start: new Date('2026-08-01T09:00:00Z'), slot_end: new Date('2026-08-01T10:00:00Z'), count: 1 }),
      expect.objectContaining({ slot_start: new Date('2026-08-01T10:00:00Z'), slot_end: new Date('2026-08-01T11:00:00Z'), count: 1 }),
    ])
    expect(result.partial_overlap).toEqual([])
  })

  it('交集運算只看這個候選時段自己的範圍，不受其他候選時段的子區間影響', () => {
    // 呼叫端只會把屬於這個 slot 的 availabilities 傳進來，這裡驗證函式本身不會讀取 slot 以外的資料
    const slot = makeSlot({
      slot_start: new Date('2026-08-01T09:00:00Z'),
      slot_end: new Date('2026-08-01T10:00:00Z'),
      availabilities: [{ range_start: new Date('2026-08-01T09:00:00Z'), range_end: new Date('2026-08-01T10:00:00Z') }],
    })

    const result = computeSlotOverlapRanking(slot)

    for (const seg of [...result.perfect_overlap, ...result.partial_overlap]) {
      expect(seg.slot_start >= slot.slot_start).toBe(true)
      expect(seg.slot_end <= slot.slot_end).toBe(true)
    }
  })
})
