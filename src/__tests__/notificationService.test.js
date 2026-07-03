import { jest } from '@jest/globals'

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: {
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    friendship: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    activity: {
      findUnique: jest.fn(),
    },
    userIdentity: {
      findFirst: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
    },
  },
}))

jest.unstable_mockModule('../services/lineMessagingService.js', () => ({
  sendLinePushMessage: jest.fn(),
}))

const {
  createNotification,
  createFriendRequestNotification,
  createFriendRequestAcceptedNotification,
  createActivityCreatedNotification,
  notifyFriendsActivityCreated,
} = await import('../services/notificationService.js')
const { default: prisma } = await import('../lib/prisma.js')
const { sendLinePushMessage } = await import('../services/lineMessagingService.js')

describe('notificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.userIdentity.findFirst.mockResolvedValue(null)
    prisma.notificationPreference.findUnique.mockResolvedValue(null)
    sendLinePushMessage.mockResolvedValue({ status: 'sent' })
  })

  // 測試 createNotification 會用正確欄位建立一筆未讀通知。
  it('createNotification 會建立未讀通知', async () => {
    const notification = {
      id: 'notification-1',
      user_id: 'user-b',
      type: 'custom_type',
      reference_id: 'reference-1',
      reference_type: 'custom_reference',
      is_read: false,
    }
    prisma.notification.create.mockResolvedValue(notification)

    const result = await createNotification({
      userId: 'user-b',
      type: 'custom_type',
      referenceId: 'reference-1',
      referenceType: 'custom_reference',
    })

    expect(result).toBe(notification)
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-b',
        type: 'custom_type',
        reference_id: 'reference-1',
        reference_type: 'custom_reference',
        is_read: false,
      },
    })
  })

  // 測試 createNotification 缺少 userId 時會丟錯。
  it('createNotification 缺 userId 會丟錯', async () => {
    await expect(createNotification({
      type: 'custom_type',
    })).rejects.toThrow('userId is required')
  })

  // 測試 createNotification 缺少 type 時會丟錯。
  it('createNotification 缺 type 會丟錯', async () => {
    await expect(createNotification({
      userId: 'user-b',
    })).rejects.toThrow('type is required')
  })

  // 測試 A 送好友邀請給 B 時，會建立給 B 的好友邀請通知。
  it('createFriendRequestNotification 會建立好友邀請通知', async () => {
    const notification = {
      id: 'notification-1',
      user_id: 'user-b',
      type: 'friend_request_created',
      reference_id: 'friendship-1',
      reference_type: 'friendship',
      is_read: false,
    }
    prisma.notification.create.mockResolvedValue(notification)

    const result = await createFriendRequestNotification({
      receiverId: 'user-b',
      friendshipId: 'friendship-1',
    })

    expect(result).toBe(notification)
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-b',
        type: 'friend_request_created',
        reference_id: 'friendship-1',
        reference_type: 'friendship',
        is_read: false,
      },
    })
    expect(sendLinePushMessage).not.toHaveBeenCalled()
  })

  it('createFriendRequestNotification 有 LINE 身分時會推播好友邀請', async () => {
    const notification = {
      id: 'notification-1',
      user_id: 'user-b',
      type: 'friend_request_created',
      reference_id: 'friendship-1',
      reference_type: 'friendship',
      is_read: false,
    }
    prisma.notification.create.mockResolvedValue(notification)
    prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-b' })
    prisma.friendship.findUnique.mockResolvedValue({
      id: 'friendship-1',
      requester: { id: 'user-a', display_name: 'A', avatar_url: null },
      receiver: { id: 'user-b', display_name: 'B', avatar_url: null },
    })

    const result = await createFriendRequestNotification({
      receiverId: 'user-b',
      friendshipId: 'friendship-1',
    })

    expect(result).toBe(notification)
    expect(prisma.userIdentity.findFirst).toHaveBeenCalledWith({
      where: {
        user_id: 'user-b',
        provider: 'line',
        provider_user_id: { not: null },
      },
      select: { provider_user_id: true },
    })
    expect(prisma.notificationPreference.findUnique).toHaveBeenCalledWith({
      where: {
        user_id_type: {
          user_id: 'user-b',
          type: 'friend_request_created',
        },
      },
      select: { line: true },
    })
    expect(sendLinePushMessage).toHaveBeenCalledWith({
      to: 'U-line-b',
      text: 'A 邀請你成為好友，快去 BuJo 看看吧！',
    })
  })

  it('createFriendRequestNotification LINE 偏好關閉時不推播', async () => {
    const notification = {
      id: 'notification-1',
      user_id: 'user-b',
      type: 'friend_request_created',
      reference_id: 'friendship-1',
      reference_type: 'friendship',
      is_read: false,
    }
    prisma.notification.create.mockResolvedValue(notification)
    prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-b' })
    prisma.notificationPreference.findUnique.mockResolvedValue({ line: false })

    const result = await createFriendRequestNotification({
      receiverId: 'user-b',
      friendshipId: 'friendship-1',
    })

    expect(result).toBe(notification)
    expect(prisma.friendship.findUnique).not.toHaveBeenCalled()
    expect(sendLinePushMessage).not.toHaveBeenCalled()
  })

  it('createFriendRequestNotification LINE 推播失敗時仍回傳站內通知', async () => {
    const notification = {
      id: 'notification-1',
      user_id: 'user-b',
      type: 'friend_request_created',
      reference_id: 'friendship-1',
      reference_type: 'friendship',
      is_read: false,
    }
    prisma.notification.create.mockResolvedValue(notification)
    prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-b' })
    prisma.friendship.findUnique.mockResolvedValue({
      id: 'friendship-1',
      requester: { id: 'user-a', display_name: 'A', avatar_url: null },
      receiver: { id: 'user-b', display_name: 'B', avatar_url: null },
    })
    sendLinePushMessage.mockRejectedValue(new Error('LINE timeout'))

    await expect(createFriendRequestNotification({
      receiverId: 'user-b',
      friendshipId: 'friendship-1',
    })).resolves.toBe(notification)
  })

  // 測試好友邀請通知缺少 receiverId 時會丟錯。
  it('createFriendRequestNotification 缺 receiverId 會丟錯', async () => {
    await expect(createFriendRequestNotification({
      friendshipId: 'friendship-1',
    })).rejects.toThrow('receiverId is required')
  })

  // 測試好友邀請通知缺少 friendshipId 時會丟錯。
  it('createFriendRequestNotification 缺 friendshipId 會丟錯', async () => {
    await expect(createFriendRequestNotification({
      receiverId: 'user-b',
    })).rejects.toThrow('friendshipId is required')
  })

  // 測試 B 接受 A 的好友邀請時，會建立給 A 的接受通知。
  it('createFriendRequestAcceptedNotification 會建立好友邀請接受通知', async () => {
    const notification = {
      id: 'notification-1',
      user_id: 'user-a',
      type: 'friend_request_accepted',
      reference_id: 'friendship-1',
      reference_type: 'friendship',
      is_read: false,
    }
    prisma.notification.create.mockResolvedValue(notification)

    const result = await createFriendRequestAcceptedNotification({
      requesterId: 'user-a',
      friendshipId: 'friendship-1',
    })

    expect(result).toBe(notification)
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-a',
        type: 'friend_request_accepted',
        reference_id: 'friendship-1',
        reference_type: 'friendship',
        is_read: false,
      },
    })
    expect(sendLinePushMessage).not.toHaveBeenCalled()
  })

  it('createFriendRequestAcceptedNotification 有 LINE 身分時會推播接受通知', async () => {
    const notification = {
      id: 'notification-1',
      user_id: 'user-a',
      type: 'friend_request_accepted',
      reference_id: 'friendship-1',
      reference_type: 'friendship',
      is_read: false,
    }
    prisma.notification.create.mockResolvedValue(notification)
    prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-a' })
    prisma.friendship.findUnique.mockResolvedValue({
      id: 'friendship-1',
      requester: { id: 'user-a', display_name: 'A', avatar_url: null },
      receiver: { id: 'user-b', display_name: 'B', avatar_url: null },
    })

    const result = await createFriendRequestAcceptedNotification({
      requesterId: 'user-a',
      friendshipId: 'friendship-1',
    })

    expect(result).toBe(notification)
    expect(sendLinePushMessage).toHaveBeenCalledWith({
      to: 'U-line-a',
      text: 'B 接受了你的好友邀請',
    })
  })

  // 測試好友邀請接受通知缺少 requesterId 時會丟錯。
  it('createFriendRequestAcceptedNotification 缺 requesterId 會丟錯', async () => {
    await expect(createFriendRequestAcceptedNotification({
      friendshipId: 'friendship-1',
    })).rejects.toThrow('requesterId is required')
  })

  // 測試好友邀請接受通知缺少 friendshipId 時會丟錯。
  it('createFriendRequestAcceptedNotification 缺 friendshipId 會丟錯', async () => {
    await expect(createFriendRequestAcceptedNotification({
      requesterId: 'user-a',
    })).rejects.toThrow('friendshipId is required')
  })

  it('createActivityCreatedNotification 有 LINE 身分時會推播活動通知', async () => {
    const notification = {
      id: 'notification-1',
      user_id: 'user-b',
      type: 'activity_created',
      reference_id: 'activity-1',
      reference_type: 'activity',
      is_read: false,
    }
    prisma.notification.create.mockResolvedValue(notification)
    prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-b' })
    prisma.activity.findUnique.mockResolvedValue({
      id: 'activity-1',
      title: '週末野餐',
      creator: { id: 'user-a', display_name: 'A', avatar_url: null },
    })

    const result = await createActivityCreatedNotification({
      userId: 'user-b',
      activityId: 'activity-1',
    })

    expect(result).toBe(notification)
    expect(sendLinePushMessage).toHaveBeenCalledWith({
      to: 'U-line-b',
      text: 'A 建立了新活動：週末野餐',
    })
  })

  it('notifyFriendsActivityCreated 會建立好友通知並對有 LINE 身分的好友推播', async () => {
    prisma.friendship.findMany.mockResolvedValue([
      { requester_id: 'user-a', receiver_id: 'user-b' },
      { requester_id: 'user-c', receiver_id: 'user-a' },
    ])
    prisma.notification.createMany.mockResolvedValue({ count: 2 })
    prisma.userIdentity.findFirst
      .mockResolvedValueOnce({ provider_user_id: 'U-line-b' })
      .mockResolvedValueOnce({ provider_user_id: 'U-line-c' })
    prisma.activity.findUnique.mockResolvedValue({
      id: 'activity-1',
      title: '週末野餐',
      creator: { id: 'user-a', display_name: 'A', avatar_url: null },
    })

    const result = await notifyFriendsActivityCreated({
      creatorId: 'user-a',
      activityId: 'activity-1',
    })

    expect(result).toEqual({ count: 2 })
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          user_id: 'user-b',
          type: 'activity_created',
          reference_id: 'activity-1',
          reference_type: 'activity',
          is_read: false,
        },
        {
          user_id: 'user-c',
          type: 'activity_created',
          reference_id: 'activity-1',
          reference_type: 'activity',
          is_read: false,
        },
      ],
    })
    expect(sendLinePushMessage).toHaveBeenCalledTimes(2)
    expect(sendLinePushMessage).toHaveBeenNthCalledWith(1, {
      to: 'U-line-b',
      text: 'A 建立了新活動：週末野餐',
    })
    expect(sendLinePushMessage).toHaveBeenNthCalledWith(2, {
      to: 'U-line-c',
      text: 'A 建立了新活動：週末野餐',
    })
  })
})
