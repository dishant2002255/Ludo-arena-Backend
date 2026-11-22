const express = require('express');
const router = express.Router();
const {
  createWithdrawal,
  getMyWithdrawals,
  getWithdrawals,
  getWithdrawalById,
  approve,
  reject,
} = require('../controllers/withdrawal.controller');
const { authenticate, requireSubAdminOrMain } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  createWithdrawalSchema,
  approveWithdrawalSchema,
  rejectWithdrawalSchema,
} = require('../validators/withdrawal.validator');

// ─── User ──────────────────────────────────────────────────────────────────────
router.post('/', authenticate, validate(createWithdrawalSchema), createWithdrawal);
router.get('/mine', authenticate, getMyWithdrawals);

// ─── Sub-Admin (own scope) / Main Admin (all) ─────────────────────────────────
router.get('/', authenticate, requireSubAdminOrMain, getWithdrawals);
router.get('/:id', authenticate, requireSubAdminOrMain, getWithdrawalById);
router.patch('/:id/approve', authenticate, requireSubAdminOrMain, validate(approveWithdrawalSchema), approve);
router.patch('/:id/reject', authenticate, requireSubAdminOrMain, validate(rejectWithdrawalSchema), reject);

module.exports = router;
