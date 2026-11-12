const express = require('express');
const router = express.Router();
const {
  getDashboard,
  getUsers,
  getUserById,
  toggleBlockUser,
  createMatch,
  updateMatch,
  deleteMatch,
  getAdminMatches,
  getRooms,
  getResults,
  adjustCoins,
  getLogs,
  sendNotification,
  getCoinRequests,
  getCoinRequestById,
  handleApproveCoinRequest,
  handleRejectCoinRequest,
  getWalletDashboard,
  getUserTransactions,
} = require('../controllers/admin.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createMatchSchema, updateMatchSchema } = require('../validators/match.validator');
const { reviewCoinRequestSchema } = require('../validators/coinRequest.validator');

router.use(authenticate, requireAdmin);

// Dashboard
router.get('/dashboard', getDashboard);

// Users
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.patch('/users/:id/toggle-block', toggleBlockUser);

// Matches
router.get('/matches', getAdminMatches);
router.post('/matches', validate(createMatchSchema), createMatch);
router.patch('/matches/:id', validate(updateMatchSchema), updateMatch);
router.delete('/matches/:id', deleteMatch);

// Rooms
router.get('/rooms', getRooms);

// Results
router.get('/results', getResults);

// Wallet management
router.post('/coins/adjust', adjustCoins);
router.get('/wallet/analytics', getWalletDashboard);
router.get('/wallet/transactions/:userId', getUserTransactions);

// Coin requests
router.get('/coin-requests', getCoinRequests);
router.get('/coin-requests/:id', getCoinRequestById);
router.patch('/coin-requests/:id/approve', validate(reviewCoinRequestSchema), handleApproveCoinRequest);
router.patch('/coin-requests/:id/reject', validate(reviewCoinRequestSchema), handleRejectCoinRequest);

// Logs
router.get('/logs', getLogs);

// Notifications
router.post('/notifications', sendNotification);

module.exports = router;
