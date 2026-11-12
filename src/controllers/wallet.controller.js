const WalletTransaction = require('../models/WalletTransaction');
const CoinRequest = require('../models/CoinRequest');
const { claimDailyBonus, createCoinRequest } = require('../services/wallet.service');
const User = require('../models/User');
const { success, error, paginated } = require('../utils/apiResponse');

// ─── Balance ──────────────────────────────────────────────────────────────────

const getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      'walletBalance totalCoinsEarned totalCoinsSpent lastDailyBonus'
    );

    const now = new Date();
    const lastBonus = user.lastDailyBonus;
    let canClaimDaily = true;
    let nextClaimAt = null;

    if (lastBonus) {
      const hoursSince = (now - lastBonus) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        canClaimDaily = false;
        nextClaimAt = new Date(lastBonus.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    // Total match rewards (match_win credits only)
    const matchRewardAgg = await WalletTransaction.aggregate([
      { $match: { user: req.user._id, type: 'match_win' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return success(res, {
      balance: user.walletBalance,
      totalEarned: user.totalCoinsEarned,
      totalSpent: user.totalCoinsSpent,
      totalMatchRewards: matchRewardAgg[0]?.total || 0,
      canClaimDaily,
      nextClaimAt,
    });
  } catch (err) {
    return error(res, 'Failed to fetch balance', 500);
  }
};

// ─── Transaction History ──────────────────────────────────────────────────────

const getHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const typeFilter = req.query.type;

    const query = { user: req.user._id };
    if (typeFilter) query.type = typeFilter;

    const [transactions, total] = await Promise.all([
      WalletTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('room', 'roomId')
        .populate('match', 'name')
        .populate('coinRequest', 'requestedAmount reason')
        .lean(),
      WalletTransaction.countDocuments(query),
    ]);

    return paginated(res, transactions, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch transaction history', 500);
  }
};

// ─── Daily Bonus ──────────────────────────────────────────────────────────────

const claimDaily = async (req, res) => {
  try {
    const result = await claimDailyBonus(req.user._id);
    if (!result.claimed) {
      return error(res, `Daily bonus already claimed. Next claim at ${result.nextClaimAt}`, 400);
    }
    return success(res, { amount: result.amount }, `Daily bonus of ${result.amount} coins claimed!`);
  } catch (err) {
    return error(res, err.message || 'Failed to claim daily bonus', 500);
  }
};

// ─── Coin Requests (User) ─────────────────────────────────────────────────────

const submitCoinRequest = async (req, res) => {
  try {
    const { requestedAmount, reason } = req.body;

    if (!requestedAmount || !reason) {
      return error(res, 'requestedAmount and reason are required', 400);
    }

    const coinReq = await createCoinRequest(req.user._id, requestedAmount, reason);
    return success(res, { coinRequest: coinReq }, 'Coin request submitted successfully', 201);
  } catch (err) {
    return error(res, err.message || 'Failed to submit request', 400);
  }
};

const getMyCoinRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      CoinRequest.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('reviewedBy', 'username')
        .lean(),
      CoinRequest.countDocuments({ user: req.user._id }),
    ]);

    return paginated(res, requests, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch requests', 500);
  }
};

module.exports = {
  getBalance,
  getHistory,
  claimDaily,
  submitCoinRequest,
  getMyCoinRequests,
};
