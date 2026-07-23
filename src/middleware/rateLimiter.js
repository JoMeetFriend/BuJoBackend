import rateLimit from 'express-rate-limit'

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: (req) => ({ message: req.t('rateLimiter.loginTooMany') }),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: (req) => ({ message: req.t('rateLimiter.signupTooMany') }),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

// 掛在 authenticate 之後，req.user.userId 一定存在，用登入使用者計算配額，
// 避免同一個 NAT/公司網路後面的多個使用者共用同一組 IP 配額互相卡到
export const placesLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  message: (req) => ({ message: req.t('rateLimiter.searchTooMany') }),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user.userId,
})

export const chatMessageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: (req) => ({ message: req.t('rateLimiter.chatTooMany') }),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user.userId}:${req.params.id}`,
})
