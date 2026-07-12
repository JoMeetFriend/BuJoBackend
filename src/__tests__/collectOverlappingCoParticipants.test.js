import { collectOverlappingCoParticipants } from '../controllers/activityController.js'

const ALICE = { user_id: 'alice', display_name: 'Alice', avatar_url: 'alice.png' }
const BOB = { user_id: 'bob', display_name: 'Bob', avatar_url: 'bob.png' }
const ME = { user_id: 'me', display_name: 'Me', avatar_url: 'me.png' }

function seg(start, end, supporters) {
  return { slot_start: new Date(start), slot_end: new Date(end), supporters }
}

describe('collectOverlappingCoParticipants - 從 segments 篩出跟我自己時間重疊的 supporters', () => {
  it('時間有重疊的 segment 的 supporter 出現在結果裡', () => {
    const segments = [
      seg('2026-08-01T18:00:00Z', '2026-08-01T19:00:00Z', [ME]),
      seg('2026-08-01T19:00:00Z', '2026-08-01T20:00:00Z', [ME, BOB]),
    ]

    const result = collectOverlappingCoParticipants(
      segments,
      new Date('2026-08-01T18:00:00Z'),
      new Date('2026-08-01T20:00:00Z'),
      'me',
    )

    expect(result).toEqual([BOB])
  })

  it('交接情境（前一筆 end === 後一筆 start）不算時間重疊，不出現在結果裡', () => {
    const segments = [
      seg('2026-08-01T09:00:00Z', '2026-08-01T10:00:00Z', [ME]),
      seg('2026-08-01T10:00:00Z', '2026-08-01T11:00:00Z', [BOB]),
    ]

    const result = collectOverlappingCoParticipants(
      segments,
      new Date('2026-08-01T09:00:00Z'),
      new Date('2026-08-01T10:00:00Z'),
      'me',
    )

    expect(result).toEqual([])
  })

  it('排除 myUserId 自己，即使自己也在重疊的 segment 的 supporters 裡', () => {
    const segments = [seg('2026-08-01T18:00:00Z', '2026-08-01T19:00:00Z', [ME, ALICE, BOB])]

    const result = collectOverlappingCoParticipants(
      segments,
      new Date('2026-08-01T18:00:00Z'),
      new Date('2026-08-01T19:00:00Z'),
      'me',
    )

    expect(result).toEqual(expect.arrayContaining([ALICE, BOB]))
    expect(result.find((s) => s.user_id === 'me')).toBeUndefined()
  })

  it('同一個支持者出現在多個重疊 segment 時只回傳一次（去重）', () => {
    const segments = [
      seg('2026-08-01T18:00:00Z', '2026-08-01T19:00:00Z', [ME, BOB]),
      seg('2026-08-01T19:00:00Z', '2026-08-01T20:00:00Z', [ME, BOB]),
    ]

    const result = collectOverlappingCoParticipants(
      segments,
      new Date('2026-08-01T18:00:00Z'),
      new Date('2026-08-01T20:00:00Z'),
      'me',
    )

    expect(result).toEqual([BOB])
  })
})
