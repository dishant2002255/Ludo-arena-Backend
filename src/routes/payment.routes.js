const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  getPublicSettings,
  initiate,
  notifyAdmin,
  getMyOrders,
  getOrderStatus,
  adminGetPending,
  adminGetAll,
  adminApprove,
  adminReject,
  adminDismissAlarm,
  adminGetSettings,
  adminUpdateSettings,
} = require('../controllers/payment.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Rate limit payment initiation: max 3 per 10 minutes
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: { success: false, message: 'Too many payment requests. Please wait.' },
  skip: (req) => process.env.NODE_ENV !== 'production',
});

// ─── Public ───────────────────────────────────────────────────────────────────
router.get('/settings', getPublicSettings);

// ─── Authenticated user ───────────────────────────────────────────────────────
router.post('/initiate',          authenticate, paymentLimiter, initiate);
router.post('/notify/:orderId',   authenticate, notifyAdmin);
router.get('/my-orders',          authenticate, getMyOrders);
router.get('/order/:orderId',     authenticate, getOrderStatus);

// ─── Admin ────────────────────────────────────────────────────────────────────
router.get('/admin/settings',              authenticate, requireAdmin, adminGetSettings);
router.patch('/admin/settings',            authenticate, requireAdmin, adminUpdateSettings);
router.get('/admin/pending',               authenticate, requireAdmin, adminGetPending);
router.get('/admin/all',                   authenticate, requireAdmin, adminGetAll);
router.patch('/admin/:orderId/approve',    authenticate, requireAdmin, adminApprove);
router.patch('/admin/:orderId/reject',     authenticate, requireAdmin, adminReject);
router.patch('/admin/:orderId/dismiss-alarm', authenticate, requireAdmin, adminDismissAlarm);

module.exports = router;
