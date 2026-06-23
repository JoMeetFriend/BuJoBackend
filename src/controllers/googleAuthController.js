import jwt from 'jsonwebtoken'

export async function googleLogin(req, res) {
  const { default: prisma } = await import('../lib/prisma.js')
  const { token } = req.body

  try {
    // 步驟一：問 Google 這個 token 是誰的
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const userInfo = await response.json()

    if (!userInfo.email) {
      return res.status(401).json({ error: '無法取得使用者資訊' })
    }

    // 步驟二：在 UserIdentity 找這個 Google 帳號
    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_provider_user_id: {
          provider: 'google',
          provider_user_id: userInfo.sub
        }
      },
      include: { user: true }
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
              email: userInfo.email
            }
          }
        }
      })
    } else {
      user = identity.user
    }

    // 步驟三：發我們自己的 JWT
    const ourToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({
      token: ourToken,
      user: {
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        email: userInfo.email
      }
    })

  } catch (error) {
    console.error('後端錯誤：', error)
    res.status(500).json({ error: '伺服器錯誤' })
  }
}
