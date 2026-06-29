import {
  createLineAuthorizationUrl,
  exchangeLineCodeForToken,
  findOrCreateLineUser,
  verifyLineIdToken,
  verifyLineState,
} from '../services/lineService.js'
import { AUTH_COOKIE_OPTIONS } from '../lib/cookieOptions.js'
import { signToken } from '../lib/jwt.js'

export async function lineLogin(req, res) {
  const url = await createLineAuthorizationUrl()

  res.redirect(url.toString())
}

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:5173'

export async function lineCallback(req, res) {
  const { code, state, error } = req.query

  if (error === 'access_denied') {
    return res.redirect(`${FRONTEND_URL()}?error=line_cancelled`)
  }
  if (!code) {
    return res.redirect(`${FRONTEND_URL()}?error=line_login_failed`)
  }

  try {
    await verifyLineState(state)

    const tokenData = await exchangeLineCodeForToken(code)
    const lineProfile = await verifyLineIdToken(tokenData.id_token)
    const user = await findOrCreateLineUser(lineProfile)

    res.cookie('token', signToken(user.id), AUTH_COOKIE_OPTIONS)
    res.redirect(FRONTEND_URL())
  } catch (error) {
    console.error('LINE callback error:', error)
    res.redirect(`${FRONTEND_URL()}?error=line_login_failed`)
  }
}
