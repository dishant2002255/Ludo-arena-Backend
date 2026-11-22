/**
 * Withdrawal Controller — user submissions, sub-admin/main-admin review.
 * Revolving stock: approved withdrawals return coins to Sub-Admin coinStock.
 */
const WithdrawalRequest = require('../models/WithdrawalRequest');
const { submitWithdrawal, approveWithdrawal, rejectWithdrawal } = require('../services/subAdmin.service');
const { success, error, paginated } = require('../utils/apiResponse');

const isMainAdmin = (u) => ['admin', 'main_admin'].includes(u?.role);

// ─── User: submit withdrawal ───────────────────────────────────────────────────
const createWithdrawal = async (req, res) => {
  try {
    const { subAdminId, amountCoins, payoutMethod, userUpiId, accountHolderName, bankAccountNumber, bankIfsc } = req.body;
    if (!subAdminId) return error(res, 'subAdminId is required', 400);
    const withdrawal = await submitWithdrawal(req.user._id, subAdminId, {
      amountCoins: parseInt(amountCoins),
      payoutMethod,
      userUpiId,
      accountHolderName,
      bankAccountNumber,
      bankIfsc,
    });
    return success(
      res,
      {
        withdrawal: {
          _id: withdrawal._id,
          withdrawalReference: withdrawal.withdrawalReference,
          amountCoins: withdrawal.amountCoins,
          amountRupees: withdrawal.amountRupees,
          status: withdrawal.status,
        },
      },
      `Withdrawal request submitted. ₹${withdrawal.amountRupees} will be paid to your UPI after verification.`,
      201
    );
  } catch (err) {
    return error(res, err.message || 'Failed to submit withdrawal', 400);
  }
};

// ─── User: my withdrawals ──────────────────────────────────────────────────────
const getMyWithdrawals = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;
    const query = { user: req.user._id };
    if (req.query.status) query.status = req.query.status;
    const [items, total] = await Promise.all([
      WithdrawalRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('subAdmin', 'username subAdminInfo.displayName')
        .populate('reviewedBy', 'username')
        .lean(),
      WithdrawalRequest.countDocuments(query),
    ]);
    return paginated(res, items, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch withdrawals', 500);
  }
};

// ─── Admin/Sub-Admin: list (scoped) ─────────────────────────────────────────────
const getWithdrawals = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const query = {};
    // Sub-Admins only see withdrawals under their own scope
    if (!isMainAdmin(req.user)) query.subAdmin = req.user._id;
    else if (req.query.subAdminId) query.subAdmin = req.query.subAdminId;

    if (req.query.status) query.status = req.query.status;

    const [items, total] = await Promise.all([
      WithdrawalRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'username email')
        .populate('subAdmin', 'username subAdminInfo.displayName')
        .populate('reviewedBy', 'username')
        .lean(),
      WithdrawalRequest.countDocuments(query),
    ]);
    return paginated(res, items, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch withdrawals', 500);
  }
};

const getWithdrawalById = async (req, res) => {
  try {
    const wd = await WithdrawalRequest.findById(req.params.id)
      .populate('user', 'username email')
      .populate('subAdmin', 'username subAdminInfo.displayName')
      .populate('reviewedBy', 'username')
      .lean();
    if (!wd) return error(res, 'Withdrawal not found', 404);
    if (!isMainAdmin(req.user) && String(req.user._id) !== String(wd.subAdmin?._id)) {
      return error(res, 'Not your withdrawal scope', 403);
    }
    return success(res, { withdrawal: wd });
  } catch (err) {
    return error(res, 'Failed to fetch withdrawal', 500);
  }
};

// ─── Admin/Sub-Admin: approve (revolving stock) ────────────────────────────────
const approve = async (req, res) => {
  try {
    const { utrReference, adminRemarks } = req.body;
    const wd = await WithdrawalRequest.findById(req.params.id);
    if (!wd) return error(res, 'Withdrawal not found', 404);
    if (wd.status !== 'pending') return error(res, `Withdrawal already ${wd.status}`, 400);
    if (!isMainAdmin(req.user) && String(req.user._id) !== String(wd.subAdmin)) {
      return error(res, 'You can only approve withdrawals under your own Sub-Admin account', 403);
    }
    if (!utrReference || String(utrReference).trim().length < 6) {
      return error(res, 'UTR reference (min 6 characters) is required to approve a payout', 400);
    }
    const updated = await approveWithdrawal(wd, req.user._id, String(utrReference).trim(), adminRemarks || '', req.ip);
    return success(res, { withdrawal: updated }, 'Withdrawal approved — coins returned to Sub-Admin stock');
  } catch (err) {
    return error(res, err.message || 'Failed to approve withdrawal', 400);
  }
};

// ─── Admin/Sub-Admin: reject (refund locked coins to user) ────────────────────
const reject = async (req, res) => {
  try {
    const { adminRemarks } = req.body;
    const wd = await WithdrawalRequest.findById(req.params.id);
    if (!wd) return error(res, 'Withdrawal not found', 404);
    if (wd.status !== 'pending') return error(res, `Withdrawal already ${wd.status}`, 400);
    if (!isMainAdmin(req.user) && String(req.user._id) !== String(wd.subAdmin)) {
      return error(res, 'You can only reject withdrawals under your own Sub-Admin account', 403);
    }
    const updated = await rejectWithdrawal(wd, req.user._id, adminRemarks || '', req.ip);
    return success(res, { withdrawal: updated }, 'Withdrawal rejected — coins refunded to user');
  } catch (err) {
    return error(res, err.message || 'Failed to reject withdrawal', 400);
  }
};

module.exports = {
  createWithdrawal,
  getMyWithdrawals,
  getWithdrawals,
  getWithdrawalById,
  approve,
  reject,
};
