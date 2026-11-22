/**
 * Battle Controller — user-created Ludo King Open Battles.
 */
const OpenBattle = require('../models/OpenBattle');
const battleService = require('../services/battle.service');
const { success, error, paginated } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const isMainAdmin = (u) => ['admin', 'main_admin'].includes(u?.role);

// ─── Lobby (public list, credentials stripped) ────────────────────────────────
const listBattles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const filter = {};
    if (req.query.subAdminId) filter.subAdmin = req.query.subAdminId;
    if (req.query.status) filter.status = req.query.status;
    else filter.status = { $in: ['open', 'in_progress', 'result_pending', 'disputed'] };

    const result = await battleService.listBattles(filter, page, limit);
    return paginated(res, result.battles, {
      page: result.page,
      limit,
      total: result.total,
      pages: result.pages,
    });
  } catch (err) {
    return error(res, err.message || 'Failed to list battles', 500);
  }
};

// ─── My battles ────────────────────────────────────────────────────────────────
const getMyBattles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const filter = { 'participants.user': req.user._id };
    if (req.query.status) filter.status = req.query.status;
    const result = await battleService.listBattles(filter, page, limit);
    return paginated(res, result.battles, {
      page: result.page,
      limit,
      total: result.total,
      pages: result.pages,
    });
  } catch (err) {
    return error(res, err.message || 'Failed to fetch battles', 500);
  }
};

// ─── Detail (credentials only if allowed) ─────────────────────────────────────
const getBattle = async (req, res) => {
  try {
    const view = await battleService.getBattleDetail(req.user, req.params.id);
    return success(res, { battle: view });
  } catch (err) {
    return error(res, err.message || 'Battle not found', 404);
  }
};

// ─── Create ────────────────────────────────────────────────────────────────────
const createBattle = async (req, res) => {
  try {
    const battle = await battleService.createBattle(req.user._id, req.body);
    return success(
      res,
      { battle: { _id: battle._id, battleCode: battle.battleCode, status: battle.status } },
      'Battle created and published to the lobby',
      201
    );
  } catch (err) {
    return error(res, err.message || 'Failed to create battle', 400);
  }
};

// ─── Join ──────────────────────────────────────────────────────────────────────
const joinBattle = async (req, res) => {
  try {
    const battle = await battleService.joinBattle(req.user._id, req.params.id);
    const isFull = battle.status === 'in_progress';
    const payload = { battleId: battle._id, battleCode: battle.battleCode, status: battle.status };
    // Reveal credentials to this participant the moment the battle goes full
    if (isFull) {
      payload.roomId = battle.roomId;
      payload.roomPassword = battle.roomPassword;
    }
    return success(res, payload, isFull ? 'Battle joined — it is now full and starting!' : 'Joined battle');
  } catch (err) {
    return error(res, err.message || 'Failed to join battle', 400);
  }
};

// ─── Leave (open battle only) ─────────────────────────────────────────────────
const leaveBattle = async (req, res) => {
  try {
    await battleService.leaveBattle(req.user._id, req.params.id);
    return success(res, {}, 'Left battle — entry refunded');
  } catch (err) {
    return error(res, err.message || 'Failed to leave battle', 400);
  }
};

// ─── Screenshot upload for win claim ──────────────────────────────────────────
const uploadResultScreenshot = async (req, res) => {
  try {
    if (!req.file) return error(res, 'Screenshot is required', 400);
    return success(res, {
      screenshotUrl: `/uploads/screenshots/${req.file.filename}`,
    }, 'Screenshot uploaded');
  } catch (err) {
    return error(res, err.message || 'Upload failed', 500);
  }
};

// ─── Submit result claim ───────────────────────────────────────────────────────
const submitResult = async (req, res) => {
  try {
    const { claim, screenshotUrl, cancelReason, remarks } = req.body;
    const battle = await battleService.submitResult(req.user._id, req.params.id, {
      claim,
      screenshotUrl,
      cancelReason,
      remarks,
    });
    return success(
      res,
      { battleId: battle._id, status: battle.status },
      'Result submitted. Battle status: ' + battle.status
    );
  } catch (err) {
    return error(res, err.message || 'Failed to submit result', 400);
  }
};

// ─── Admin: list (scoped) ─────────────────────────────────────────────────────
const adminListBattles = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const filter = {};
    if (!isMainAdmin(req.user)) filter.subAdmin = req.user._id;
    else if (req.query.subAdminId) filter.subAdmin = req.query.subAdminId;
    if (req.query.status) filter.status = req.query.status;
    else filter.status = { $in: ['result_pending', 'disputed'] };

    const result = await battleService.listBattles(filter, page, limit);
    return paginated(res, result.battles, {
      page: result.page,
      limit,
      total: result.total,
      pages: result.pages,
    });
  } catch (err) {
    return error(res, err.message || 'Failed to list battles', 500);
  }
};

// ─── Admin: battle detail with submissions + screenshots ─────────────────────
const adminGetBattle = async (req, res) => {
  try {
    const battle = await OpenBattle.findById(req.params.id)
      .populate('creator', 'username email')
      .populate('subAdmin', 'username subAdminInfo.displayName')
      .populate('winner', 'username')
      .populate('participants.user', 'username email');
    if (!battle) return error(res, 'Battle not found', 404);
    if (!isMainAdmin(req.user) && String(req.user._id) !== String(battle.subAdmin)) {
      return error(res, 'Not your battle scope', 403);
    }
    return success(res, { battle });
  } catch (err) {
    return error(res, 'Failed to fetch battle', 500);
  }
};

// ─── Admin: resolve dispute ────────────────────────────────────────────────────
const resolveDispute = async (req, res) => {
  try {
    const { decision, winnerId, remarks } = req.body;
    const battle = await battleService.resolveDispute(req.user, req.params.id, {
      decision,
      winnerId,
      remarks,
    });
    return success(res, { battleId: battle._id, status: battle.status }, `Battle ${battle.status}`);
  } catch (err) {
    return error(res, err.message || 'Failed to resolve dispute', 400);
  }
};

module.exports = {
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
};
