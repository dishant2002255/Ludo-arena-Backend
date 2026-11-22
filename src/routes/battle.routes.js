const express = require('express');
const router = express.Router();
const {
  listBattles,
  getMyBattles,
  getBattle,
  createBattle,
  joinBattle,
  leaveBattle,
  uploadResultScreenshot,
  submitResult,
  adminListBattles,
  adminGetBattle,
  resolveDispute,
} = require('../controllers/battle.controller');
const { authenticate, requireSubAdminOrMain } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { uploadScreenshot, handleUploadError } = require('../middleware/upload');
const {
  createBattleSchema,
  submitResultSchema,
  resolveDisputeSchema,
} = require('../validators/battle.validator');

// ─── Authenticated user ────────────────────────────────────────────────────────
router.use(authenticate);

router.get('/', listBattles);
router.get('/mine', getMyBattles);
router.post('/', validate(createBattleSchema), createBattle);
router.post('/:id/join', joinBattle);
router.post('/:id/leave', leaveBattle);
router.post('/:id/screenshot',
  uploadScreenshot.single('screenshot'),
  handleUploadError,
  uploadResultScreenshot
);
router.post('/:id/submit', validate(submitResultSchema), submitResult);
router.get('/:id', getBattle);

// ─── Sub-Admin (own scope) / Main Admin (all) ─────────────────────────────────
router.get('/admin/all', requireSubAdminOrMain, adminListBattles);
router.get('/admin/:id', requireSubAdminOrMain, adminGetBattle);
router.post('/:id/resolve', requireSubAdminOrMain, validate(resolveDisputeSchema), resolveDispute);

module.exports = router;
