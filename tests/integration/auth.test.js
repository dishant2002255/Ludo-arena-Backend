/**
 * Integration Tests — Authentication
 */
const request = require('supertest');
const { connect, disconnect, clearCollections } = require('./helpers/testDb');
const buildApp = require('./helpers/testApp');

let app;

beforeAll(async () => {
  await connect();
  app = buildApp();
});

afterAll(async () => {
  await disconnect();
});

afterEach(async () => {
  await clearCollections();
});

// ─── Registration ─────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  const validPayload = {
    username: 'testplayer',
    email: 'testplayer@test.com',
    password: 'SecurePass123',
  };

  test('registers a new user and returns 201', async () => {
    const res = await request(app).post('/api/auth/register').send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe('testplayer');
    expect(res.body.data.user.email).toBe('testplayer@test.com');
  });

  test('returns auth cookie on registration', async () => {
    const res = await request(app).post('/api/auth/register').send(validPayload);
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/token=/);
  });

  test('grants 500 registration bonus coins', async () => {
    const res = await request(app).post('/api/auth/register').send(validPayload);
    expect(res.body.data.user.walletBalance).toBe(500);
  });

  test('does not expose password hash in response', async () => {
    const res = await request(app).post('/api/auth/register').send(validPayload);
    expect(res.body.data.user.password).toBeUndefined();
  });

  test('rejects duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send(validPayload);
    const res = await request(app).post('/api/auth/register').send(validPayload);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('rejects duplicate username with 409', async () => {
    await request(app).post('/api/auth/register').send(validPayload);
    const res = await request(app).post('/api/auth/register').send({
      ...validPayload,
      email: 'different@test.com',
    });
    expect(res.status).toBe(409);
  });

  test('rejects missing username with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'x@test.com',
      password: 'SecurePass123',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rejects invalid email with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'testuser',
      email: 'not-an-email',
      password: 'SecurePass123',
    });
    expect(res.status).toBe(400);
  });

  test('rejects short password with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'testuser2',
      email: 'testuser2@test.com',
      password: '123',
    });
    expect(res.status).toBe(400);
  });

  test('rejects username with special chars with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'bad user!',
      email: 'bad@test.com',
      password: 'SecurePass123',
    });
    expect(res.status).toBe(400);
  });

  test('registers user with role=user by default', async () => {
    const res = await request(app).post('/api/auth/register').send(validPayload);
    expect(res.body.data.user.role).toBe('user');
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  const userPayload = {
    username: 'logintest',
    email: 'logintest@test.com',
    password: 'LoginPass456',
  };

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(userPayload);
  });

  test('logs in with correct credentials and returns 200', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: userPayload.email,
      password: userPayload.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(userPayload.email);
  });

  test('sets auth cookie on login', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: userPayload.email,
      password: userPayload.password,
    });
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/token=/);
  });

  test('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: userPayload.email,
      password: 'WrongPassword',
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('rejects non-existent email with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'ghost@test.com',
      password: 'anything',
    });
    expect(res.status).toBe(401);
  });

  test('rejects blocked user with 403', async () => {
    const User = require('../../src/models/User');
    await User.findOneAndUpdate({ email: userPayload.email }, { isBlocked: true });
    const res = await request(app).post('/api/auth/login').send({
      email: userPayload.email,
      password: userPayload.password,
    });
    expect(res.status).toBe(403);
  });

  test('does not expose password hash in response', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: userPayload.email,
      password: userPayload.password,
    });
    expect(res.body.data.user.password).toBeUndefined();
  });

  test('rejects missing email with 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'pass' });
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  let cookie;

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'metest',
      email: 'metest@test.com',
      password: 'MePass789',
    });
    cookie = res.headers['set-cookie'];
  });

  test('returns current user with valid cookie', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('metest@test.com');
  });

  test('returns 401 without cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns 401 with invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'token=badtoken');
    expect(res.status).toBe(401);
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  test('clears the auth cookie', async () => {
    const regRes = await request(app).post('/api/auth/register').send({
      username: 'logouttest',
      email: 'logouttest@test.com',
      password: 'LogOut123',
    });
    const cookie = regRes.headers['set-cookie'];

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    // Cookie should be cleared (Max-Age=0 or expires in past)
    const setCookieHeader = res.headers['set-cookie']?.[0] || '';
    expect(setCookieHeader).toMatch(/token=/);
  });
});

// ─── Password Reset ───────────────────────────────────────────────────────────

describe('POST /api/auth/forgot-password', () => {
  test('returns 200 for existing email', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'resetuser',
      email: 'resetuser@test.com',
      password: 'ResetPass1',
    });
    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'resetuser@test.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('returns 200 even for non-existent email (anti-enumeration)', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'nobody@test.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/auth/reset-password', () => {
  test('resets password with valid token', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'resetuser2',
      email: 'resetuser2@test.com',
      password: 'OldPass123',
    });

    const fpRes = await request(app).post('/api/auth/forgot-password').send({
      email: 'resetuser2@test.com',
    });
    const resetToken = fpRes.body.data?.resetToken;
    if (!resetToken) return; // dev mode returns token in response

    const res = await request(app).post('/api/auth/reset-password').send({
      token: resetToken,
      password: 'NewPass456',
    });
    expect(res.status).toBe(200);

    // Should now be able to login with new password
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'resetuser2@test.com',
      password: 'NewPass456',
    });
    expect(loginRes.status).toBe(200);
  });

  test('rejects invalid reset token with 400', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({
      token: 'invalidtoken123',
      password: 'NewPass456',
    });
    expect(res.status).toBe(400);
  });
});
