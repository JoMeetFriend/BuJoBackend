const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');

jest.mock('../lib/prisma');
const prisma = require('../lib/prisma');

function makeToken(payload = { userId: 'user-uuid-1' }, options = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h', ...options });
}

describe('GET /api/auth/me', () => {
  it('有效 token → 200 + user 資料', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-uuid-1',
      display_name: 'Test User',
      avatar_url: null,
      created_at: new Date(),
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `token=${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'user-uuid-1', display_name: 'Test User' });
  });

  it('沒有 token → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('token 無效（亂碼）→ 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'token=invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('token 已過期 → 401', async () => {
    const expiredToken = makeToken({ userId: 'user-uuid-1' }, { expiresIn: '-1s' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `token=${expiredToken}`);
    expect(res.status).toBe(401);
  });
});
