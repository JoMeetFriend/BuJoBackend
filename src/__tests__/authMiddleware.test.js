const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');

jest.mock('../lib/prisma');
const prisma = require('../lib/prisma');

// ─── Signup ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/signup', () => {
  it('4. 註冊成功 — 新用戶，回傳 201 + user 資料 + httpOnly cookie', async () => {
    prisma.userIdentity.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-uuid-1',
      display_name: 'Test User',
      created_at: new Date(),
    });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'new@example.com', password: 'password123', display_name: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: 'user-uuid-1', display_name: 'Test User' });
    expect(res.body.user.password_hash).toBeUndefined();

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/token=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('5. 註冊失敗 — email 已存在，回傳 409', async () => {
    prisma.userIdentity.findFirst.mockResolvedValue({
      id: 'identity-1',
      provider: 'local',
      provider_user_id: 'existing@example.com',
    });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'existing@example.com', password: 'password123', display_name: 'Test User' });

    expect(res.status).toBe(409);
  });

  it('6. 註冊失敗 — email 格式不對，回傳 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'not-an-email', password: 'password123', display_name: 'Test User' });

    expect(res.status).toBe(400);
  });

  it('7. 註冊失敗 — password 太短（少於 8 字元），回傳 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'test@example.com', password: '123', display_name: 'Test User' });

    expect(res.status).toBe(400);
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('1. 登入成功 — 有效帳密，回傳 200 + user 資料 + httpOnly cookie', async () => {
    const hash = await bcrypt.hash('password123', 10);

    prisma.userIdentity.findFirst.mockResolvedValue({
      id: 'identity-1',
      provider: 'local',
      provider_user_id: 'test@example.com',
      password_hash: hash,
      user: { id: 'user-uuid-1', display_name: 'Test User' },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'user-uuid-1', display_name: 'Test User' });
    expect(res.body.user.password_hash).toBeUndefined();

    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/token=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('2. 登入失敗 — 密碼錯誤，回傳 401', async () => {
    const hash = await bcrypt.hash('correctpassword', 10);

    prisma.userIdentity.findFirst.mockResolvedValue({
      id: 'identity-1',
      provider: 'local',
      provider_user_id: 'test@example.com',
      password_hash: hash,
      user: { id: 'user-uuid-1', display_name: 'Test User' },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  it('3. 登入失敗 — 帳號不存在，回傳 401', async () => {
    prisma.userIdentity.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
  });
});
