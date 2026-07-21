import {
  createGoogleAuthorizationUrl,
  exchangeGoogleCodeForToken,
  findOrCreateGoogleUser,
  linkGoogleUser,
  verifyGoogleIdToken,
  verifyGoogleState,
} from '../services/googleService.js'
import { AUTH_COOKIE_OPTIONS } from '../lib/cookieOptions.js'
import { signToken } from '../lib/jwt.js'

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:5173'

export async function googleLogin(req, res) {
  try {
    const url = await createGoogleAuthorizationUrl(null)
    res.redirect(url.toString())
  } catch (err) {
    console.error('Google login error:', err)
    res.redirect(`${FRONTEND_URL()}/login?error=google_login_failed`)
  }
}

export async function googleLink(req, res) {
  try {
    const url = await createGoogleAuthorizationUrl(req.user.userId)
    res.redirect(url.toString())
  } catch (err) {
    console.error('Google link error:', err)
    res.redirect(`${FRONTEND_URL()}/profile/edit?error=google_link_failed`)
  }
}

export async function googleCallback(req, res) {
  const { code, state, error } = req.query
  let isLinkAttempt = false

  try {
    const attempt = await verifyGoogleState(state)
    isLinkAttempt = attempt.user_id !== null

    if (error === 'access_denied') {
      const path = isLinkAttempt
        ? '/profile/edit?error=google_link_cancelled'
        : '/login?error=google_cancelled'
      return res.redirect(`${FRONTEND_URL()}${path}`)
    }

    if (error || !code) {
      const path = isLinkAttempt
        ? '/profile/edit?error=google_link_failed'
        : '/login?error=google_login_failed'
      return res.redirect(`${FRONTEND_URL()}${path}`)
    }

    const tokenData = await exchangeGoogleCodeForToken(code)
    const payload = await verifyGoogleIdToken(tokenData.id_token)

    if (isLinkAttempt) {
      await linkGoogleUser(payload, attempt.user_id)
      return res.redirect(`${FRONTEND_URL()}/profile/edit?linked=google`)
    }

    const user = await findOrCreateGoogleUser(payload)
    res.cookie('token', signToken(user.id), AUTH_COOKIE_OPTIONS)
    res.redirect(FRONTEND_URL())
  } catch (err) {
    console.error('Google callback error:', err)
    const path = isLinkAttempt
      ? '/profile/edit?error=google_link_failed'
      : '/login?error=google_login_failed'
    return res.redirect(`${FRONTEND_URL()}${path}`)
  }
}
