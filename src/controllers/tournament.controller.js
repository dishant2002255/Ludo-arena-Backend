/**
 * Tournament Controller — user-facing and admin-facing handlers.
 */

const path = require('path');
const Tournament = require('../models/Tournament');
const {
  createTournament,
  updateTournament,
  toggleRegistration,
  cancelTournament,
  joinTournament,
  publishRoomDetails,
  submitResult,
  verifySubmission,
  finalizeTournament,
  getTournamentForParticipant,
} = require('../services/tournament.service');
const { success, error, paginated } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// ─── Public / User ────────────────────────────────────────────────────────────

/** List tournaments visible to users (open, full, waiting, published, completed) */
const listTournaments = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;
    const statusFilter = req.query.status;

    const query = {
      status: statusFilter
        ? statusFilter
        : { $in: ['open', 'full', 'waiting_for_admin', 'room_published', 'result_pending', 'completed'] },
    };

    const [tournaments, total] = await Promise.all([
      Tournament.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-externalRoomId -externalRoomPassword') // never expose credentials in list
        .populate('createdBy', 'username')
        .lean(),
      Tournament.countDocuments(query),
    ]);

    return paginated(res, tournaments, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error({ err }, 'listTournaments error');
    return error(res, 'Failed to fetch tournaments', 500);
  }
};

/** Single tournament detail — room creds only for participants */
const getTournament = async (req, res) => {
  try {
    const userId = req.user?._id;
    const result = await getTournamentForParticipant(req.params.id, userId);
    if (!result) return error(res, 'Tournament not found', 404);
    return success(res, result);
  } catch (err) {
    return error(res, 'Failed to fetch tournament', 500);
  }
};

/** Join a tournament */
const joinTournamentHandler = async (req, res) => {
  try {
    const tournament = await joinTournament(req.params.id, req.user._id);
    return success(res, { tournament }, 'Successfully joined tournament');
  } catch (err) {
    return error(res, err.message || 'Failed to join tournament', 400);
  }
};

/** Get my tournaments (tournaments where I am a participant) */
const getMyTournaments = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const query = { 'participants.user': req.user._id };
    const [tournaments, total] = await Promise.all([
      Tournament.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-externalRoomId -externalRoomPassword')
        .populate('createdBy', 'username')
        .lean(),
      Tournament.countDocuments(query),
    ]);

    return paginated(res, tournaments, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch your tournaments', 500);
  }
};

/** Submit screenshot result */
const submitResultHandler = async (req, res) => {
  try {
    if (!req.file) return error(res, 'Screenshot file is required', 400);

    const { claimedResult, remarks } = req.body;
    if (!claimedResult || !['winner', 'lost'].includes(claimedResult)) {
      return error(res, 'claimedResult must be winner or lost', 400);
    }

    // Build relative URL for the saved file
    const screenshotUrl = `/uploads/screenshots/${req.file.filename}`;

    const tournament = await submitResult(
      req.params.id,
      req.user._id,
      screenshotUrl,
      req.file.originalname,
      claimedResult,
      remarks || ''
    );

    return success(res, { tournament }, 'Result submitted successfully');
  } catch (err) {
    return error(res, err.message || 'Failed to submit result', 400);
  }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

const adminCreateTournament = async (req, res) => {
  try {
    const bannerUrl = req.file ? `/uploads/banners/${req.file.filename}` : '';
    const tournament = await createTournament(req.user._id, req.body, bannerUrl);
    return success(res, { tournament }, 'Tournament created', 201);
  } catch (err) {
    return error(res, err.message || 'Failed to create tournament', 500);
  }
};

const adminUpdateTournament = async (req, res) => {
  try {
    const bannerUrl = req.file ? `/uploads/banners/${req.file.filename}` : undefined;
    const tournament = await updateTournament(req.params.id, req.user._id, req.body, bannerUrl);
    return success(res, { tournament }, 'Tournament updated');
  } catch (err) {
    return error(res, err.message || 'Failed to update tournament', 400);
  }
};

const adminToggleRegistration = async (req, res) => {
  try {
    const open = req.body.open === true || req.body.open === 'true';
    const tournament = await toggleRegistration(req.params.id, req.user._id, open);
    return success(res, { tournament }, `Registration ${open ? 'opened' : 'closed'}`);
  } catch (err) {
    return error(res, err.message || 'Failed to toggle registration', 400);
  }
};

const adminCancelTournament = async (req, res) => {
  try {
    const tournament = await cancelTournament(req.params.id, req.user._id, req.body.reason || '');
    return success(res, { tournament }, 'Tournament cancelled');
  } catch (err) {
    return error(res, err.message || 'Failed to cancel tournament', 400);
  }
};

const adminPublishRoom = async (req, res) => {
  try {
    const tournament = await publishRoomDetails(req.params.id, req.user._id, req.body, req.ip);
    return success(res, { tournament }, 'Room details published');
  } catch (err) {
    return error(res, err.message || 'Failed to publish room', 400);
  }
};

const adminVerifySubmission = async (req, res) => {
  try {
    const { submissionId, status, adminRemarks } = req.body;
    const tournament = await verifySubmission(
      req.params.id,
      submissionId,
      req.user._id,
      status,
      adminRemarks || '',
      req.ip
    );
    return success(res, { tournament }, 'Submission updated');
  } catch (err) {
    return error(res, err.message || 'Failed to verify submission', 400);
  }
};

const adminFinalizeTournament = async (req, res) => {
  try {
    const { winnerUserId, verificationRemarks } = req.body;
    const tournament = await finalizeTournament(
      req.params.id,
      req.user._id,
      winnerUserId,
      verificationRemarks || '',
      req.ip
    );
    return success(res, { tournament }, 'Tournament finalized and winner announced');
  } catch (err) {
    return error(res, err.message || 'Failed to finalize tournament', 400);
  }
};

/** Admin: get tournament with full detail (submissions, credentials) */
const adminGetTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate('participants.user', 'username avatar email')
      .populate('submissions.user', 'username avatar')
      .populate('submissions.reviewedBy', 'username')
      .populate('verifiedWinner', 'username avatar')
      .populate('createdBy', 'username')
      .lean();

    if (!tournament) return error(res, 'Tournament not found', 404);
    return success(res, { tournament });
  } catch (err) {
    return error(res, 'Failed to fetch tournament', 500);
  }
};

/** Admin: list all tournaments */
const adminListTournaments = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;
    const statusFilter = req.query.status;

    const query = statusFilter ? { status: statusFilter } : {};
    const [tournaments, total] = await Promise.all([
      Tournament.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'username')
        .lean(),
      Tournament.countDocuments(query),
    ]);

    return paginated(res, tournaments, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch tournaments', 500);
  }
};

module.exports = {
  listTournaments,
  getTournament,
  joinTournamentHandler,
  getMyTournaments,
  submitResultHandler,
  // admin
  adminCreateTournament,
  adminUpdateTournament,
  adminToggleRegistration,
  adminCancelTournament,
  adminPublishRoom,
  adminVerifySubmission,
  adminFinalizeTournament,
  adminGetTournament,
  adminListTournaments,
};
