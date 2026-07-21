import { jest } from '@jest/globals'

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: {
    user: { create: jest.fn(), findUnique: jest.fn() },
    userIdentity: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  }
}))

const { default: request } = await import('supertest')
const { default: app } = await import('../app.js')

describe('i18n：多語言回應訊息', () => {
  it('沒有帶 Accept-Language 時，預設回傳繁體中文訊息', async () => {
    const res = await request(app).post('/api/auth/signup').send({})

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ message: '缺少必要欄位' })
  })

  it('帶 Accept-Language: en-US 時，回傳英文訊息', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Accept-Language', 'en-US')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ message: 'Missing required fields' })
  })

  it('帶 Accept-Language: en-GB（非 en-US 的英文變體）也要回傳英文訊息', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Accept-Language', 'en-GB')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ message: 'Missing required fields' })
  })

  it('?lng=en query 參數可以覆蓋語言（優先於 Accept-Language header，且跟前端的語言代碼一致）', async () => {
    const res = await request(app)
      .post('/api/auth/signup?lng=en')
      .set('Accept-Language', 'zh-TW')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ message: 'Missing required fields' })
  })
})
