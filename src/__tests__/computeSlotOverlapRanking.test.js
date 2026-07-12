import { computeSlotOverlapRanking } from '../controllers/activityController.js'

function makeSlot(overrides = {}) {
  return {
    slot_start: new Date('2026-08-01T09:00:00Z'),
    slot_end: new Date('2026-08-01T12:00:00Z'),
    availabilities: [],
    ...overrides,
  }
}

const participantsById = {
  a: { display_name: 'A', avatar_url: 'a.png' },
  b: { display_name: 'B', avatar_url: 'b.png' },
  c: { display_name: 'C', avatar_url: 'c.png' },
}

describe('computeSlotOverlapRanking - 情境四子區間交集運算，範圍限定在單一候選時段內', () => {
  it('三個參與者不同子區間時，各時段的覆蓋人數計算正確，回傳單一排序陣列＋is_unanimous＋supporters', () => {
    const slot = makeSlot({
      availabilities: [
        { user_id: 'a', range_start: new Date('2026-08-01T09:00:00Z'), range_end: new Date('2026-08-01T10:00:00Z') },
        { user_id: 'b', range_start: new Date('2026-08-01T09:30:00Z'), range_end: new Date('2026-08-01T11:00:00Z') },
        { user_id: 'c', range_start: null, range_end: null }, // C：沒填子區間，視為整個候選時段都覆蓋
      ],
    })

    const result = computeSlotOverlapRanking(slot, participantsById)

    expect(result[0]).toEqual(
      expect.objectContaining({
        slot_start: new Date('2026-08-01T09:00:00Z'),
        slot_end: new Date('2026-08-01T10:00:00Z'),
        count: 3,
        is_unanimous: true,
      }),
    )
    expect(result[0].supporters).toEqual(
      expect.arrayContaining([
        { user_id: 'a', display_name: 'A', avatar_url: 'a.png' },
        { user_id: 'b', display_name: 'B', avatar_url: 'b.png' },
        { user_id: 'c', display_name: 'C', avatar_url: 'c.png' },
      ]),
    )
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slot_start: new Date('2026-08-01T10:00:00Z'),
          slot_end: new Date('2026-08-01T11:00:00Z'),
          count: 2,
          is_unanimous: false,
        }),
        expect.objectContaining({
          slot_start: new Date('2026-08-01T11:00:00Z'),
          slot_end: new Date('2026-08-01T12:00:00Z'),
          count: 1,
          is_unanimous: false,
        }),
      ]),
    )
  })

  it('沒有子區間的參與者在整個候選時段每一格都算覆蓋，且相鄰同支持者的格子合併成一筆', () => {
    const slot = makeSlot({
      slot_start: new Date('2026-08-01T09:00:00Z'),
      slot_end: new Date('2026-08-01T11:00:00Z'),
      availabilities: [{ user_id: 'a', range_start: null, range_end: null }],
    })

    const result = computeSlotOverlapRanking(slot, participantsById)

    // 只有一個人、沒有子區間 → 整個候選時段每一格都覆蓋 → 合併成一筆 count 1 的 entry
    expect(result).toEqual([
      expect.objectContaining({
        slot_start: new Date('2026-08-01T09:00:00Z'),
        slot_end: new Date('2026-08-01T11:00:00Z'),
        count: 1,
        is_unanimous: true,
      }),
    ])
  })

  it('交集運算只看這個候選時段自己的範圍，不受其他候選時段的子區間影響', () => {
    const slot = makeSlot({
      slot_start: new Date('2026-08-01T09:00:00Z'),
      slot_end: new Date('2026-08-01T10:00:00Z'),
      availabilities: [
        { user_id: 'a', range_start: new Date('2026-08-01T09:00:00Z'), range_end: new Date('2026-08-01T10:00:00Z') },
      ],
    })

    const result = computeSlotOverlapRanking(slot, participantsById)

    for (const entry of result) {
      expect(entry.slot_start >= slot.slot_start).toBe(true)
      expect(entry.slot_end <= slot.slot_end).toBe(true)
    }
  })

  it('沒有傳 participantsById 時，supporters 的 display_name/avatar_url 為 null，不會拋錯', () => {
    const slot = makeSlot({
      slot_start: new Date('2026-08-01T09:00:00Z'),
      slot_end: new Date('2026-08-01T10:00:00Z'),
      availabilities: [{ user_id: 'unknown', range_start: null, range_end: null }],
    })

    const result = computeSlotOverlapRanking(slot)

    expect(result[0].supporters).toEqual([{ user_id: 'unknown', display_name: null, avatar_url: null }])
  })
})
