import { jest } from '@jest/globals'

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: {
    user: { create: jest.fn(), findUnique: jest.fn() },
    userIdentity: { findUnique: jest.fn() },
  }
}))

const { default: request } = await import('supertest')
const { default: app } = await import('../app.js')
const { default: prisma } = await import('../lib/prisma.js')

beforeEach(() => {
  global.fetch = jest.fn()
})

function mockGoogleSuccess(overrides = {}) {
  global.fetch.mockResolvedValueOnce({
    json: jest.fn().mockResolvedValueOnce({
      email: 'test@gmail.com',
      sub: 'google-id-123',
      name: 'Test User',
      picture: 'https://avatar.example.com/photo.jpg',
      ...overrides,
    })
  })
}

describe('POST /api/auth/google', () => {
  test('新用戶第一次登入 → 建立帳號，回傳 200 + httpOnly cookie + user 資料', async () => {
    mockGoogleSuccess()
    prisma.userIdentity.findUnique.mockResolvedValueOnce(null)
    prisma.user.create.mockResolvedValueOnce({
      id: 'user-uuid-1',
      display_name: 'Test User',
      avatar_url: 'https://avatar.example.com/photo.jpg',
    })

    const res = await request(app)
      .post('/api/auth/google')
      .send({ token: 'valid-google-access-token' })

    expect(res.status).toBe(200)
    expect(res.headers['set-cookie']).toBeDefined()
    expect(res.headers['set-cookie'][0]).toMatch(/token=/)
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i)
    expect(res.body.token).toBeUndefined()
    expect(res.body.user).toMatchObject({
      id: 'user-uuid-1',
      display_name: 'Test User',
      email: 'test@gmail.com',
    })
    expect(prisma.user.create).toHaveBeenCalledTimes(1)
  })

  test('舊用戶再次登入 → 找到現有帳號，回傳 200 + httpOnly cookie，不重複建帳號', async () => {
    mockGoogleSuccess()
    prisma.userIdentity.findUnique.mockResolvedValueOnce({
      user: {
        id: 'user-uuid-2',
        display_name: 'Existing User',
        avatar_url: 'https://avatar.example.com/photo.jpg',
      }
    })

    const res = await request(app)
      .post('/api/auth/google')
      .send({ token: 'valid-google-access-token' })

    expect(res.status).toBe(200)
    expect(res.headers['set-cookie']).toBeDefined()
    expect(res.headers['set-cookie'][0]).toMatch(/token=/)
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i)
    expect(res.body.token).toBeUndefined()
    expect(res.body.user).toMatchObject({
      id: 'user-uuid-2',
      display_name: 'Existing User',
      email: 'test@gmail.com',
    })
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  test('Google token 無效（沒有 email）→ 回傳 401', async () => {
    global.fetch.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValueOnce({})
    })

    const res = await request(app)
      .post('/api/auth/google')
      .send({ token: 'invalid-token' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('無法取得使用者資訊')
  })

  test('Google API 掛掉（fetch 噴錯）→ 回傳 500', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'))

    const res = await request(app)
      .post('/api/auth/google')
      .send({ token: 'any-token' })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('伺服器錯誤')
  })
})