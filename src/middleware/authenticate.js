import jwt from 'jsonwebtoken'

function authenticate(req, res, next) {
  const token = req.cookies?.token
  if (!token) {
    return res.status(401).json({ message: '未登入' })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { userId: payload.userId }
    next()
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
      return res.status(401).json({ message: 'token 無效或已過期' })
    }
    return res.status(500).json({ message: '伺服器錯誤' })
  }
}

export default authenticate
