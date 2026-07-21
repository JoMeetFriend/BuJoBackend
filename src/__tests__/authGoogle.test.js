import { jest } from '@jest/globals'

const createGoogleAuthorizationUrl = jest.fn()
const exchangeGoogleCodeForToken = jest.fn()
const findOrCreateGoogleUser = jest.fn()
const linkGoogleUser = jest.fn()
const verifyGoogleIdToken = jest.fn()
const verifyGoogleState = jest.fn()
const signToken = jest.fn(() => 'signed-token')

jest.unstable_mockModule('../services/googleService.js', () => ({
  createGoogleAuthorizationUrl,
  exchangeGoogleCodeForToken,
  findOrCreateGoogleUser,
  linkGoogleUser,
  verifyGoogleIdToken,
  verifyGoogleState,
}))

jest.unstable_mockModule('../lib/jwt.js', () => ({ signToken }))

const { googleCallback, googleLink, googleLogin } = await import(
  '../controllers/googleAuthController.js'
)

function createResponse() {
  return {
    cookie: jest.fn(),
    redirect: jest.fn(),
  }
}

let consoleErrorSpy

beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterAll(() => {
  consoleErrorSpy.mockRestore()
})

beforeEach(() => {
  jest.resetAllMocks()
  process.env.FRONTEND_URL = 'http://frontend.test'
  signToken.mockReturnValue('signed-token')
  createGoogleAuthorizationUrl.mockResolvedValue(
    new URL('https://accounts.google.com/o/oauth2/v2/auth'),
  )
})

describe('Google OAuth entry points', () => {
  it('googleLogin 以匿名身份建立 authorization url 並導頁', async () => {
    const res = createResponse()

    await googleLogin({}, res)

    expect(createGoogleAuthorizationUrl).toHaveBeenCalledWith(null)
    expect(res.redirect).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth')
  })

  it('googleLink 以目前使用者建立 authorization url 並導頁', async () => {
    const res = createResponse()

    await googleLink({ user: { userId: 'user-1' } }, res)

    expect(createGoogleAuthorizationUrl).toHaveBeenCalledWith('user-1')
    expect(res.redirect).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth')
  })

  it('googleLogin 建立 authorization url 失敗時導回登入失敗頁', async () => {
    const res = createResponse()
    createGoogleAuthorizationUrl.mockRejectedValueOnce(new Error('config missing'))

    await googleLogin({}, res)

    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/login?error=google_login_failed',
    )
  })

  it('googleLink 建立 authorization url 失敗時導回綁定失敗頁', async () => {
    const res = createResponse()
    createGoogleAuthorizationUrl.mockRejectedValueOnce(new Error('config missing'))

    await googleLink({ user: { userId: 'user-1' } }, res)

    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/profile/edit?error=google_link_failed',
    )
  })
})

describe('googleCallback state-first mode detection', () => {
  it('有效 link attempt 取消時先驗證 state，再回個人設定頁', async () => {
    const res = createResponse()
    verifyGoogleState.mockResolvedValue({ user_id: 'user-1' })

    await googleCallback({ query: { state: 'link-state', error: 'access_denied' } }, res)

    expect(verifyGoogleState).toHaveBeenCalledWith('link-state')
    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/profile/edit?error=google_link_cancelled',
    )
    expect(exchangeGoogleCodeForToken).not.toHaveBeenCalled()
  })

  it('有效 link attempt 缺少 code 時先驗證 state，再回綁定失敗', async () => {
    const res = createResponse()
    verifyGoogleState.mockResolvedValue({ user_id: 'user-1' })

    await googleCallback({ query: { state: 'link-state' } }, res)

    expect(verifyGoogleState).toHaveBeenCalledWith('link-state')
    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/profile/edit?error=google_link_failed',
    )
    expect(exchangeGoogleCodeForToken).not.toHaveBeenCalled()
  })

  it('access_denied 搭配 invalid state 時不得宣稱 link 或 cancellation mode', async () => {
    const res = createResponse()
    verifyGoogleState.mockRejectedValue(new Error('OAuth state 無效'))

    await googleCallback({ query: { state: 'invalid-state', error: 'access_denied' } }, res)

    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/login?error=google_login_failed',
    )
    expect(exchangeGoogleCodeForToken).not.toHaveBeenCalled()
    expect(verifyGoogleIdToken).not.toHaveBeenCalled()
    expect(linkGoogleUser).not.toHaveBeenCalled()
    expect(findOrCreateGoogleUser).not.toHaveBeenCalled()
    expect(res.cookie).not.toHaveBeenCalled()
  })
})

describe('googleCallback outcome matrix', () => {
  it('login 成功時建立或取得使用者、簽發 cookie 並回前端首頁', async () => {
    const res = createResponse()
    const googlePayload = { sub: 'google-user-1', email: 'test@gmail.com', name: 'Test User' }
    verifyGoogleState.mockResolvedValueOnce({ user_id: null })
    exchangeGoogleCodeForToken.mockResolvedValueOnce({ id_token: 'google-id-token' })
    verifyGoogleIdToken.mockResolvedValueOnce(googlePayload)
    findOrCreateGoogleUser.mockResolvedValueOnce({ id: 'user-1' })

    await googleCallback({ query: { state: 'login-state', code: 'google-code' } }, res)

    expect(exchangeGoogleCodeForToken).toHaveBeenCalledWith('google-code')
    expect(verifyGoogleIdToken).toHaveBeenCalledWith('google-id-token')
    expect(findOrCreateGoogleUser).toHaveBeenCalledWith(googlePayload)
    expect(linkGoogleUser).not.toHaveBeenCalled()
    expect(signToken).toHaveBeenCalledWith('user-1')
    expect(res.cookie).toHaveBeenCalledWith('token', 'signed-token', expect.any(Object))
    expect(res.redirect).toHaveBeenCalledWith('http://frontend.test')
  })

  it('login 取消時回登入頁且不簽發 cookie', async () => {
    const res = createResponse()
    verifyGoogleState.mockResolvedValueOnce({ user_id: null })

    await googleCallback({ query: { state: 'login-state', error: 'access_denied' } }, res)

    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/login?error=google_cancelled',
    )
    expect(res.cookie).not.toHaveBeenCalled()
  })

  it('login token exchange 失敗時回登入失敗且不簽發 cookie', async () => {
    const res = createResponse()
    verifyGoogleState.mockResolvedValueOnce({ user_id: null })
    exchangeGoogleCodeForToken.mockRejectedValueOnce(new Error('exchange failed'))

    await googleCallback({ query: { state: 'login-state', code: 'bad-code' } }, res)

    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/login?error=google_login_failed',
    )
    expect(res.cookie).not.toHaveBeenCalled()
  })

  it('link 成功時只綁定 attempt user 並回個人設定成功頁', async () => {
    const res = createResponse()
    const googlePayload = { sub: 'google-user-1', email: 'test@gmail.com' }
    verifyGoogleState.mockResolvedValueOnce({ user_id: 'user-1' })
    exchangeGoogleCodeForToken.mockResolvedValueOnce({ id_token: 'google-id-token' })
    verifyGoogleIdToken.mockResolvedValueOnce(googlePayload)
    linkGoogleUser.mockResolvedValueOnce(undefined)

    await googleCallback({ query: { state: 'link-state', code: 'google-code' } }, res)

    expect(linkGoogleUser).toHaveBeenCalledWith(googlePayload, 'user-1')
    expect(findOrCreateGoogleUser).not.toHaveBeenCalled()
    expect(res.cookie).not.toHaveBeenCalled()
    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/profile/edit?linked=google',
    )
  })

  it('link token exchange 失敗時留在個人設定頁且不簽發 cookie', async () => {
    const res = createResponse()
    verifyGoogleState.mockResolvedValueOnce({ user_id: 'user-1' })
    exchangeGoogleCodeForToken.mockRejectedValueOnce(new Error('exchange failed'))

    await googleCallback({ query: { state: 'link-state', code: 'bad-code' } }, res)

    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/profile/edit?error=google_link_failed',
    )
    expect(res.cookie).not.toHaveBeenCalled()
  })

  it('Google provider 已屬其他帳號時回綁定失敗且不改成 login', async () => {
    const res = createResponse()
    const googlePayload = { sub: 'google-user-owned-by-other-account', email: 'test@gmail.com' }
    verifyGoogleState.mockResolvedValueOnce({ user_id: 'user-1' })
    exchangeGoogleCodeForToken.mockResolvedValueOnce({ id_token: 'google-id-token' })
    verifyGoogleIdToken.mockResolvedValueOnce(googlePayload)
    linkGoogleUser.mockRejectedValueOnce(new Error('此 Google 帳號已綁定其他帳號'))

    await googleCallback({ query: { state: 'link-state', code: 'google-code' } }, res)

    expect(linkGoogleUser).toHaveBeenCalledWith(googlePayload, 'user-1')
    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/profile/edit?error=google_link_failed',
    )
    expect(res.cookie).not.toHaveBeenCalled()
  })
})
