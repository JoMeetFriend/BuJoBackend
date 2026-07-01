import { jest } from '@jest/globals'

jest.unstable_mockModule('../lib/prisma.js', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    friendship: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    notification: { create: jest.fn() },
    $transaction: jest.fn(async (callback) => callback(prisma)),
  }

  return { default: prisma }
})

const { requestFriendship } = await import('../controllers/friendshipController.js')
const { default: friendshipRoutes } = await import('../routes/friendships.js')
const { default: prisma } = await import('../lib/prisma.js')

function makeReq(body = {}, userId = 'user-a') {
  return {
    user: { userId },
    body,
  }
}

function makeRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  }
  return res
}

describe('POST /api/friendships/request route', () => {
  it('使用 authenticate middleware 保護好友邀請 API', () => {
    const requestRoute = friendshipRoutes.stack.find((layer) => layer.route?.path === '/request')

    expect(requestRoute).toBeDefined()
    expect(requestRoute.route.methods.post).toBe(true)
    expect(requestRoute.route.stack[0].handle.name).toBe('authenticate')
  })
})

describe('requestFriendship', () => {
  it('缺 receiver_id 回傳 400', async () => {
    const res = makeRes()

    await requestFriendship(makeReq({}), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '缺少 receiver_id' })
  })

  it('不能加自己為好友', async () => {
    const res = makeRes()

    await requestFriendship(makeReq({ receiver_id: 'user-a' }, 'user-a'), res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: '不能加自己為好友' })
  })

  it('receiver 不存在回傳 404', async () => {
    const res = makeRes()
    prisma.user.findUnique.mockResolvedValue(null)

    await requestFriendship(makeReq({ receiver_id: 'user-b' }, 'user-a'), res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ message: '找不到使用者' })
  })

  it('第一次送邀請會建立 pending friendship 和通知', async () => {
    const res = makeRes()
    const friendship = {
      id: 'friendship-1',
      requester_id: 'user-a',
      receiver_id: 'user-b',
      status: 'pending',
    }

    prisma.user.findUnique.mockResolvedValue({ id: 'user-b' })
    prisma.friendship.findFirst.mockResolvedValue(null)
    prisma.friendship.create.mockResolvedValue(friendship)

    await requestFriendship(makeReq({ receiver_id: 'user-b' }, 'user-a'), res)

    expect(prisma.friendship.create).toHaveBeenCalledWith({
      data: {
        requester_id: 'user-a',
        receiver_id: 'user-b',
        status: 'pending',
      },
    })
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-b',
        type: 'friend_request_created',
        reference_id: 'friendship-1',
        reference_type: 'friendship',
        is_read: false,
      },
    })
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({
      message: '好友邀請已送出',
      friendship,
    })
  })

  it('已經是好友時不能送邀請', async () => {
    const res = makeRes()
    prisma.user.findUnique.mockResolvedValue({ id: 'user-b' })
    prisma.friendship.findFirst.mockResolvedValue({
      id: 'friendship-1',
      requester_id: 'user-a',
      receiver_id: 'user-b',
      status: 'accepted',
    })

    await requestFriendship(makeReq({ receiver_id: 'user-b' }, 'user-a'), res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ message: '已經是好友' })
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })

  it('已送出 pending 時不能重複送邀請', async () => {
    const res = makeRes()
    prisma.user.findUnique.mockResolvedValue({ id: 'user-b' })
    prisma.friendship.findFirst.mockResolvedValue({
      id: 'friendship-1',
      requester_id: 'user-a',
      receiver_id: 'user-b',
      status: 'pending',
    })

    await requestFriendship(makeReq({ receiver_id: 'user-b' }, 'user-a'), res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ message: '已送出好友邀請' })
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })

  it('對方已送出 pending 時不建立反方向邀請', async () => {
    const res = makeRes()
    prisma.user.findUnique.mockResolvedValue({ id: 'user-b' })
    prisma.friendship.findFirst.mockResolvedValue({
      id: 'friendship-1',
      requester_id: 'user-b',
      receiver_id: 'user-a',
      status: 'pending',
    })

    await requestFriendship(makeReq({ receiver_id: 'user-b' }, 'user-a'), res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ message: '對方已邀請你' })
    expect(prisma.friendship.create).not.toHaveBeenCalled()
  })

  it('rejected 後再次送邀請會更新回 pending 並建立通知', async () => {
    const res = makeRes()
    const friendship = {
      id: 'friendship-1',
      requester_id: 'user-a',
      receiver_id: 'user-b',
      status: 'pending',
    }

    prisma.user.findUnique.mockResolvedValue({ id: 'user-b' })
    prisma.friendship.findFirst.mockResolvedValue({
      id: 'friendship-1',
      requester_id: 'user-a',
      receiver_id: 'user-b',
      status: 'rejected',
    })
    prisma.friendship.update.mockResolvedValue(friendship)

    await requestFriendship(makeReq({ receiver_id: 'user-b' }, 'user-a'), res)

    expect(prisma.friendship.update).toHaveBeenCalledWith({
      where: { id: 'friendship-1' },
      data: {
        requester_id: 'user-a',
        receiver_id: 'user-b',
        status: 'pending',
      },
    })
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-b',
        type: 'friend_request_created',
        reference_id: 'friendship-1',
        reference_type: 'friendship',
        is_read: false,
      },
    })
    expect(res.status).toHaveBeenCalledWith(201)
  })
})
