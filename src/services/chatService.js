import prisma from '../lib/prisma.js'

export async function saveMessage(chatId, senderId, content) {
  const message = await prisma.activityMessage.create({
    data: { chat_id: chatId, sender_id: senderId, content },
    include: {
      sender: {
        select: { id: true, display_name: true, avatar_url: true },
      },
    },
  })

  await prisma.activityChat.update({
    where: { id: chatId },
    data: { last_message_at: new Date() },
  }).catch(() => {})

  return message
}

export async function getMessages(chatId, { before, limit = 20 }) {
  const where = { chat_id: chatId }
  if (before) {
    const sepIdx = before.lastIndexOf('_')
    if (sepIdx !== -1) {
      const ts = before.slice(0, sepIdx)
      const id = before.slice(sepIdx + 1)
      where.OR = [
        { created_at: { lt: new Date(ts) } },
        { created_at: new Date(ts), id: { lt: id } },
      ]
    } else {
      where.created_at = { lt: new Date(before) }
    }
  }

  const messages = await prisma.activityMessage.findMany({
    where,
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
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
    next_cursor: hasMore
      ? `${messages[messages.length - 1].created_at.toISOString()}_${messages[messages.length - 1].id}`
      : null,
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
