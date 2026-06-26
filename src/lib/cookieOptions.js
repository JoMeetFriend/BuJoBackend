const isProd = process.env.NODE_ENV === 'production'

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
}
