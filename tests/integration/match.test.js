/**
 * Integration Tests — Matches and Room Capacity
 */
const request = require('supertest');
const { connect, disconnect, clearCollections } = require('./helpers/testDb');
const buildApp = require('./helpers/testApp');
const { createUser, createAdmin, createMatch, createFreeMatch } = require('./helpers/fixtures');
const User = require('../../src/models/User');
const Room = require('../../src/models/Room');
const WalletTransaction = require('../../src/models/WalletTransaction');

let app;

const loginUser = async (app, email, password = 'TestPass123') => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.headers['set-cookie'];
};

beforeAll(async () => {
  await connect();
  app = buildApp();
});

afterAll(async () => await disconnect());
afterEach(async () => await clearCollections());

// ─── GET /api/matches ─────────────────────────────────────────────────────────

describe('GET /api/matches', () => {
  test('returns active matches without auth', async () => {
    const admin = await createAdmin();
    await createMatch(admin._id, { status: 'active' });
    await createMatch(admin._id, { name: 'Match 2', status: 'active' });

    const res = await request(app).get('/api/matches');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  test('does not return disabled matches', async () => {
    const admin = await createAdmin();
    await createMatch(admin._id, { name: 'Active', status: 'active' });
    await createMatch(admin._id, { name: 'Disabled', status: 'disabled' });

    const res = await request(app).get('/api/matches');
    const names = res.body.data.map(m => m.name);
    expect(names).toContain('Active');
    expect(names).not.toContain('Disabled');
  });

  test('returns pagination metadata', async () => {
    const res = await request(app).get('/api/matches');
    expect(res.body.pagination).toBeDefined();
  });
});

// ─── GET /api/matches/:id ─────────────────────────────────────────────────────

describe('GET /api/matches/:id', () => {
  test('returns match by ID', async () => {
    const admin = await createAdmin();
    const match = await createMatch(admin._id, { name: 'Specific Match' });

    const res = await request(app).get(`/api/matches/${match._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.match.name).toBe('Specific Match');
  });

  test('returns 404 for non-existent match', async () => {
    const res = await request(app).get('/api/matches/507f1f77bcf86cd799439011');
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/matches/:id/join ───────────────────────────────────────────────

describe('POST /api/matches/:id/join', () => {
  test('requires authentication', async () => {
    const admin = await createAdmin();
    const match = await createFreeMatch(admin._id);
    const res = await request(app).post(`/api/matches/${match._id}/join`);
    expect(res.status).toBe(401);
  });

  test('user can join a free match and gets room + color assigned', async () => {
    const admin = await createAdmin();
    const match = await createFreeMatch(admin._id);
    const user = await createUser({ username: 'joiner1', email: 'joiner1@test.com', walletBalance: 500 });
    const cookie = await loginUser(app, user.email);

    const res = await request(app).post(`/api/matches/${match._id}/join`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.room).toBeDefined();
    expect(res.body.data.assignedColor).toMatch(/red|green|yellow|blue/);
  });

  test('deducts entry coins on join', async () => {
    const admin = await createAdmin();
    const match = await createMatch(admin._id, { entryCoins: 100, winnerReward: 300 });
    const user = await createUser({ username: 'payer1', email: 'payer1@test.com', walletBalance: 500 });
    const cookie = await loginUser(app, user.email);

    await request(app).post(`/api/matches/${match._id}/join`).set('Cookie', cookie);

    const updated = await User.findById(user._id);
    expect(updated.walletBalance).toBe(400); // 500 - 100
  });

  test('creates a wallet transaction for entry fee deduction', async () => {
    const admin = await createAdmin();
    const match = await createMatch(admin._id, { entryCoins: 100, winnerReward: 300 });
    const user = await createUser({ username: 'payer2', email: 'payer2@test.com', walletBalance: 500 });
    const cookie = await loginUser(app, user.email);

    await request(app).post(`/api/matches/${match._id}/join`).set('Cookie', cookie);

    const tx = await WalletTransaction.findOne({ user: user._id, type: 'match_entry' });
    expect(tx).not.toBeNull();
    expect(tx.amount).toBe(-100);
  });

  test('rejects join when insufficient coins', async () => {
    const admin = await createAdmin();
    const match = await createMatch(admin._id, { entryCoins: 500 });
    const user = await createUser({ username: 'poorplayer', email: 'poor@test.com', walletBalance: 100 });
    const cookie = await loginUser(app, user.email);

    const res = await request(app).post(`/api/matches/${match._id}/join`).set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insufficient/i);
  });

  test('prevents same user from joining twice', async () => {
    const admin = await createAdmin();
    const match = await createFreeMatch(admin._id);
    const user = await createUser({ username: 'duplicator', email: 'dup@test.com', walletBalance: 1000 });
    const cookie = await loginUser(app, user.email);

    await request(app).post(`/api/matches/${match._id}/join`).set('Cookie', cookie);
    const res2 = await request(app).post(`/api/matches/${match._id}/join`).set('Cookie', cookie);
    expect(res2.status).toBe(400);
    expect(res2.body.message).toMatch(/already in a room/i);
  });

  test('4 distinct players can join same room', async () => {
    const admin = await createAdmin();
    const match = await createFreeMatch(admin._id);

    const users = [];
    for (let i = 0; i < 4; i++) {
      users.push(await createUser({
        username: `player${i}`,
        email: `player${i}@test.com`,
        walletBalance: 500,
      }));
    }

    const results = [];
    for (const u of users) {
      const cookie = await loginUser(app, u.email);
      const r = await request(app).post(`/api/matches/${match._id}/join`).set('Cookie', cookie);
      results.push(r);
    }

    // All 4 should succeed
    results.forEach(r => expect(r.status).toBe(200));

    // Each should get a different color
    const colors = results.map(r => r.body.data.assignedColor);
    expect(new Set(colors).size).toBe(4);
    expect(colors.sort()).toEqual(['blue', 'green', 'red', 'yellow']);
  });

  test('room status changes to full when 4 players join', async () => {
    const admin = await createAdmin();
    const match = await createFreeMatch(admin._id);

    const users = [];
    for (let i = 0; i < 4; i++) {
      users.push(await createUser({
        username: `rplayer${i}`,
        email: `rplayer${i}@test.com`,
        walletBalance: 500,
      }));
    }

    let roomId;
    for (const u of users) {
      const cookie = await loginUser(app, u.email);
      const r = await request(app).post(`/api/matches/${match._id}/join`).set('Cookie', cookie);
      roomId = r.body.data.room.roomId;
    }

    const room = await Room.findOne({ roomId });
    expect(room.status).toBe('full');
    expect(room.players).toHaveLength(4);
  });

  test('5th player cannot join a full room', async () => {
    const admin = await createAdmin();
    const match = await createFreeMatch(admin._id);

    for (let i = 0; i < 4; i++) {
      const u = await createUser({
        username: `cap${i}`,
        email: `cap${i}@test.com`,
        walletBalance: 500,
      });
      const cookie = await loginUser(app, u.email);
      await request(app).post(`/api/matches/${match._id}/join`).set('Cookie', cookie);
    }

    // 5th player
    const u5 = await createUser({ username: 'fifth', email: 'fifth@test.com', walletBalance: 500 });
    const cookie5 = await loginUser(app, u5.email);
    const res = await request(app).post(`/api/matches/${match._id}/join`).set('Cookie', cookie5);
    // Should either get a new room (if match creates another) or fail gracefully
    // Either way the original room should still have exactly 4 players
    const rooms = await Room.find({ match: match._id });
    rooms.forEach(r => expect(r.players.length).toBeLessThanOrEqual(4));
  });

  test('rejects join on disabled match', async () => {
    const admin = await createAdmin();
    const match = await createMatch(admin._id, { entryCoins: 0, winnerReward: 100, status: 'disabled' });
    const user = await createUser({ username: 'disabled_joiner', email: 'dj@test.com', walletBalance: 500 });
    const cookie = await loginUser(app, user.email);

    const res = await request(app).post(`/api/matches/${match._id}/join`).set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not available/i);
  });
});

// ─── User Dashboard and Stats ─────────────────────────────────────────────────

describe('GET /api/users/dashboard', () => {
  test('returns user stats', async () => {
    const user = await createUser({ username: 'dashuser', email: 'dash@test.com' });
    const cookie = await loginUser(app, user.email);

    const res = await request(app).get('/api/users/dashboard').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.recentGames).toBeDefined();
  });
});

// ─── Leaderboard ──────────────────────────────────────────────────────────────

describe('GET /api/users/leaderboard', () => {
  test('returns leaderboard sorted by wins (no auth needed from route)', async () => {
    const user = await createUser({ username: 'lbuser', email: 'lb@test.com' });
    const cookie = await loginUser(app, user.email);

    const res = await request(app).get('/api/users/leaderboard').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
