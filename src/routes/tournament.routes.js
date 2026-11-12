const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  listTournaments,
  getTournament,
  joinTournamentHandler,
  getMyTournaments,
  submitResultHandler,
  adminCreateTournament,
  adminUpdateTournament,
  adminToggleRegistration,
  adminCancelTournament,
  adminPublishRoom,
  adminVerifySubmission,
  adminFinalizeTournament,
  adminGetTournament,
  adminListTournaments,
} = require('../controllers/tournament.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  publishRoomSchema,
  verifySubmissionSchema,
  finalizeResultSchema,
} = require('../validators/tournament.validator');
const { uploadBanner, uploadScreenshot, handleUploadError } = require('../middleware/upload');

// Rate limit for joins — per IP, allowing 20 per minute for dev-friendliness
const joinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many join requests. Please wait.' },
  skip: (req) => process.env.NODE_ENV !== 'production', // only enforce in production
});

// ─── IMPORTANT: Specific routes BEFORE /:id parameter routes ─────────────────

// User: list all (public)
router.get('/', listTournaments);
// User: my tournaments (authenticated)
router.get('/my', authenticate, getMyTournaments);

// ─── Admin routes (must come before /:id to avoid conflict) ──────────────────
router.get('/admin/all',          authenticate, requireAdmin, adminListTournaments);
router.post('/admin/create',
  authenticate,
  requireAdmin,
  uploadBanner.single('banner'),
  handleUploadError,
  adminCreateTournament
);
router.patch('/admin/:id',
  authenticate,
  requireAdmin,
  uploadBanner.single('banner'),
  handleUploadError,
  adminUpdateTournament
);
router.patch('/admin/:id/toggle-registration', authenticate, requireAdmin, adminToggleRegistration);
router.patch('/admin/:id/cancel',   authenticate, requireAdmin, adminCancelTournament);
router.post( '/admin/:id/publish-room', authenticate, requireAdmin, validate(publishRoomSchema), adminPublishRoom);
router.patch('/admin/:id/verify',   authenticate, requireAdmin, validate(verifySubmissionSchema), adminVerifySubmission);
router.patch('/admin/:id/finalize', authenticate, requireAdmin, validate(finalizeResultSchema), adminFinalizeTournament);
router.get(  '/admin/:id/detail',   authenticate, requireAdmin, adminGetTournament);

// ─── User / public routes with :id parameter ──────────────────────────────────
router.get('/:id',  authenticate, getTournament);

router.post('/:id/join',
  authenticate,
  joinLimiter,
  joinTournamentHandler
);

router.post('/:id/submit-result',
  authenticate,
  uploadScreenshot.single('screenshot'),
  handleUploadError,
  submitResultHandler
);

module.exports = router;
