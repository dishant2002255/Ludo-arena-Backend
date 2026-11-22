const express = require('express');
const router = express.Router();
const {
  getBalance,
  getHistory,
  getMyCoinRequests,
  getActiveSubAdmins,
  getMySubWallets,
} = require('../controllers/wallet.controller');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/balance', getBalance);
router.get('/history', getHistory);

// ─── DISABLED: free coin economy (1 Coin = ₹1 real-money system) ────────────
router.post('/daily-bonus/claim', (req, res) =>
  res.status(403).json({
    success: false,
    message: 'Daily bonus is disabled. Purchase coins via UPI from a Sub-Admin.',
  })
);
router.post('/coin-requests', (req, res) =>
  res.status(403).json({
    success: false,
    message: 'Free coin requests are disabled. Purchase coins via UPI from a Sub-Admin.',
  })
);
router.get('/coin-requests', getMyCoinRequests); // read-only history retained

// ─── Sub-Admin economy ───────────────────────────────────────────────────────
router.get('/sub-admins', getActiveSubAdmins);
router.get('/my-sub-wallets', getMySubWallets);

module.exports = router;
