import {
  createLineAuthorizationUrl,
  exchangeLineCodeForToken,
  findOrCreateLineUser,
  linkLineUser,
  verifyLineIdToken,
  verifyLineState,
} from '../services/lineService.js'
import { AUTH_COOKIE_OPTIONS } from '../lib/cookieOptions.js'
import { signToken } from '../lib/jwt.js'

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:5173'

export async function lineLogin(req, res) {
  const url = await createLineAuthorizationUrl()
  res.redirect(url.toString())
}

export async function lineLink(req, res) {
  const url = await createLineAuthorizationUrl(req.user.userId)
  res.redirect(url.toString())
}

export async function lineCallback(req, res) {
  const { code, state, error } = req.query

  if (error === 'access_denied') {
    return res.redirect(`${FRONTEND_URL()}/login?error=line_cancelled`)
  }
  if (!code) {
    return res.redirect(`${FRONTEND_URL()}/login?error=line_login_failed`)
  }

  try {
    const attempt = await verifyLineState(state)
    const tokenData = await exchangeLineCodeForToken(code)
    const lineProfile = await verifyLineIdToken(tokenData.id_token)

    if (attempt.user_id) {
      await linkLineUser(lineProfile, attempt.user_id)
      return res.redirect(`${FRONTEND_URL()}/profile/edit?linked=line`)
    }

    const user = await findOrCreateLineUser(lineProfile)
    res.cookie('token', signToken(user.id), AUTH_COOKIE_OPTIONS)
    res.redirect(FRONTEND_URL())
  } catch (err) {
    console.error('LINE callback error:', err)
    res.redirect(`${FRONTEND_URL()}/login?error=line_login_failed`)
  }
}
