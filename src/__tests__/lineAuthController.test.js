import { jest } from '@jest/globals'

const createLineAuthorizationUrl = jest.fn()
const exchangeLineCodeForToken = jest.fn()
const findOrCreateLineUser = jest.fn()
const linkLineUser = jest.fn()
const verifyLineIdToken = jest.fn()
const verifyLineState = jest.fn()
const signToken = jest.fn(() => 'signed-token')

jest.unstable_mockModule('../services/lineService.js', () => ({
  createLineAuthorizationUrl,
  exchangeLineCodeForToken,
  findOrCreateLineUser,
  linkLineUser,
  verifyLineIdToken,
  verifyLineState,
}))

jest.unstable_mockModule('../lib/jwt.js', () => ({ signToken }))

const { lineCallback, lineLink, lineLogin } = await import('../controllers/lineAuthController.js')

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
  createLineAuthorizationUrl.mockResolvedValue(
    new URL('https://access.line.me/oauth2/v2.1/authorize'),
  )
})

describe('LINE OAuth entry points', () => {
  it('lineLogin 明確要求 normal prompt', async () => {
    const res = createResponse()

    await lineLogin({}, res)

    expect(createLineAuthorizationUrl).toHaveBeenCalledWith(null, 'normal')
    expect(res.redirect).toHaveBeenCalledWith(
      'https://access.line.me/oauth2/v2.1/authorize',
    )
  })

  it('lineLink 以目前使用者要求 aggressive prompt', async () => {
    const res = createResponse()

    await lineLink({ user: { userId: 'user-1' } }, res)

    expect(createLineAuthorizationUrl).toHaveBeenCalledWith('user-1', 'aggressive')
    expect(res.redirect).toHaveBeenCalledWith(
      'https://access.line.me/oauth2/v2.1/authorize',
    )
  })
})

describe('lineCallback state-first mode detection', () => {
  it('有效 link attempt 取消時先驗證 state，再回個人設定頁', async () => {
    const res = createResponse()
    verifyLineState.mockResolvedValue({ user_id: 'user-1' })

    await lineCallback(
      { query: { state: 'link-state', error: 'access_denied' } },
      res,
    )

    expect(verifyLineState).toHaveBeenCalledWith('link-state')
    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/profile/edit?error=line_link_cancelled',
    )
    expect(exchangeLineCodeForToken).not.toHaveBeenCalled()
  })

  it('有效 link attempt 缺少 code 時先驗證 state，再回綁定失敗', async () => {
    const res = createResponse()
    verifyLineState.mockResolvedValue({ user_id: 'user-1' })

    await lineCallback({ query: { state: 'link-state' } }, res)

    expect(verifyLineState).toHaveBeenCalledWith('link-state')
    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/profile/edit?error=line_link_failed',
    )
    expect(exchangeLineCodeForToken).not.toHaveBeenCalled()
  })

  it('access_denied 搭配 invalid state 時不得宣稱 link 或 cancellation mode', async () => {
    const res = createResponse()
    verifyLineState.mockRejectedValue(new Error('OAuth state 無效'))

    await lineCallback(
      { query: { state: 'invalid-state', error: 'access_denied' } },
      res,
    )

    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/login?error=line_login_failed',
    )
    expect(exchangeLineCodeForToken).not.toHaveBeenCalled()
    expect(verifyLineIdToken).not.toHaveBeenCalled()
    expect(linkLineUser).not.toHaveBeenCalled()
    expect(findOrCreateLineUser).not.toHaveBeenCalled()
    expect(res.cookie).not.toHaveBeenCalled()
  })
})

describe('lineCallback outcome matrix', () => {
  it('login 成功時建立或取得使用者、簽發 cookie 並回前端首頁', async () => {
    const res = createResponse()
    const lineProfile = { sub: 'line-user-1', name: 'LINE User' }
    verifyLineState.mockResolvedValueOnce({ user_id: null })
    exchangeLineCodeForToken.mockResolvedValueOnce({ id_token: 'line-id-token' })
    verifyLineIdToken.mockResolvedValueOnce(lineProfile)
    findOrCreateLineUser.mockResolvedValueOnce({ id: 'user-1' })

    await lineCallback({ query: { state: 'login-state', code: 'line-code' } }, res)

    expect(exchangeLineCodeForToken).toHaveBeenCalledWith('line-code')
    expect(verifyLineIdToken).toHaveBeenCalledWith('line-id-token')
    expect(findOrCreateLineUser).toHaveBeenCalledWith(lineProfile)
    expect(linkLineUser).not.toHaveBeenCalled()
    expect(signToken).toHaveBeenCalledWith('user-1')
    expect(res.cookie).toHaveBeenCalledWith('token', 'signed-token', expect.any(Object))
    expect(res.redirect).toHaveBeenCalledWith('http://frontend.test')
  })

  it('login 取消時回登入頁且不簽發 cookie', async () => {
    const res = createResponse()
    verifyLineState.mockResolvedValueOnce({ user_id: null })

    await lineCallback(
      { query: { state: 'login-state', error: 'access_denied' } },
      res,
    )

    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/login?error=line_cancelled',
    )
    expect(res.cookie).not.toHaveBeenCalled()
  })

  it('login token exchange 失敗時回登入失敗且不簽發 cookie', async () => {
    const res = createResponse()
    verifyLineState.mockResolvedValueOnce({ user_id: null })
    exchangeLineCodeForToken.mockRejectedValueOnce(new Error('exchange failed'))

    await lineCallback({ query: { state: 'login-state', code: 'bad-code' } }, res)

    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/login?error=line_login_failed',
    )
    expect(res.cookie).not.toHaveBeenCalled()
  })

  it('link 成功時只綁定 attempt user 並回個人設定成功頁', async () => {
    const res = createResponse()
    const lineProfile = { sub: 'line-user-1' }
    verifyLineState.mockResolvedValueOnce({ user_id: 'user-1' })
    exchangeLineCodeForToken.mockResolvedValueOnce({ id_token: 'line-id-token' })
    verifyLineIdToken.mockResolvedValueOnce(lineProfile)
    linkLineUser.mockResolvedValueOnce(undefined)

    await lineCallback({ query: { state: 'link-state', code: 'line-code' } }, res)

    expect(linkLineUser).toHaveBeenCalledWith(lineProfile, 'user-1')
    expect(findOrCreateLineUser).not.toHaveBeenCalled()
    expect(res.cookie).not.toHaveBeenCalled()
    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/profile/edit?linked=line',
    )
  })

  it('link token exchange 失敗時留在個人設定頁且不簽發 cookie', async () => {
    const res = createResponse()
    verifyLineState.mockResolvedValueOnce({ user_id: 'user-1' })
    exchangeLineCodeForToken.mockRejectedValueOnce(new Error('exchange failed'))

    await lineCallback({ query: { state: 'link-state', code: 'bad-code' } }, res)

    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/profile/edit?error=line_link_failed',
    )
    expect(res.cookie).not.toHaveBeenCalled()
  })

  it('LINE provider 已屬其他帳號時回綁定失敗且不改成 login', async () => {
    const res = createResponse()
    const lineProfile = { sub: 'line-user-owned-by-other-account' }
    verifyLineState.mockResolvedValueOnce({ user_id: 'user-1' })
    exchangeLineCodeForToken.mockResolvedValueOnce({ id_token: 'line-id-token' })
    verifyLineIdToken.mockResolvedValueOnce(lineProfile)
    linkLineUser.mockRejectedValueOnce(new Error('此 LINE 帳號已綁定其他帳號'))

    await lineCallback({ query: { state: 'link-state', code: 'line-code' } }, res)

    expect(linkLineUser).toHaveBeenCalledWith(lineProfile, 'user-1')
    expect(res.redirect).toHaveBeenCalledWith(
      'http://frontend.test/profile/edit?error=line_link_failed',
    )
    expect(res.cookie).not.toHaveBeenCalled()
  })
})
