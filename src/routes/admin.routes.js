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
  publishClassicRoomCredentials,
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
router.post('/rooms/:roomId/publish-credentials', publishClassicRoomCredentials);

// Results
router.get('/results', getResults);

// Wallet management — manual free-coin adjustments DISABLED in real-money
// (1 Coin = ₹1) economy. Coins enter circulation only via Sub-Admin stock.
router.post('/coins/adjust', (req, res) =>
  res.status(403).json({
    success: false,
    message: 'Manual coin adjustments are disabled. Issue coins via a Sub-Admin.',
  })
);
router.get('/wallet/analytics', getWalletDashboard);
router.get('/wallet/transactions/:userId', getUserTransactions);

// Coin requests — free coin request economy DISABLED (real-money system).
router.get('/coin-requests', getCoinRequests);
router.get('/coin-requests/:id', getCoinRequestById);
router.patch('/coin-requests/:id/approve', (req, res) =>
  res.status(403).json({
    success: false,
    message: 'Free coin approvals are disabled. Coins are issued via Sub-Admin stock only.',
  })
);
router.patch('/coin-requests/:id/reject', (req, res) =>
  res.status(403).json({
    success: false,
    message: 'Free coin approvals are disabled. Coins are issued via Sub-Admin stock only.',
  })
);

// Logs
router.get('/logs', getLogs);

// Notifications
router.post('/notifications', sendNotification);

module.exports = router;
