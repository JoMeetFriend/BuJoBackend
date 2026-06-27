import prisma from '../lib/prisma.js'

export const NOTIFICATION_TYPES = {
  FRIEND_REQUEST_CREATED: 'friend_request_created',
}

export const NOTIFICATION_REFERENCE_TYPES = {
  FRIENDSHIP: 'friendship',
}

export async function createNotification({
  userId,
  type,
  referenceId = null,
  referenceType = null,
}, db = prisma) {
  if (!userId) {
    throw new Error('userId is required')
  }

  if (!type) {
    throw new Error('type is required')
  }

  return db.notification.create({
    data: {
      user_id: userId,
      type,
      reference_id: referenceId,
      reference_type: referenceType,
      is_read: false,
    },
  })
}

export async function createFriendRequestNotification({
  receiverId,
  friendshipId,
}, db = prisma) {
  if (!receiverId) {
    throw new Error('receiverId is required')
  }

  if (!friendshipId) {
    throw new Error('friendshipId is required')
  }

  return createNotification({
    userId: receiverId,
    type: NOTIFICATION_TYPES.FRIEND_REQUEST_CREATED,
    referenceId: friendshipId,
    referenceType: NOTIFICATION_REFERENCE_TYPES.FRIENDSHIP,
  }, db)
}
