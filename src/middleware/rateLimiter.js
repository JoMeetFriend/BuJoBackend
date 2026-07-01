import rateLimit from 'express-rate-limit'

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: '登入嘗試次數過多，請 15 分鐘後再試' },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { message: '註冊次數過多，請 1 小時後再試' },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})
