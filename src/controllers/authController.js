const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_NAME = 'token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

async function signup(req, res) {
  const { email, password, display_name } = req.body;

  if (!email || !password || !display_name) {
    return res.status(400).json({ message: '缺少必要欄位' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: 'email 格式不正確' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'password 至少需要 8 個字元' });
  }

  const existing = await prisma.userIdentity.findFirst({
    where: { provider: 'local', provider_user_id: email },
  });
  if (existing) {
    return res.status(409).json({ message: 'email 已被註冊' });
  }

  const password_hash = await bcrypt.hash(password, 10);

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
  });

  const token = signToken(user.id);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

  return res.status(201).json({ user: { id: user.id, display_name: user.display_name, created_at: user.created_at } });
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: '缺少必要欄位' });
  }

  const identity = await prisma.userIdentity.findFirst({
    where: { provider: 'local', provider_user_id: email },
    include: { user: true },
  });
  if (!identity) {
    return res.status(401).json({ message: '帳號或密碼錯誤' });
  }

  const valid = await bcrypt.compare(password, identity.password_hash);
  if (!valid) {
    return res.status(401).json({ message: '帳號或密碼錯誤' });
  }

  const token = signToken(identity.user.id);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

  return res.status(200).json({ user: { id: identity.user.id, display_name: identity.user.display_name } });
}

async function me(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, display_name: true, avatar_url: true, created_at: true },
  });
  if (!user) return res.status(404).json({ message: '用戶不存在' });
  return res.json({ user });
}

module.exports = { signup, login, me };
