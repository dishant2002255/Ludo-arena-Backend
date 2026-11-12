/**
 * Integration Tests — Admin Endpoints & Authorization
 */
const request = require('supertest');
const { connect, disconnect, clearCollections } = require('./helpers/testDb');
const buildApp = require('./helpers/testApp');
const { createUser, createAdmin, createMatch } = require('./helpers/fixtures');

let app;

const loginUser = async (email, password = 'TestPass123') => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.headers['set-cookie'];
};

beforeAll(async () => {
  await connect();
  app = buildApp();
});

afterAll(async () => await disconnect());
afterEach(async () => await clearCollections());

// ─── Authorization Guard ──────────────────────────────────────────────────────

describe('Admin route authorization', () => {
  test('GET /api/admin/dashboard returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/dashboard returns 403 for regular user', async () => {
    const user = await createUser({ username: 'notadmin', email: 'notadmin@test.com' });
    const cookie = await loginUser(user.email);

    const res = await request(app).get('/api/admin/dashboard').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  test('GET /api/admin/dashboard returns 200 for admin', async () => {
    const admin = await createAdmin();
    const cookie = await loginUser(admin.email);

    const res = await request(app).get('/api/admin/dashboard').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  test('POST /api/admin/matches returns 403 for regular user', async () => {
    const user = await createUser({ username: 'ureg', email: 'ureg@test.com' });
    const cookie = await loginUser(user.email);

    const res = await request(app).post('/api/admin/matches').set('Cookie', cookie).send({
      name: 'Test', entryCoins: 0, winnerReward: 100,
    });
    expect(res.status).toBe(403);
  });

  test('DELETE /api/admin/matches/:id returns 403 for regular user', async () => {
    const admin = await createAdmin();
    const match = await createMatch(admin._id);
    const user = await createUser({ username: 'badactor', email: 'badactor@test.com' });
    const cookie = await loginUser(user.email);

    const res = await request(app).delete(`/api/admin/matches/${match._id}`).set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  test('PATCH /api/admin/users/:id/toggle-block returns 403 for regular user', async () => {
    const target = await createUser({ username: 'blocktarget', email: 'bt@test.com' });
    const user = await createUser({ username: 'blocker', email: 'blocker@test.com' });
    const cookie = await loginUser(user.email);

    const res = await request(app)
      .patch(`/api/admin/users/${target._id}/toggle-block`)
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });
});

// ─── Admin Dashboard ─────────────────────────────────────────────────────────

describe('GET /api/admin/dashboard', () => {
  test('returns platform statistics', async () => {
    const admin = await createAdmin();
    await createUser({ username: 'u1', email: 'u1@test.com' });
    await createUser({ username: 'u2', email: 'u2@test.com' });
    const cookie = await loginUser(admin.email);

    const res = await request(app).get('/api/admin/dashboard').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('totalUsers');
    expect(res.body.data).toHaveProperty('activeRooms');
    expect(res.body.data).toHaveProperty('totalMatches');
  });
});

// ─── Match Management ─────────────────────────────────────────────────────────

describe('POST /api/admin/matches', () => {
  test('admin can create a match', async () => {
    const admin = await createAdmin();
    const cookie = await loginUser(admin.email);

    const res = await request(app).post('/api/admin/matches').set('Cookie', cookie).send({
      name: 'Admin Match',
      entryCoins: 100,
      winnerReward: 350,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.match.name).toBe('Admin Match');
    expect(res.body.data.match.createdBy).toBeDefined();
  });

  test('validates required fields', async () => {
    const admin = await createAdmin();
    const cookie = await loginUser(admin.email);

    const res = await request(app).post('/api/admin/matches').set('Cookie', cookie).send({
      entryCoins: 100,
    });
    expect(res.status).toBe(400);
  });

  test('rejects negative entryCoins', async () => {
    const admin = await createAdmin();
    const cookie = await loginUser(admin.email);

    const res = await request(app).post('/api/admin/matches').set('Cookie', cookie).send({
      name: 'Bad Match',
      entryCoins: -50,
      winnerReward: 100,
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/matches/:id', () => {
  test('admin can update a match', async () => {
    const admin = await createAdmin();
    const match = await createMatch(admin._id, { name: 'Old Name' });
    const cookie = await loginUser(admin.email);

    const res = await request(app)
      .patch(`/api/admin/matches/${match._id}`)
      .set('Cookie', cookie)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.match.name).toBe('New Name');
  });
});

describe('DELETE /api/admin/matches/:id', () => {
  test('disables match (soft delete)', async () => {
    const admin = await createAdmin();
    const match = await createMatch(admin._id, { status: 'active' });
    const cookie = await loginUser(admin.email);

    const res = await request(app).delete(`/api/admin/matches/${match._id}`).set('Cookie', cookie);
    expect(res.status).toBe(200);

    // Verify it's disabled, not deleted
    const Match = require('../../src/models/Match');
    const still = await Match.findById(match._id);
    expect(still).not.toBeNull();
    expect(still.status).toBe('disabled');
  });
});

// ─── User Management ─────────────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
  test('returns user list', async () => {
    const admin = await createAdmin();
    await createUser({ username: 'listuser1', email: 'lu1@test.com' });
    const cookie = await loginUser(admin.email);

    const res = await request(app).get('/api/admin/users').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('supports search by username', async () => {
    const admin = await createAdmin();
    await createUser({ username: 'searchable_player', email: 'searchable@test.com' });
    const cookie = await loginUser(admin.email);

    const res = await request(app)
      .get('/api/admin/users?search=searchable')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.some(u => u.username === 'searchable_player')).toBe(true);
  });
});

describe('PATCH /api/admin/users/:id/toggle-block', () => {
  test('blocks an active user', async () => {
    const admin = await createAdmin();
    const user = await createUser({ username: 'tobblock', email: 'tobblock@test.com' });
    const cookie = await loginUser(admin.email);

    const res = await request(app)
      .patch(`/api/admin/users/${user._id}/toggle-block`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.isBlocked).toBe(true);
  });

  test('unblocks a blocked user', async () => {
    const admin = await createAdmin();
    const User = require('../../src/models/User');
    const user = await createUser({ username: 'alreadyblocked', email: 'ab@test.com', isBlocked: true });
    await User.findByIdAndUpdate(user._id, { isBlocked: true });
    const cookie = await loginUser(admin.email);

    const res = await request(app)
      .patch(`/api/admin/users/${user._id}/toggle-block`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.isBlocked).toBe(false);
  });

  test('cannot block an admin', async () => {
    const admin = await createAdmin();
    const admin2 = await createUser({
      username: 'admin2',
      email: 'admin2@test.com',
      role: 'admin',
    });
    const cookie = await loginUser(admin.email);

    const res = await request(app)
      .patch(`/api/admin/users/${admin2._id}/toggle-block`)
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
  });
});

// ─── Coin Adjustment ─────────────────────────────────────────────────────────

describe('POST /api/admin/coins/adjust', () => {
  test('admin can credit coins to a user', async () => {
    const admin = await createAdmin();
    const user = await createUser({ username: 'coinuser', email: 'coin@test.com', walletBalance: 100 });
    const cookie = await loginUser(admin.email);

    const res = await request(app).post('/api/admin/coins/adjust').set('Cookie', cookie).send({
      userId: user._id.toString(),
      amount: 200,
      reason: 'Test credit',
    });
    expect(res.status).toBe(200);

    const User = require('../../src/models/User');
    const updated = await User.findById(user._id);
    expect(updated.walletBalance).toBe(300);
  });

  test('admin can debit coins from a user', async () => {
    const admin = await createAdmin();
    const user = await createUser({ username: 'debituser', email: 'debit@test.com', walletBalance: 500 });
    const cookie = await loginUser(admin.email);

    const res = await request(app).post('/api/admin/coins/adjust').set('Cookie', cookie).send({
      userId: user._id.toString(),
      amount: -100,
      reason: 'Test debit',
    });
    expect(res.status).toBe(200);

    const User = require('../../src/models/User');
    const updated = await User.findById(user._id);
    expect(updated.walletBalance).toBe(400);
  });

  test('requires userId, amount, and reason', async () => {
    const admin = await createAdmin();
    const cookie = await loginUser(admin.email);

    const res = await request(app).post('/api/admin/coins/adjust').set('Cookie', cookie).send({
      amount: 50,
    });
    expect(res.status).toBe(400);
  });
});

// ─── Rooms and Results ────────────────────────────────────────────────────────

describe('GET /api/admin/rooms', () => {
  test('returns rooms list', async () => {
    const admin = await createAdmin();
    const cookie = await loginUser(admin.email);

    const res = await request(app).get('/api/admin/rooms').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/admin/results', () => {
  test('returns results list', async () => {
    const admin = await createAdmin();
    const cookie = await loginUser(admin.email);

    const res = await request(app).get('/api/admin/results').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/admin/logs', () => {
  test('returns audit logs', async () => {
    const admin = await createAdmin();
    const cookie = await loginUser(admin.email);

    const res = await request(app).get('/api/admin/logs').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
