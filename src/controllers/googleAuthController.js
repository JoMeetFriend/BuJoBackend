import { OAuth2Client } from 'google-auth-library'
import prisma from '../lib/prisma.js'
import { AUTH_COOKIE_OPTIONS } from '../lib/cookieOptions.js'
import { signToken } from '../lib/jwt.js'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export async function googleLogin(req, res) {
  const { credential } = req.body

  if (!credential) {
    return res.status(400).json({ error: '缺少 Google ID Token' })
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()

    if (!payload?.email) {
      return res.status(401).json({ error: '無法取得使用者資訊' })
    }

    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_provider_user_id: {
          provider: 'google',
          provider_user_id: payload.sub,
        },
      },
      include: { user: true },
    })

    let user
    if (!identity) {
      user = await prisma.user.create({
        data: {
          display_name: payload.name,
          avatar_url: payload.picture ?? null,
          identities: {
            create: {
              provider: 'google',
              provider_user_id: payload.sub,
              email: payload.email,
            },
          },
        },
      })
    } else {
      user = identity.user
    }

    res.cookie('token', signToken(user.id), AUTH_COOKIE_OPTIONS)
    return res.json({
      user: {
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        email: payload.email,
      },
    })
  } catch (error) {
    console.error('Google 登入錯誤：', error)
    return res.status(500).json({ error: '伺服器錯誤' })
  }
}
