import { jest } from '@jest/globals'

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: {
    oAuthAttempt: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userIdentity: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: {
      create: jest.fn(),
    },
  },
}))

const { default: prisma } = await import('../lib/prisma.js')
const {
  createLineAuthorizationUrl,
  linkLineUser,
  verifyLineState,
} = await import('../services/lineService.js')

beforeEach(() => {
  jest.clearAllMocks()
  process.env.LINE_CHANNEL_ID = 'line-channel-id'
  process.env.LINE_CHANNEL_SECRET = 'line-channel-secret'
  process.env.LINE_CALLBACK_URL = 'http://localhost:3000/api/auth/line/callback'
  prisma.oAuthAttempt.deleteMany.mockResolvedValue({ count: 0 })
  prisma.oAuthAttempt.create.mockResolvedValue({ id: 'attempt-id' })
})

describe('createLineAuthorizationUrl', () => {
  it('一般登入使用 normal prompt 並建立 user_id 為 null 的 attempt', async () => {
    const url = await createLineAuthorizationUrl(null, 'normal')

    expect(url.searchParams.get('bot_prompt')).toBe('normal')
    expect(prisma.oAuthAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        state_hash: expect.any(String),
        user_id: null,
        expires_at: expect.any(Date),
      }),
    })
  })

  it('帳號綁定使用 aggressive prompt 並把目前 user ID 存入 attempt', async () => {
    const url = await createLineAuthorizationUrl('user-1', 'aggressive')

    expect(url.searchParams.get('bot_prompt')).toBe('aggressive')
    expect(prisma.oAuthAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ user_id: 'user-1' }),
    })
  })

  it.each(['', 'silent', null, 1])('拒絕不支援的 prompt %p，且不寫入 attempt', async (botPrompt) => {
    await expect(createLineAuthorizationUrl('user-1', botPrompt)).rejects.toThrow(
      'LINE bot_prompt 無效',
    )

    expect(prisma.oAuthAttempt.deleteMany).not.toHaveBeenCalled()
    expect(prisma.oAuthAttempt.create).not.toHaveBeenCalled()
  })
})

describe('verifyLineState', () => {
  it('有效 state 只能消耗一次', async () => {
    const attempt = {
      id: 'attempt-1',
      user_id: 'user-1',
      consumed_at: null,
      expires_at: new Date(Date.now() + 60_000),
    }
    prisma.oAuthAttempt.findUnique
      .mockResolvedValueOnce(attempt)
      .mockResolvedValueOnce({ ...attempt, consumed_at: new Date() })
    prisma.oAuthAttempt.update.mockResolvedValue({ ...attempt, consumed_at: new Date() })

    await expect(verifyLineState('valid-state')).resolves.toBe(attempt)
    await expect(verifyLineState('valid-state')).rejects.toThrow(
      'OAuth state 不存在、已使用或已過期',
    )

    expect(prisma.oAuthAttempt.update).toHaveBeenCalledTimes(1)
    expect(prisma.oAuthAttempt.update).toHaveBeenCalledWith({
      where: { id: 'attempt-1' },
      data: { consumed_at: expect.any(Date) },
    })
  })

  it.each([undefined, null, ''])('拒絕缺少或格式無效的 state %p', async (state) => {
    await expect(verifyLineState(state)).rejects.toThrow('OAuth state 無效')
    expect(prisma.oAuthAttempt.findUnique).not.toHaveBeenCalled()
    expect(prisma.oAuthAttempt.update).not.toHaveBeenCalled()
  })

  it('拒絕不存在的 state', async () => {
    prisma.oAuthAttempt.findUnique.mockResolvedValue(null)

    await expect(verifyLineState('unknown-state')).rejects.toThrow(
      'OAuth state 不存在、已使用或已過期',
    )
    expect(prisma.oAuthAttempt.update).not.toHaveBeenCalled()
  })

  it.each([
    ['已過期', { consumed_at: null, expires_at: new Date(Date.now() - 1_000) }],
    ['已消耗', { consumed_at: new Date(), expires_at: new Date(Date.now() + 60_000) }],
  ])('拒絕%s的 state', async (_label, stateStatus) => {
    prisma.oAuthAttempt.findUnique.mockResolvedValue({
      id: 'attempt-invalid',
      user_id: null,
      ...stateStatus,
    })

    await expect(verifyLineState('invalid-state')).rejects.toThrow(
      'OAuth state 不存在、已使用或已過期',
    )
    expect(prisma.oAuthAttempt.update).not.toHaveBeenCalled()
  })
})

describe('linkLineUser', () => {
  const lineProfile = { sub: 'line-user-1' }

  it('LINE identity 已屬於其他帳號時拒絕改綁或建立', async () => {
    prisma.userIdentity.findUnique.mockResolvedValue({ user_id: 'other-user' })

    await expect(linkLineUser(lineProfile, 'current-user')).rejects.toThrow(
      '此 LINE 帳號已綁定其他帳號',
    )
    expect(prisma.userIdentity.create).not.toHaveBeenCalled()
  })

  it('LINE identity 已屬於目前帳號時視為成功且不重複建立', async () => {
    prisma.userIdentity.findUnique.mockResolvedValue({ user_id: 'current-user' })

    await expect(linkLineUser(lineProfile, 'current-user')).resolves.toBeUndefined()
    expect(prisma.userIdentity.create).not.toHaveBeenCalled()
  })
})
