/**
 * Integration Tests — Wallet
 */
const request = require('supertest');
const { connect, disconnect, clearCollections } = require('./helpers/testDb');
const buildApp = require('./helpers/testApp');
const { createUser, createAdmin } = require('./helpers/fixtures');
const WalletTransaction = require('../../src/models/WalletTransaction');
const User = require('../../src/models/User');

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

// ─── Balance ──────────────────────────────────────────────────────────────────

describe('GET /api/wallet/balance', () => {
  test('returns balance for authenticated user', async () => {
    const user = await createUser();
    const cookie = await loginUser(app, user.email);

    const res = await request(app).get('/api/wallet/balance').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe(500);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/wallet/balance');
    expect(res.status).toBe(401);
  });

  test('returns canClaimDaily and nextClaimAt fields', async () => {
    const user = await createUser();
    const cookie = await loginUser(app, user.email);

    const res = await request(app).get('/api/wallet/balance').set('Cookie', cookie);
    expect(res.body.data).toHaveProperty('canClaimDaily');
    expect(res.body.data).toHaveProperty('nextClaimAt');
  });
});

// ─── Daily Bonus ──────────────────────────────────────────────────────────────

describe('POST /api/wallet/daily-bonus/claim', () => {
  test('claims daily bonus and credits 100 coins', async () => {
    const user = await createUser({ walletBalance: 500 });
    const cookie = await loginUser(app, user.email);

    const res = await request(app).post('/api/wallet/daily-bonus/claim').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(100);
  });

  test('creates a wallet transaction record', async () => {
    const user = await createUser();
    const cookie = await loginUser(app, user.email);

    await request(app).post('/api/wallet/daily-bonus/claim').set('Cookie', cookie);

    const tx = await WalletTransaction.findOne({ user: user._id, type: 'daily_bonus' });
    expect(tx).not.toBeNull();
    expect(tx.amount).toBe(100);
  });

  test('idempotent — second claim on same day returns 400', async () => {
    const user = await createUser();
    const cookie = await loginUser(app, user.email);

    await request(app).post('/api/wallet/daily-bonus/claim').set('Cookie', cookie);
    const res2 = await request(app).post('/api/wallet/daily-bonus/claim').set('Cookie', cookie);
    expect(res2.status).toBe(400);
    expect(res2.body.success).toBe(false);
  });

  test('balance increases after claim', async () => {
    const user = await createUser({ walletBalance: 500 });
    const cookie = await loginUser(app, user.email);

    await request(app).post('/api/wallet/daily-bonus/claim').set('Cookie', cookie);

    const updated = await User.findById(user._id);
    expect(updated.walletBalance).toBe(600);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/wallet/daily-bonus/claim');
    expect(res.status).toBe(401);
  });
});

// ─── Transaction History ──────────────────────────────────────────────────────

describe('GET /api/wallet/history', () => {
  test('returns transaction list for authenticated user', async () => {
    const user = await createUser();
    const cookie = await loginUser(app, user.email);

    // Claim daily to create a transaction
    await request(app).post('/api/wallet/daily-bonus/claim').set('Cookie', cookie);

    const res = await request(app).get('/api/wallet/history').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/wallet/history');
    expect(res.status).toBe(401);
  });

  test('only returns transactions for the requesting user', async () => {
    const user1 = await createUser({ username: 'wallet1', email: 'wallet1@test.com' });
    const user2 = await createUser({ username: 'wallet2', email: 'wallet2@test.com' });

    const cookie1 = await loginUser(app, user1.email);
    const cookie2 = await loginUser(app, user2.email);

    await request(app).post('/api/wallet/daily-bonus/claim').set('Cookie', cookie1);

    const res = await request(app).get('/api/wallet/history').set('Cookie', cookie2);
    expect(res.status).toBe(200);
    expect(res.body.data.every(tx => tx.user?.toString() === user2._id.toString())).toBe(true);
  });

  test('returns paginated results with pagination metadata', async () => {
    const user = await createUser();
    const cookie = await loginUser(app, user.email);

    const res = await request(app).get('/api/wallet/history').set('Cookie', cookie);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination).toHaveProperty('page');
    expect(res.body.pagination).toHaveProperty('total');
  });
});

// ─── Wallet Integrity ─────────────────────────────────────────────────────────

describe('Wallet Service Integrity', () => {
  test('wallet balance never goes negative — insufficient funds throws', async () => {
    const { adjustWallet } = require('../../src/services/wallet.service');
    const user = await createUser({ walletBalance: 10 });
    await expect(
      adjustWallet(user._id, -100, 'match_entry', 'test', {})
    ).rejects.toThrow(/insufficient coins/i);
  });

  test('balanceBefore and balanceAfter are recorded correctly', async () => {
    const user = await createUser({ walletBalance: 500 });
    const { adjustWallet } = require('../../src/services/wallet.service');
    const tx = await adjustWallet(user._id, 50, 'admin_adjust', 'test', {});
    expect(tx.balanceBefore).toBe(500);
    expect(tx.balanceAfter).toBe(550);
  });

  test('idempotency key prevents duplicate transactions', async () => {
    const user = await createUser({ walletBalance: 500 });
    const { adjustWallet } = require('../../src/services/wallet.service');
    const key = `test_idem_${user._id}`;
    await adjustWallet(user._id, 100, 'daily_bonus', 'test', { idempotencyKey: key });
    const tx2 = await adjustWallet(user._id, 100, 'daily_bonus', 'test', { idempotencyKey: key });
    // Second call returns existing transaction without double-crediting
    const updated = await User.findById(user._id);
    expect(updated.walletBalance).toBe(600); // 500 + 100 only once
  });

  test('totalCoinsEarned increases on credit', async () => {
    const user = await createUser({ walletBalance: 0, totalCoinsEarned: 0 });
    const { adjustWallet } = require('../../src/services/wallet.service');
    await adjustWallet(user._id, 200, 'admin_adjust', 'test', {});
    const updated = await User.findById(user._id);
    expect(updated.totalCoinsEarned).toBe(200);
  });

  test('totalCoinsSpent increases on debit', async () => {
    const user = await createUser({ walletBalance: 500, totalCoinsSpent: 0 });
    const { adjustWallet } = require('../../src/services/wallet.service');
    await adjustWallet(user._id, -50, 'match_entry', 'test', {});
    const updated = await User.findById(user._id);
    expect(updated.totalCoinsSpent).toBe(50);
  });
});
