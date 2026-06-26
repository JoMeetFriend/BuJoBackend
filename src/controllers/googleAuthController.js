import { OAuth2Client } from 'google-auth-library'
import { AUTH_COOKIE_OPTIONS } from '../lib/cookieOptions.js'
import { signToken } from '../lib/jwt.js'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export async function googleLogin(req, res) {
  const { default: prisma } = await import('../lib/prisma.js')
  const { token } = req.body

  if (!token) {
    return res.status(400).json({ error: '缺少 token' })
  }

  try {
    // 步驟一：驗證 ID token，同時確認 audience 是本應用程式
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const userInfo = ticket.getPayload()

    if (!userInfo?.email) {
      return res.status(401).json({ error: '無法取得使用者資訊' })
    }

    // 步驟二：在 UserIdentity 找這個 Google 帳號
    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_provider_user_id: {
          provider: 'google',
          provider_user_id: userInfo.sub,
        },
      },
      include: { user: true },
    })

    let user
    if (!identity) {
      // 找不到就同時建立 User 和 UserIdentity
      user = await prisma.user.create({
        data: {
          display_name: userInfo.name,
          avatar_url: userInfo.picture,
          identities: {
            create: {
              provider: 'google',
              provider_user_id: userInfo.sub,
              email: userInfo.email,
            },
          },
        },
      })
    } else {
      user = identity.user
    }

    // 步驟三：發我們自己的 JWT，存進 httpOnly cookie
    res.cookie('token', signToken(user.id), AUTH_COOKIE_OPTIONS)

    res.json({
      user: {
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        email: userInfo.email,
      },
    })
  } catch (error) {
    console.error('Google 登入錯誤：', error)
    // verifyIdToken 在 token 無效或 audience 不符時會拋出錯誤
    if (error.message?.includes('Token used too late') || error.message?.includes('Invalid token')) {
      return res.status(401).json({ error: 'Google token 無效或已過期' })
    }
    res.status(500).json({ error: '伺服器錯誤' })
  }
}
