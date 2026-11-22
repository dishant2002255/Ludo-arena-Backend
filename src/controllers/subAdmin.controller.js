/**
 * Sub-Admin Controller — main-admin management of sub-admins, coin stock
 * operations, ledger views, and sub-admin self-service settings.
 */
const User = require('../models/User');
const SubAdminLedger = require('../models/SubAdminLedger');
const UserSubWallet = require('../models/UserSubWallet');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const { success, error, paginated } = require('../utils/apiResponse');
const subAdminService = require('../services/subAdmin.service');

const isMainAdmin = (user) => ['admin', 'main_admin'].includes(user.role);

// ─── Main Admin: List sub-admins ─────────────────────────────────────────────
const listSubAdmins = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const query = { role: 'sub_admin' };
    if (req.query.active === 'true') query['subAdminInfo.isActive'] = true;
    if (req.query.active === 'false') query['subAdminInfo.isActive'] = false;

    const [subAdmins, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('username email isBlocked createdAt subAdminInfo')
        .lean(),
      User.countDocuments(query),
    ]);

    return paginated(res, subAdmins, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch sub-admins', 500);
  }
};

// ─── Main Admin: Get sub-admin detail + audit metrics ────────────────────────
const getSubAdmin = async (req, res) => {
  try {
    const subAdmin = await User.findById(req.params.id).select(
      'username email isBlocked createdAt subAdminInfo'
    );
    if (!subAdmin || subAdmin.role !== 'sub_admin') {
      return error(res, 'Sub-Admin not found', 404);
    }

    const [metrics, recentLedger, recentWithdrawals] = await Promise.all([
      subAdminService.getSubAdminAuditMetrics(req.params.id),
      SubAdminLedger.find({ subAdmin: req.params.id }).sort({ createdAt: -1 }).limit(20).lean(),
      WithdrawalRequest.find({ subAdmin: req.params.id }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    return success(res, { subAdmin, metrics, recentLedger, recentWithdrawals });
  } catch (err) {
    return error(res, err.message || 'Failed to fetch sub-admin', 500);
  }
};

// ─── Main Admin: Create sub-admin ─────────────────────────────────────────────
const createSubAdmin = async (req, res) => {
  try {
    const subAdmin = await subAdminService.createSubAdmin(req.user._id, req.body);
    return success(res, { subAdmin: subAdmin.toJSON() }, 'Sub-Admin created successfully', 201);
  } catch (err) {
    return error(res, err.message || 'Failed to create sub-admin', 400);
  }
};

// ─── Main Admin: Issue coins ──────────────────────────────────────────────────
const issueCoins = async (req, res) => {
  try {
    const { amount, remarks } = req.body;
    const ledger = await subAdminService.issueCoinsToSubAdmin(
      req.user._id,
      req.params.id,
      amount,
      remarks
    );
    return success(res, { ledger }, `Issued ${amount} coins to sub-admin`);
  } catch (err) {
    return error(res, err.message || 'Failed to issue coins', 400);
  }
};

// ─── Main Admin: Deduct coins ─────────────────────────────────────────────────
const deductCoins = async (req, res) => {
  try {
    const { amount, remarks } = req.body;
    const ledger = await subAdminService.deductCoinsFromSubAdmin(
      req.user._id,
      req.params.id,
      amount,
      remarks
    );
    return success(res, { ledger }, `Deducted ${amount} coins from sub-admin`);
  } catch (err) {
    return error(res, err.message || 'Failed to deduct coins', 400);
  }
};

// ─── Main Admin: Suspend / Reactivate sub-admin ──────────────────────────────
const toggleSubAdminActive = async (req, res) => {
  try {
    const subAdmin = await User.findById(req.params.id);
    if (!subAdmin || subAdmin.role !== 'sub_admin') {
      return error(res, 'Sub-Admin not found', 404);
    }
    const newActive = !subAdmin.subAdminInfo.isActive;
    subAdmin.subAdminInfo.isActive = newActive;
    await subAdmin.save();
    return success(
      res,
      { isActive: newActive },
      newActive ? 'Sub-Admin reactivated' : 'Sub-Admin suspended'
    );
  } catch (err) {
    return error(res, 'Failed to update sub-admin status', 500);
  }
};

// ─── Sub-Admin self-service: profile & settings ──────────────────────────────
const getMySubAdminProfile = async (req, res) => {
  try {
    const subAdminId = req.user.role === 'sub_admin' ? req.user._id : req.params.id;
    if (!subAdminId) return error(res, 'Sub-Admin id required', 400);

    const subAdmin = await User.findById(subAdminId).select(
      'username email subAdminInfo createdAt'
    );
    if (!subAdmin || subAdmin.role !== 'sub_admin') {
      return error(res, 'Sub-Admin not found', 404);
    }
    const metrics = await subAdminService.getSubAdminAuditMetrics(subAdminId);
    return success(res, { subAdmin, metrics });
  } catch (err) {
    return error(res, err.message || 'Failed to fetch profile', 500);
  }
};

const updateMyUpiSettings = async (req, res) => {
  try {
    // Sub-admins can update their own UPI; main admin can update any sub-admin's
    const targetId = req.user.role === 'sub_admin' ? req.user._id : req.params.id;
    if (!targetId) return error(res, 'Sub-Admin id required', 400);

    const { upiEnabled, upiId, upiName, upiNote } = req.body;

    const subAdmin = await User.findById(targetId);
    if (!subAdmin || subAdmin.role !== 'sub_admin') {
      return error(res, 'Sub-Admin not found', 404);
    }

    if (upiEnabled === true && !upiId && !subAdmin.subAdminInfo.upiId) {
      return error(res, 'UPI ID is required before enabling UPI payments', 400);
    }

    if (upiId !== undefined) {
      const trimmed = String(upiId).trim();
      if (trimmed && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(trimmed)) {
        return error(res, 'Invalid UPI ID format (expected name@bank)', 400);
      }
      subAdmin.subAdminInfo.upiId = trimmed;
    }
    if (upiName !== undefined) subAdmin.subAdminInfo.upiName = String(upiName).trim();
    if (upiNote !== undefined) subAdmin.subAdminInfo.upiNote = String(upiNote).trim();
    if (upiEnabled !== undefined) subAdmin.subAdminInfo.upiEnabled = Boolean(upiEnabled);

    // Cannot disable if pending orders exist
    if (subAdmin.subAdminInfo.upiEnabled === false) {
      const PaymentOrder = require('../models/PaymentOrder');
      const pending = await PaymentOrder.countDocuments({
        subAdmin: targetId,
        status: { $in: ['pending', 'admin_notified'] },
      });
      if (pending > 0) {
        return error(
          res,
          `Cannot disable UPI while ${pending} pending payment order(s) exist`,
          400
        );
      }
    }

    await subAdmin.save();
    return success(
      res,
      { upi: subAdmin.subAdminInfo },
      'UPI settings updated'
    );
  } catch (err) {
    return error(res, err.message || 'Failed to update UPI settings', 500);
  }
};

// ─── Ledger listing (both main admin & sub-admin) ─────────────────────────────
const getLedger = async (req, res) => {
  try {
    // Sub-admins only see their own ledger
    const subAdminId = req.user.role === 'sub_admin' ? req.user._id : req.params.id;
    if (!subAdminId) return error(res, 'Sub-Admin id required', 400);

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const skip = (page - 1) * limit;

    const query = { subAdmin: subAdminId };
    if (req.query.type) query.type = req.query.type;

    const [entries, total] = await Promise.all([
      SubAdminLedger.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('relatedUser', 'username')
        .populate('actedBy', 'username role')
        .lean(),
      SubAdminLedger.countDocuments(query),
    ]);

    return paginated(res, entries, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch ledger', 500);
  }
};

// ─── Sub-admin's users (sub-wallets overview) ────────────────────────────────
const getSubAdminUsers = async (req, res) => {
  try {
    const subAdminId = req.user.role === 'sub_admin' ? req.user._id : req.params.id;
    if (!subAdminId) return error(res, 'Sub-Admin id required', 400);

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [wallets, total] = await Promise.all([
      UserSubWallet.find({ subAdmin: subAdminId })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'username isBlocked createdAt')
        .lean(),
      UserSubWallet.countDocuments({ subAdmin: subAdminId }),
    ]);

    return paginated(res, wallets, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch sub-admin users', 500);
  }
};

// ─── Audit metrics (main admin for any sub-admin; sub-admin for self) ─────────
const getAuditMetrics = async (req, res) => {
  try {
    const subAdminId = req.user.role === 'sub_admin' ? req.user._id : req.params.id;
    if (!subAdminId) return error(res, 'Sub-Admin id required', 400);
    const metrics = await subAdminService.getSubAdminAuditMetrics(subAdminId);
    return success(res, metrics);
  } catch (err) {
    return error(res, err.message || 'Failed to compute audit metrics', 500);
  }
};

module.exports = {
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
};
