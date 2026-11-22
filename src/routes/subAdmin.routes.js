const express = require('express');
const router = express.Router();
const {
  listSubAdmins,
  getSubAdmin,
  createSubAdmin,
  issueCoins,
  deductCoins,
  toggleSubAdminActive,
  getMySubAdminProfile,
  updateMyUpiSettings,
  getLedger,
  getSubAdminUsers,
  getAuditMetrics,
} = require('../controllers/subAdmin.controller');
const { authenticate, requireMainAdmin, requireSubAdminOrMain } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  createSubAdminSchema,
  issueCoinsSchema,
  upiSettingsSchema,
} = require('../validators/subAdmin.validator');

router.use(authenticate, requireSubAdminOrMain);

// ─── Sub-Admin self-service (must come before /:id) ─────────────────────────
router.get('/me', getMySubAdminProfile);
router.get('/me/ledger', getLedger);
router.get('/me/users', getSubAdminUsers);
router.get('/me/audit', getAuditMetrics);
router.patch('/me/upi', validate(upiSettingsSchema), updateMyUpiSettings);

// ─── Main Admin only: management ─────────────────────────────────────────────
router.get('/', requireMainAdmin, listSubAdmins);
router.post('/', requireMainAdmin, validate(createSubAdminSchema), createSubAdmin);

router.get('/:id', requireMainAdmin, getSubAdmin);
router.post('/:id/issue-coins', requireMainAdmin, validate(issueCoinsSchema), issueCoins);
router.post('/:id/deduct-coins', requireMainAdmin, validate(issueCoinsSchema), deductCoins);
router.patch('/:id/toggle-active', requireMainAdmin, toggleSubAdminActive);
router.patch('/:id/upi', requireMainAdmin, validate(upiSettingsSchema), updateMyUpiSettings);
router.get('/:id/ledger', requireMainAdmin, getLedger);
router.get('/:id/users', requireMainAdmin, getSubAdminUsers);
router.get('/:id/audit', requireMainAdmin, getAuditMetrics);

module.exports = router;
