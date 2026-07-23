import { jest } from '@jest/globals'

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: {
    activityParticipant: { findUnique: jest.fn() },
    activity: { findUnique: jest.fn() },
    activityMessage: { create: jest.fn(), findMany: jest.fn() },
    activityChat: { update: jest.fn() },
    $transaction: jest.fn((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg({}))),
  }
}))

const { default: request } = await import('supertest')
const { default: jwt } = await import('jsonwebtoken')
const { default: app } = await import('../app.js')
const { default: prisma } = await import('../lib/prisma.js')

function makeToken(payload = { userId: 'user-uuid-1' }, options = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h', ...options })
}

const mockChat = { id: 'chat-uuid-1', activity_id: 'activity-uuid-1', name: 'test', last_message_at: null, created_at: new Date() }
const mockSender = { id: 'user-uuid-1', display_name: 'Test User', avatar_url: null }
const mockMessage = {
  id: 'msg-uuid-1',
  chat_id: 'chat-uuid-1',
  sender_id: 'user-uuid-1',
  content: '明天幾點集合？',
  created_at: new Date(),
  sender: mockSender,
}

describe('POST /api/activities/:id/messages', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('參與者傳送訊息 → 201', async () => {
    prisma.activityParticipant.findUnique.mockResolvedValue({ status: 'joined' })
    prisma.activity.findUnique.mockResolvedValue({ chat: mockChat })
    prisma.activityMessage.create.mockResolvedValue(mockMessage)
    prisma.activityChat.update.mockResolvedValue({ ...mockChat, last_message_at: new Date() })

    const res = await request(app)
      .post('/api/activities/activity-uuid-1/messages')
      .set('Cookie', `token=${makeToken()}`)
      .send({ content: '明天幾點集合？' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      id: 'msg-uuid-1',
      content: '明天幾點集合？',
      sender: mockSender,
    })
  })

  it('無 token → 401', async () => {
    const res = await request(app)
      .post('/api/activities/activity-uuid-1/messages')
      .send({ content: 'Hello!' })
    expect(res.status).toBe(401)
  })

  it('非參與者 → 403', async () => {
    prisma.activityParticipant.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/activities/activity-uuid-1/messages')
      .set('Cookie', `token=${makeToken()}`)
      .send({ content: 'Hello!' })
    expect(res.status).toBe(403)
  })

  it('left 參與者 → 403', async () => {
    prisma.activityParticipant.findUnique.mockResolvedValue({ status: 'left' })

    const res = await request(app)
      .post('/api/activities/activity-uuid-1/messages')
      .set('Cookie', `token=${makeToken()}`)
      .send({ content: 'Hello!' })
    expect(res.status).toBe(403)
  })

  it('空白 content → 400', async () => {
    const res = await request(app)
      .post('/api/activities/activity-uuid-1/messages')
      .set('Cookie', `token=${makeToken()}`)
      .send({ content: '' })
    expect(res.status).toBe(400)
  })

  it('content 超過 2000 字 → 400', async () => {
    const res = await request(app)
      .post('/api/activities/activity-uuid-1/messages')
      .set('Cookie', `token=${makeToken()}`)
      .send({ content: 'a'.repeat(2001) })
    expect(res.status).toBe(400)
  })

  it('缺少 content → 400', async () => {
    const res = await request(app)
      .post('/api/activities/activity-uuid-1/messages')
      .set('Cookie', `token=${makeToken()}`)
      .send({})
    expect(res.status).toBe(400)
  })
})

describe('GET /api/activities/:id/messages', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('參與者取得歷史訊息 → 200', async () => {
    prisma.activityParticipant.findUnique.mockResolvedValue({ status: 'joined' })
    prisma.activity.findUnique.mockResolvedValue({ chat: mockChat })
    prisma.activityMessage.findMany.mockResolvedValue([mockMessage])

    const res = await request(app)
      .get('/api/activities/activity-uuid-1/messages')
      .set('Cookie', `token=${makeToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0]).toMatchObject({
      id: 'msg-uuid-1',
      content: '明天幾點集合？',
      sender: mockSender,
    })
    expect(res.body.next_cursor).toBeNull()
  })

  it('非參與者 → 403', async () => {
    prisma.activityParticipant.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/activities/activity-uuid-1/messages')
      .set('Cookie', `token=${makeToken()}`)
    expect(res.status).toBe(403)
  })

  it('空歷史 → 200 空陣列', async () => {
    prisma.activityParticipant.findUnique.mockResolvedValue({ status: 'joined' })
    prisma.activity.findUnique.mockResolvedValue({ chat: mockChat })
    prisma.activityMessage.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/activities/activity-uuid-1/messages')
      .set('Cookie', `token=${makeToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
    expect(res.body.next_cursor).toBeNull()
  })

  it('無聊天室 → 404', async () => {
    prisma.activityParticipant.findUnique.mockResolvedValue({ status: 'joined' })
    prisma.activity.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/activities/activity-uuid-1/messages')
      .set('Cookie', `token=${makeToken()}`)
    expect(res.status).toBe(404)
  })

  it('cursor pagination — 超過 limit 回傳 next_cursor', async () => {
    prisma.activityParticipant.findUnique.mockResolvedValue({ status: 'joined' })
    prisma.activity.findUnique.mockResolvedValue({ chat: mockChat })

    const messages = Array.from({ length: 21 }, (_, i) => ({
      id: `msg-${i}`,
      chat_id: 'chat-uuid-1',
      sender_id: 'user-uuid-1',
      content: `Message ${i}`,
      created_at: new Date(2026, 6, 21, 10, 0, i),
      sender: mockSender,
    }))
    prisma.activityMessage.findMany.mockResolvedValue(messages)

    const res = await request(app)
      .get('/api/activities/activity-uuid-1/messages?limit=20')
      .set('Cookie', `token=${makeToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(20)
    expect(res.body.next_cursor).toBeTruthy()
  })
})
