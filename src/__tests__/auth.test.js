const request = require('supertest');
const app = require('../app');

jest.mock('../lib/prisma');
const prisma = require('../lib/prisma');

describe('POST /api/auth/signup', () => {
  describe('成功', () => {
    it('應回傳 201、user 資料，並設置 httpOnly cookie', async () => {
      prisma.userIdentity.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-uuid-1',
        display_name: 'Test User',
        created_at: new Date(),
      });

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'test@example.com', password: 'password123', display_name: 'Test User' });

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({ display_name: 'Test User' });
      expect(res.body.user.password_hash).toBeUndefined();

      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toMatch(/token=/);
      expect(cookie).toMatch(/HttpOnly/i);
    });
  });

  describe('驗證失敗', () => {
    it('缺少 email 應回傳 400', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ password: 'password123', display_name: 'Test User' });

      expect(res.status).toBe(400);
    });

    it('缺少 password 應回傳 400', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'test@example.com', display_name: 'Test User' });

      expect(res.status).toBe(400);
    });

    it('缺少 display_name 應回傳 400', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(res.status).toBe(400);
    });
  });

  describe('email 已存在', () => {
    it('應回傳 409', async () => {
      prisma.userIdentity.findFirst.mockResolvedValue({ id: 'existing-identity' });

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'existing@example.com', password: 'password123', display_name: 'Test User' });

      expect(res.status).toBe(409);
    });
  });
});

describe('POST /api/auth/login', () => {
  describe('成功', () => {
    it('應回傳 200、user 資料，並設置 httpOnly cookie', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('password123', 10);

      prisma.userIdentity.findFirst.mockResolvedValue({
        id: 'identity-1',
        user_id: 'user-uuid-1',
        email: 'test@example.com',
        password_hash: hash,
        user: { id: 'user-uuid-1', display_name: 'Test User' },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ display_name: 'Test User' });
      expect(res.body.user.password_hash).toBeUndefined();

      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toMatch(/token=/);
      expect(cookie).toMatch(/HttpOnly/i);
    });
  });

  describe('驗證失敗', () => {
    it('缺少 email 應回傳 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });

      expect(res.status).toBe(400);
    });

    it('缺少 password 應回傳 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
    });
  });

  describe('認證失敗', () => {
    it('email 不存在應回傳 401', async () => {
      prisma.userIdentity.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'notfound@example.com', password: 'password123' });

      expect(res.status).toBe(401);
    });

    it('密碼錯誤應回傳 401', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('correctpassword', 10);

      prisma.userIdentity.findFirst.mockResolvedValue({
        id: 'identity-1',
        user_id: 'user-uuid-1',
        email: 'test@example.com',
        password_hash: hash,
        user: { id: 'user-uuid-1', display_name: 'Test User' },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });
  });
});
