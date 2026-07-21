import prisma from '../lib/prisma.js'

export async function saveMessage(chatId, senderId, content) {
  const [message] = await prisma.$transaction([
    prisma.activityMessage.create({
      data: { chat_id: chatId, sender_id: senderId, content },
      include: {
        sender: {
          select: { id: true, display_name: true, avatar_url: true },
        },
      },
    }),
    prisma.activityChat.update({
      where: { id: chatId },
      data: { last_message_at: new Date() },
    }),
  ])
  return message
}

export async function getMessages(chatId, { before, limit = 20 }) {
  const where = { chat_id: chatId }
  if (before) {
    where.created_at = { lt: new Date(before) }
  }

  const messages = await prisma.activityMessage.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: limit + 1,
    include: {
      sender: {
        select: { id: true, display_name: true, avatar_url: true },
      },
    },
  })

  const hasMore = messages.length > limit
  if (hasMore) messages.pop()

  return {
    data: messages,
    next_cursor: hasMore ? messages[messages.length - 1].created_at.toISOString() : null,
  }
}

export async function verifyParticipant(activityId, userId) {
  const participant = await prisma.activityParticipant.findUnique({
    where: { activity_id_user_id: { activity_id: activityId, user_id: userId } },
  })
  if (!participant || participant.status !== 'joined') return null
  return participant
}

export async function getChatByActivityId(activityId) {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { chat: true },
  })
  return activity?.chat ?? null
}
