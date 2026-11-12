const express = require('express');
const router = express.Router();
const {
  getBalance,
  getHistory,
  claimDaily,
  submitCoinRequest,
  getMyCoinRequests,
} = require('../controllers/wallet.controller');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { submitCoinRequestSchema } = require('../validators/coinRequest.validator');
const rateLimit = require('express-rate-limit');

// Rate limit coin requests — 5 per 24 hours per user
const coinRequestLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many coin requests. Try again tomorrow.' },
  skipFailedRequests: true,
});

router.use(authenticate);

router.get('/balance', getBalance);
router.get('/history', getHistory);
router.post('/daily-bonus/claim', claimDaily);

// Coin requests
router.post('/coin-requests', coinRequestLimiter, validate(submitCoinRequestSchema), submitCoinRequest);
router.get('/coin-requests', getMyCoinRequests);

module.exports = router;
