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
  try {
    const url = await createLineAuthorizationUrl(null, 'normal')
    res.redirect(url.toString())
  } catch (err) {
    console.error('LINE login error:', err)
    res.redirect(`${FRONTEND_URL()}/login?error=line_login_failed`)
  }
}

export async function lineLink(req, res) {
  try {
    const url = await createLineAuthorizationUrl(req.user.userId, 'aggressive')
    res.redirect(url.toString())
  } catch (err) {
    console.error('LINE link error:', err)
    res.redirect(`${FRONTEND_URL()}/profile/edit?error=line_link_failed`)
  }
}

export async function lineCallback(req, res) {
  const { code, state, error } = req.query
  let isLinkAttempt = false

  try {
    const attempt = await verifyLineState(state)
    isLinkAttempt = attempt.user_id !== null

    if (error === 'access_denied') {
      const path = isLinkAttempt
        ? '/profile/edit?error=line_link_cancelled'
        : '/login?error=line_cancelled'
      return res.redirect(`${FRONTEND_URL()}${path}`)
    }

    if (error || !code) {
      const path = isLinkAttempt
        ? '/profile/edit?error=line_link_failed'
        : '/login?error=line_login_failed'
      return res.redirect(`${FRONTEND_URL()}${path}`)
    }

    const tokenData = await exchangeLineCodeForToken(code)
    const lineProfile = await verifyLineIdToken(tokenData.id_token)

    if (isLinkAttempt) {
      await linkLineUser(lineProfile, attempt.user_id)
      return res.redirect(`${FRONTEND_URL()}/profile/edit?linked=line`)
    }

    const user = await findOrCreateLineUser(lineProfile)
    res.cookie('token', signToken(user.id), AUTH_COOKIE_OPTIONS)
    res.redirect(FRONTEND_URL())
  } catch (err) {
    console.error('LINE callback error:', err)
    const path = isLinkAttempt
      ? '/profile/edit?error=line_link_failed'
      : '/login?error=line_login_failed'
    return res.redirect(`${FRONTEND_URL()}${path}`)
  }
}
