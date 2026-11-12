/**
 * Test fixture factory — creates users and matches in the test DB.
 */
const User = require('../../../src/models/User');
const Match = require('../../../src/models/Match');

const createUser = async (overrides = {}) => {
  const defaults = {
    username: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    email: `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
    password: 'TestPass123',
    role: 'user',
    walletBalance: 500,
    totalCoinsEarned: 500,
  };
  return User.create({ ...defaults, ...overrides });
};

const createAdmin = async (overrides = {}) => {
  return createUser({ role: 'admin', username: 'admin_test', email: 'admin_test@test.com', ...overrides });
};

const createMatch = async (adminId, overrides = {}) => {
  const defaults = {
    name: 'Test Match',
    description: 'Integration test match',
    entryCoins: 50,
    winnerReward: 200,
    status: 'active',
    createdBy: adminId,
  };
  return Match.create({ ...defaults, ...overrides });
};

const createFreeMatch = async (adminId) => createMatch(adminId, { entryCoins: 0, winnerReward: 100 });

module.exports = { createUser, createAdmin, createMatch, createFreeMatch };
