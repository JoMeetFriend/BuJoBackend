import jwt from 'jsonwebtoken'
import {
  createLineAuthorizationUrl,
  exchangeLineCodeForToken,
  findOrCreateLineUser,
  verifyLineIdToken,
  verifyLineState,
} from '../services/lineService.js'
import { AUTH_COOKIE_OPTIONS } from '../lib/cookieOptions.js'

export async function lineLogin(req, res) {
  const url = await createLineAuthorizationUrl()

  res.redirect(url.toString())
}

export async function lineCallback(req, res) {
  const { code, state } = req.query

  if (!code) {
    return res.status(400).json({ error: '缺少 LINE authorization code' })
  }

  try {
    await verifyLineState(state)

    const tokenData = await exchangeLineCodeForToken(code)
    const lineProfile = await verifyLineIdToken(tokenData.id_token)
    const user = await findOrCreateLineUser(lineProfile)
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    })

    res.cookie('token', token, AUTH_COOKIE_OPTIONS)
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173')
  } catch (error) {
    console.error('LINE callback error:', error)
    res.status(500).json({ error: 'LINE 登入失敗' })
  }
}
