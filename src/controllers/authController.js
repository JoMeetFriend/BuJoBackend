import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma.js'
import { AUTH_COOKIE_OPTIONS } from '../lib/cookieOptions.js'
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
}

export async function login(req, res) {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: '缺少必要欄位' })
  }

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
}

export function logout(req, res) {
  res.clearCookie('token', AUTH_COOKIE_OPTIONS)
  return res.status(200).json({ message: '已登出' })
}

export async function me(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, display_name: true, avatar_url: true, created_at: true },
  })
  if (!user) return res.status(404).json({ message: '用戶不存在' })
  return res.json({ user })
}
