import jwt from 'jsonwebtoken'

function authenticate(req, res, next) {
  const token = req.cookies?.token
  if (!token) {
    return res.status(401).json({ message: req.t('auth.notLoggedIn') })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { userId: payload.userId }
    next()
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
      return res.status(401).json({ message: req.t('auth.invalidOrExpiredToken') })
    }
    return res.status(500).json({ message: req.t('common.serverError') })
  }
}

export default authenticate
