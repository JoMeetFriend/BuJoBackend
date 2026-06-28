import { jest } from '@jest/globals'

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: {
    notification: { create: jest.fn() },
  },
}))

const {
  createNotification,
  createFriendRequestNotification,
  createFriendRequestAcceptedNotification,
} = await import('../services/notificationService.js')
const { default: prisma } = await import('../lib/prisma.js')

describe('notificationService', () => {
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

  it('createNotification 缺 userId 會丟錯', async () => {
    await expect(createNotification({
      type: 'custom_type',
    })).rejects.toThrow('userId is required')
  })

  it('createNotification 缺 type 會丟錯', async () => {
    await expect(createNotification({
      userId: 'user-b',
    })).rejects.toThrow('type is required')
  })

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
  })

  it('createFriendRequestNotification 缺 receiverId 會丟錯', async () => {
    await expect(createFriendRequestNotification({
      friendshipId: 'friendship-1',
    })).rejects.toThrow('receiverId is required')
  })

  it('createFriendRequestNotification 缺 friendshipId 會丟錯', async () => {
    await expect(createFriendRequestNotification({
      receiverId: 'user-b',
    })).rejects.toThrow('friendshipId is required')
  })

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
  })

  it('createFriendRequestAcceptedNotification 缺 requesterId 會丟錯', async () => {
    await expect(createFriendRequestAcceptedNotification({
      friendshipId: 'friendship-1',
    })).rejects.toThrow('requesterId is required')
  })

  it('createFriendRequestAcceptedNotification 缺 friendshipId 會丟錯', async () => {
    await expect(createFriendRequestAcceptedNotification({
      requesterId: 'user-a',
    })).rejects.toThrow('friendshipId is required')
  })
})
