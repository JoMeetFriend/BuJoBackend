import { jest } from '@jest/globals'

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: {
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
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
  countUnreadNotifications,
  listUserNotifications,
  dismissNotification,
  buildActivityLineMessage,
  sendActivityLifecycleLineNotifications,
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

  // 測試 countUnreadNotifications 會用 user_id + is_read 條件查詢未讀數。
  it('countUnreadNotifications 會回傳該使用者未讀通知數', async () => {
    prisma.notification.count.mockResolvedValue(3)

    const result = await countUnreadNotifications({ userId: 'user-b' })

    expect(result).toBe(3)
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { user_id: 'user-b', is_read: false },
    })
  })

  // 測試 countUnreadNotifications 缺少 userId 時會丟錯。
  it('countUnreadNotifications 缺 userId 會丟錯', async () => {
    await expect(countUnreadNotifications({})).rejects.toThrow('userId is required')
  })

  describe('buildActivityLineMessage', () => {
    beforeEach(() => {
      prisma.activity.findUnique.mockResolvedValue({
        id: 'activity-1',
        title: '週末野餐',
        status: 'voting',
        creator: { id: 'user-a', display_name: 'A', avatar_url: null },
      })
    })

    // 測試四種活動生命週期型別的 LINE 文案與站內通知文案一致。
    it.each([
      ['formation_ready', '「週末野餐」人數已滿，請確認成團'],
      ['time_to_pick', '「週末野餐」候選時段票數不相上下，請選擇最終時段'],
      ['activity_confirmed', '「週末野餐」已確認成團'],
      ['activity_cancelled', '「週末野餐」已取消'],
    ])('%s 型別回傳對應文案', async (type, expected) => {
      await expect(buildActivityLineMessage({ activityId: 'activity-1', type }))
        .resolves.toBe(expected)
    })

    // 測試未帶 type 或未知 type 時 fallback 為活動建立文案。
    it.each([undefined, 'unknown_type'])(
      'type 為 %s 時 fallback 為活動建立文案',
      async (type) => {
        await expect(buildActivityLineMessage({ activityId: 'activity-1', type }))
          .resolves.toBe('A 建立了新活動：週末野餐')
      },
    )
  })

  describe('sendActivityLifecycleLineNotifications', () => {
    beforeEach(() => {
      prisma.activity.findUnique.mockResolvedValue({
        id: 'activity-1',
        title: '週末野餐',
        status: 'voting',
        creator: { id: 'user-a', display_name: 'A', avatar_url: null },
      })
    })

    // 測試對每個有 LINE 身分的收件人推播,且文案只組一次(共用 lazy promise)。
    it('對有 LINE 身分的收件人逐一推播且共用文案查詢', async () => {
      prisma.userIdentity.findFirst
        .mockResolvedValueOnce({ provider_user_id: 'U-line-b' })
        .mockResolvedValueOnce({ provider_user_id: 'U-line-c' })

      await sendActivityLifecycleLineNotifications({
        userIds: ['user-b', 'user-c'],
        activityId: 'activity-1',
        type: 'activity_confirmed',
      })

      expect(sendLinePushMessage).toHaveBeenCalledTimes(2)
      expect(sendLinePushMessage).toHaveBeenNthCalledWith(1, {
        to: 'U-line-b',
        text: '「週末野餐」已確認成團',
      })
      expect(sendLinePushMessage).toHaveBeenNthCalledWith(2, {
        to: 'U-line-c',
        text: '「週末野餐」已確認成團',
      })
      expect(prisma.activity.findUnique).toHaveBeenCalledTimes(1)
    })

    // 測試 userIds 為空陣列時不做任何事並回傳空陣列。
    it('userIds 為空陣列時回傳空陣列且不查詢不推播', async () => {
      await expect(sendActivityLifecycleLineNotifications({
        userIds: [],
        activityId: 'activity-1',
        type: 'activity_cancelled',
      })).resolves.toEqual([])

      expect(prisma.activity.findUnique).not.toHaveBeenCalled()
      expect(sendLinePushMessage).not.toHaveBeenCalled()
    })

    // 測試未綁定 LINE 的收件人被略過。
    it('未綁定 LINE 的收件人被略過', async () => {
      prisma.userIdentity.findFirst.mockResolvedValue(null)

      await sendActivityLifecycleLineNotifications({
        userIds: ['user-b'],
        activityId: 'activity-1',
        type: 'formation_ready',
      })

      expect(sendLinePushMessage).not.toHaveBeenCalled()
    })

    // 測試 LINE 偏好關閉的收件人被略過。
    it('LINE 偏好關閉的收件人被略過', async () => {
      prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-b' })
      prisma.notificationPreference.findUnique.mockResolvedValue({ line: false })

      await sendActivityLifecycleLineNotifications({
        userIds: ['user-b'],
        activityId: 'activity-1',
        type: 'time_to_pick',
      })

      expect(prisma.notificationPreference.findUnique).toHaveBeenCalledWith({
        where: {
          user_id_type: {
            user_id: 'user-b',
            type: 'time_to_pick',
          },
        },
        select: { line: true },
      })
      expect(sendLinePushMessage).not.toHaveBeenCalled()
    })

    // 測試推播失敗時函式仍正常返回不外拋。
    it('sendLinePushMessage 拋錯時仍正常返回', async () => {
      prisma.userIdentity.findFirst.mockResolvedValue({ provider_user_id: 'U-line-b' })
      sendLinePushMessage.mockRejectedValue(new Error('LINE timeout'))

      await expect(sendActivityLifecycleLineNotifications({
        userIds: ['user-b'],
        activityId: 'activity-1',
        type: 'activity_cancelled',
      })).resolves.toBeDefined()
    })
  })

  describe('notification actor response', () => {
    const createdAt = new Date('2026-07-16T00:00:00.000Z')

    function makeNotification({
      id,
      type,
      referenceId,
      referenceType = 'friendship',
      isRead = false,
    }) {
      return {
        id,
        user_id: 'user-b',
        type,
        reference_id: referenceId,
        reference_type: referenceType,
        is_read: isRead,
        created_at: createdAt,
        dismissed_at: null,
      }
    }

    it('friend_request_created 回傳 requester actor', async () => {
      prisma.notification.findMany.mockResolvedValue([
        makeNotification({
          id: 'notification-1',
          type: 'friend_request_created',
          referenceId: 'friendship-1',
        }),
      ])
      prisma.friendship.findMany.mockResolvedValue([
        {
          id: 'friendship-1',
          status: 'pending',
          requester: {
            id: 'user-a',
            display_name: 'A',
            avatar_url: 'https://example.com/a.png',
          },
          receiver: {
            id: 'user-b',
            display_name: 'B',
            avatar_url: null,
          },
        },
      ])

      const result = await listUserNotifications({ userId: 'user-b' })

      expect(result[0].actor).toEqual({
        id: 'user-a',
        displayName: 'A',
        avatarUrl: 'https://example.com/a.png',
      })
    })

    it('friend_request_accepted 回傳 receiver actor 並保留 null avatar', async () => {
      prisma.notification.findMany.mockResolvedValue([
        makeNotification({
          id: 'notification-2',
          type: 'friend_request_accepted',
          referenceId: 'friendship-1',
        }),
      ])
      prisma.friendship.findMany.mockResolvedValue([
        {
          id: 'friendship-1',
          status: 'accepted',
          requester: {
            id: 'user-a',
            display_name: 'A',
            avatar_url: 'https://example.com/a.png',
          },
          receiver: {
            id: 'user-b',
            display_name: 'B',
            avatar_url: null,
          },
        },
      ])

      const result = await listUserNotifications({ userId: 'user-a' })

      expect(result[0].actor).toEqual({
        id: 'user-b',
        displayName: 'B',
        avatarUrl: null,
      })
    })

    it('friendship 遺失時回傳 null actor 並保留 fallback contract', async () => {
      prisma.notification.findMany.mockResolvedValue([
        makeNotification({
          id: 'notification-missing',
          type: 'friend_request_created',
          referenceId: 'friendship-missing',
        }),
      ])
      prisma.friendship.findMany.mockResolvedValue([])

      const result = await listUserNotifications({ userId: 'user-b' })

      expect(result[0]).toEqual(expect.objectContaining({
        actor: null,
        message: '有人 向你發送好友邀請',
        reference: {
          type: 'friendship',
          id: 'friendship-missing',
          status: null,
        },
        actions: [],
      }))
    })

    it('activity_created 回傳 spec example 的 creator actor 且重用單次 activity 查詢', async () => {
      prisma.notification.findMany.mockResolvedValue([
        makeNotification({
          id: 'notification-activity',
          type: 'activity_created',
          referenceId: 'activity-1',
          referenceType: 'activity',
        }),
      ])
      prisma.activity.findUnique.mockResolvedValue({
        id: 'activity-1',
        title: '週末野餐',
        status: 'recruiting',
        creator: {
          id: 'user-a',
          display_name: 'A',
          avatar_url: 'https://example.com/a.png',
        },
      })

      const result = await listUserNotifications({ userId: 'user-b' })

      expect(result[0].actor).toEqual({
        id: 'user-a',
        displayName: 'A',
        avatarUrl: 'https://example.com/a.png',
      })
      expect(prisma.activity.findUnique).toHaveBeenCalledTimes(1)
      expect(prisma.friendship.findMany).not.toHaveBeenCalled()
      expect(prisma.friendship.findUnique).not.toHaveBeenCalled()
    })

    it('activity_created creator 沒有頭像時仍回傳 actor 與 null avatar', async () => {
      prisma.notification.findMany.mockResolvedValue([
        makeNotification({
          id: 'notification-activity-null-avatar',
          type: 'activity_created',
          referenceId: 'activity-1',
          referenceType: 'activity',
        }),
      ])
      prisma.activity.findUnique.mockResolvedValue({
        id: 'activity-1',
        title: '週末野餐',
        status: 'recruiting',
        creator: { id: 'user-a', display_name: 'A', avatar_url: null },
      })

      const result = await listUserNotifications({ userId: 'user-b' })

      expect(result[0].actor).toEqual({
        id: 'user-a',
        displayName: 'A',
        avatarUrl: null,
      })
    })

    it.each([
      ['reference ID 遺失', null, null],
      ['activity 查無資料', 'activity-missing', null],
      [
        'creator 遺失',
        'activity-1',
        {
          id: 'activity-1',
          title: '週末野餐',
          status: 'recruiting',
          creator: null,
        },
      ],
    ])('activity_created 在%s時回傳 null actor', async (_scenario, referenceId, activity) => {
      prisma.notification.findMany.mockResolvedValue([
        makeNotification({
          id: 'notification-activity-missing-context',
          type: 'activity_created',
          referenceId,
          referenceType: 'activity',
        }),
      ])
      prisma.activity.findUnique.mockResolvedValue(activity)

      const result = await listUserNotifications({ userId: 'user-b' })

      expect(result[0].actor).toBeNull()
      expect(result[0]).toEqual(expect.objectContaining({
        message: activity?.title
          ? '有人 建立了新活動：週末野餐'
          : '有人 建立了新活動：新活動',
        actions: [],
      }))
    })

    it.each([
      'formation_ready',
      'time_to_pick',
      'activity_confirmed',
      'activity_cancelled',
    ])('%s 活動生命週期通知回傳 null actor', async (type) => {
      prisma.notification.findMany.mockResolvedValue([
        makeNotification({
          id: `notification-${type}`,
          type,
          referenceId: 'activity-1',
          referenceType: 'activity',
        }),
      ])
      prisma.activity.findUnique.mockResolvedValue({
        id: 'activity-1',
        title: '週末野餐',
        status: 'voting',
        creator: { id: 'user-a', display_name: 'A', avatar_url: null },
      })

      const result = await listUserNotifications({ userId: 'user-b' })

      expect(result[0].actor).toBeNull()
    })

    it('一般通知回傳 null actor 且不查 friendship', async () => {
      prisma.notification.findMany.mockResolvedValue([
        makeNotification({
          id: 'notification-general',
          type: 'custom_type',
          referenceId: null,
          referenceType: null,
        }),
      ])

      const result = await listUserNotifications({ userId: 'user-b' })

      expect(result[0].actor).toBeNull()
      expect(prisma.friendship.findMany).not.toHaveBeenCalled()
      expect(prisma.friendship.findUnique).not.toHaveBeenCalled()
    })

    it('多筆好友通知以去重 IDs 單次批次查詢且 listing 不呼叫 findUnique', async () => {
      prisma.notification.findMany.mockResolvedValue([
        makeNotification({
          id: 'notification-1',
          type: 'friend_request_created',
          referenceId: 'friendship-1',
        }),
        makeNotification({
          id: 'notification-2',
          type: 'friend_request_accepted',
          referenceId: 'friendship-1',
        }),
        makeNotification({
          id: 'notification-3',
          type: 'friend_request_created',
          referenceId: 'friendship-2',
        }),
      ])
      prisma.friendship.findMany.mockResolvedValue([
        {
          id: 'friendship-1',
          status: 'accepted',
          requester: { id: 'user-a', display_name: 'A', avatar_url: null },
          receiver: { id: 'user-b', display_name: 'B', avatar_url: null },
        },
        {
          id: 'friendship-2',
          status: 'pending',
          requester: { id: 'user-c', display_name: 'C', avatar_url: null },
          receiver: { id: 'user-b', display_name: 'B', avatar_url: null },
        },
      ])

      await listUserNotifications({ userId: 'user-b' })

      expect(prisma.friendship.findMany).toHaveBeenCalledTimes(1)
      expect(prisma.friendship.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['friendship-1', 'friendship-2'] },
        },
        select: {
          id: true,
          status: true,
          requester: {
            select: { id: true, display_name: true, avatar_url: true },
          },
          receiver: {
            select: { id: true, display_name: true, avatar_url: true },
          },
        },
      })
      expect(prisma.friendship.findUnique).not.toHaveBeenCalled()
    })
  })

  describe('notification dismissal', () => {
    it('listUserNotifications 只查詢未 dismissal 通知且保留一般已讀通知', async () => {
      const createdAt = new Date('2026-07-12T00:00:00.000Z')
      prisma.notification.findMany.mockResolvedValue([
        {
          id: 'notification-read',
          user_id: 'user-b',
          type: 'custom_type',
          reference_id: null,
          reference_type: null,
          is_read: true,
          created_at: createdAt,
          dismissed_at: null,
        },
      ])

      const result = await listUserNotifications({ userId: 'user-b' })

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          user_id: 'user-b',
          dismissed_at: null,
        },
        orderBy: { created_at: 'desc' },
      })
      expect(result).toEqual([
        expect.objectContaining({
          id: 'notification-read',
          isRead: true,
          createdAt: createdAt.toISOString(),
        }),
      ])
    })

    it('dismissNotification 同一次更新已讀與 dismissal 時間', async () => {
      prisma.notification.findFirst.mockResolvedValue({
        id: 'notification-1',
        type: 'activity_created',
        reference_id: 'activity-1',
        reference_type: 'activity',
      })
      prisma.notification.updateMany.mockResolvedValue({ count: 1 })

      const result = await dismissNotification({
        userId: 'user-b',
        notificationId: 'notification-1',
      })

      expect(result).toBe('dismissed')
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'notification-1',
          user_id: 'user-b',
          dismissed_at: null,
        },
        data: {
          is_read: true,
          dismissed_at: expect.any(Date),
        },
      })
    })

    it('不存在、他人或已 dismissal 的通知統一回傳 not_found', async () => {
      prisma.notification.findFirst.mockResolvedValue(null)

      await expect(dismissNotification({
        userId: 'user-b',
        notificationId: 'notification-1',
      })).resolves.toBe('not_found')

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'notification-1',
          user_id: 'user-b',
          dismissed_at: null,
        },
        select: {
          id: true,
          type: true,
          reference_id: true,
          reference_type: true,
        },
      })
      expect(prisma.notification.updateMany).not.toHaveBeenCalled()
    })

    it('條件更新遇到重複 dismissal 競態時回傳 not_found', async () => {
      prisma.notification.findFirst.mockResolvedValue({
        id: 'notification-1',
        type: 'activity_created',
        reference_id: 'activity-1',
        reference_type: 'activity',
      })
      prisma.notification.updateMany.mockResolvedValue({ count: 0 })

      await expect(dismissNotification({
        userId: 'user-b',
        notificationId: 'notification-1',
      })).resolves.toBe('not_found')
    })

    it('pending 好友邀請不可 dismissal 且不更新通知', async () => {
      prisma.notification.findFirst.mockResolvedValue({
        id: 'notification-1',
        type: 'friend_request_created',
        reference_id: 'friendship-1',
        reference_type: 'friendship',
      })
      prisma.friendship.findUnique.mockResolvedValue({ status: 'pending' })

      await expect(dismissNotification({
        userId: 'user-b',
        notificationId: 'notification-1',
      })).resolves.toBe('pending_friend_request')

      expect(prisma.friendship.findUnique).toHaveBeenCalledWith({
        where: { id: 'friendship-1' },
        select: { status: true },
      })
      expect(prisma.notification.updateMany).not.toHaveBeenCalled()
    })

    it.each(['accepted', 'rejected'])(
      '%s 好友邀請處理完成後可以 dismissal',
      async (status) => {
        prisma.notification.findFirst.mockResolvedValue({
          id: 'notification-1',
          type: 'friend_request_created',
          reference_id: 'friendship-1',
          reference_type: 'friendship',
        })
        prisma.friendship.findUnique.mockResolvedValue({ status })
        prisma.notification.updateMany.mockResolvedValue({ count: 1 })

        await expect(dismissNotification({
          userId: 'user-b',
          notificationId: 'notification-1',
        })).resolves.toBe('dismissed')
      },
    )
  })
})
