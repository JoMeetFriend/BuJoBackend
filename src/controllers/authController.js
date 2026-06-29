import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma.js'
import { AUTH_COOKIE_OPTIONS, CLEAR_COOKIE_OPTIONS } from '../lib/cookieOptions.js'
import { signToken } from '../lib/jwt.js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COOKIE_NAME = 'token'


export async function signup(req, res) {
  const { email, password, display_name } = req.body

  if (!email || !password || !display_name) {
    return res.status(400).json({ message: '缺少必要欄位' })
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: 'email 格式不正確' })
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'password 至少需要 8 個字元' })
  }

  try {
    const existing = await prisma.userIdentity.findFirst({
      where: { provider: 'local', provider_user_id: email },
    })
    if (existing) {
      return res.status(409).json({ message: 'email 已被註冊' })
    }

    const password_hash = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        display_name,
        identities: {
          create: {
            provider: 'local',
            provider_user_id: email,
            email,
            password_hash,
          },
        },
      },
    })

    const token = signToken(user.id)
    res.cookie(COOKIE_NAME, token, AUTH_COOKIE_OPTIONS)

    return res.status(201).json({ user: { id: user.id, display_name: user.display_name, created_at: user.created_at } })
  } catch (error) {
    console.error('signup 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

export async function login(req, res) {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: '缺少必要欄位' })
  }

  try {
    const identity = await prisma.userIdentity.findFirst({
      where: { provider: 'local', provider_user_id: email },
      include: { user: true },
    })
    if (!identity) {
      return res.status(401).json({ message: '帳號或密碼錯誤' })
    }

    const valid = await bcrypt.compare(password, identity.password_hash)
    if (!valid) {
      return res.status(401).json({ message: '帳號或密碼錯誤' })
    }

    const token = signToken(identity.user.id)
    res.cookie(COOKIE_NAME, token, AUTH_COOKIE_OPTIONS)

    return res.status(200).json({ user: { id: identity.user.id, display_name: identity.user.display_name } })
  } catch (error) {
    console.error('login 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

export function logout(req, res) {
  res.clearCookie('token', CLEAR_COOKIE_OPTIONS)
  return res.status(200).json({ message: '已登出' })
}

export async function me(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        display_name: true,
        avatar_url: true,
        created_at: true,
        identities: { select: { provider: true, email: true } },
      },
    })
    if (!user) return res.status(404).json({ message: '用戶不存在' })
    return res.json({ user })
  } catch (error) {
    console.error('me 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

export async function unlinkProvider(req, res) {
  const { provider } = req.params
  const userId = req.user.userId

  if (!['local', 'google', 'line'].includes(provider)) {
    return res.status(400).json({ error: '不支援的登入方式' })
  }

  try {
    const identities = await prisma.userIdentity.findMany({ where: { user_id: userId } })

    if (identities.length <= 1) {
      return res.status(400).json({ error: '無法解除最後一個登入方式，請先新增其他登入方式' })
    }

    const target = identities.find((i) => i.provider === provider)
    if (!target) {
      return res.status(404).json({ error: '該登入方式未連結' })
    }

    await prisma.userIdentity.delete({ where: { id: target.id } })
    return res.json({ message: '已解除連結' })
  } catch (error) {
    console.error('unlink 錯誤：', error)
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}
