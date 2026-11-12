/**
 * Wallet Service — atomic coin operations with idempotency.
 * ALL balance changes must go through this service.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const logger = require('../utils/logger');

/**
 * Credit or debit coins atomically.
 * Tries MongoDB transactions first (requires replica set).
 * Falls back to non-transactional updates for standalone MongoDB (local dev).
 *
 * @param {string} userId
 * @param {number} amount - positive = credit, negative = debit
 * @param {string} type   - transaction type
 * @param {string} description
 * @param {object} opts   - { roomId, matchId, adjustedBy, idempotencyKey, coinRequestId }
 */
const adjustWallet = async (userId, amount, type, description, opts = {}) => {
  try {
    return await _adjustWalletWithTransaction(userId, amount, type, description, opts);
  } catch (err) {
    // Standalone MongoDB does not support multi-document transactions
    if (
      err.message?.includes('Transaction numbers are only allowed on a replica set') ||
      err.message?.includes('replica set') ||
      err.codeName === 'IllegalOperation'
    ) {
      logger.warn('Replica set not available, falling back to non-transactional wallet update');
      return _adjustWalletWithoutTransaction(userId, amount, type, description, opts);
    }
    throw err;
  }
};

const _adjustWalletWithTransaction = async (userId, amount, type, description, opts = {}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error('User not found');
    if (user.isBlocked) throw new Error('User account is blocked');

    const newBalance = user.walletBalance + amount;
    if (newBalance < 0) {
      throw new Error(`Insufficient coins. Balance: ${user.walletBalance}, Required debit: ${Math.abs(amount)}`);
    }

    if (opts.idempotencyKey) {
      const existing = await WalletTransaction.findOne({ idempotencyKey: opts.idempotencyKey }).session(session);
      if (existing) {
        await session.abortTransaction();
        return existing;
      }
    }

    const txData = {
      user: userId,
      type,
      amount,
      balanceBefore: user.walletBalance,
      balanceAfter: newBalance,
      description,
      room: opts.roomId || null,
      match: opts.matchId || null,
      adjustedBy: opts.adjustedBy || null,
      coinRequest: opts.coinRequestId || null,
      tournament: opts.tournamentId || null,
      paymentOrder: opts.paymentOrderId || null,
      idempotencyKey: opts.idempotencyKey || undefined,
    };

    const [transaction] = await WalletTransaction.create([txData], { session });

    user.walletBalance = newBalance;
    if (amount > 0) {
      user.totalCoinsEarned = (user.totalCoinsEarned || 0) + amount;
    } else {
      user.totalCoinsSpent = (user.totalCoinsSpent || 0) + Math.abs(amount);
    }
    await user.save({ session });

    await session.commitTransaction();
    logger.info({ userId, amount, type, newBalance }, 'Wallet adjusted (transaction)');
    return transaction;
  } catch (err) {
    await session.abortTransaction();
    logger.error({ err, userId, amount, type }, 'Wallet transaction failed');
    throw err;
  } finally {
    session.endSession();
  }
};

const _adjustWalletWithoutTransaction = async (userId, amount, type, description, opts = {}) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.isBlocked) throw new Error('User account is blocked');

  const newBalance = user.walletBalance + amount;
  if (newBalance < 0) {
    throw new Error(`Insufficient coins. Balance: ${user.walletBalance}, Required debit: ${Math.abs(amount)}`);
  }

  // Idempotency check
  if (opts.idempotencyKey) {
    const existing = await WalletTransaction.findOne({ idempotencyKey: opts.idempotencyKey });
    if (existing) return existing;
  }

  const txData = {
    user: userId,
    type,
    amount,
    balanceBefore: user.walletBalance,
    balanceAfter: newBalance,
    description,
    room: opts.roomId || null,
    match: opts.matchId || null,
    adjustedBy: opts.adjustedBy || null,
    coinRequest: opts.coinRequestId || null,
    tournament: opts.tournamentId || null,
    paymentOrder: opts.paymentOrderId || null,
    idempotencyKey: opts.idempotencyKey || undefined,
  };

  const transaction = await WalletTransaction.create(txData);

  await User.findByIdAndUpdate(userId, {
    walletBalance: newBalance,
    $inc: {
      totalCoinsEarned: amount > 0 ? amount : 0,
      totalCoinsSpent: amount < 0 ? Math.abs(amount) : 0,
    },
  });

  logger.info({ userId, amount, type, newBalance }, 'Wallet adjusted (no-transaction)');
  return transaction;
};

/**
 * Grant registration bonus. Idempotent.
 */
const grantRegistrationBonus = async (userId) => {
  const { REGISTRATION_BONUS } = require('../config/constants');
  return adjustWallet(
    userId,
    REGISTRATION_BONUS,
    'registration_bonus',
    'Welcome bonus for new registration',
    { idempotencyKey: `reg_bonus_${userId}` }
  );
};

/**
 * Claim daily bonus. Returns { claimed, transaction, nextClaimAt }.
 */
const claimDailyBonus = async (userId) => {
  const { DAILY_LOGIN_REWARD } = require('../config/constants');
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const now = new Date();
  const lastBonus = user.lastDailyBonus;
  if (lastBonus) {
    const hoursSince = (now - lastBonus) / (1000 * 60 * 60);
    if (hoursSince < 24) {
      const nextClaimAt = new Date(lastBonus.getTime() + 24 * 60 * 60 * 1000);
      return { claimed: false, nextClaimAt };
    }
  }

  const transaction = await adjustWallet(
    userId,
    DAILY_LOGIN_REWARD,
    'daily_bonus',
    'Daily login bonus',
    { idempotencyKey: `daily_bonus_${userId}_${now.toDateString()}` }
  );

  await User.findByIdAndUpdate(userId, { lastDailyBonus: now });

  return { claimed: true, transaction, amount: DAILY_LOGIN_REWARD };
};

/**
 * Deduct match entry fee.
 */
const deductMatchEntry = async (userId, coins, matchId, roomId) => {
  return adjustWallet(userId, -coins, 'match_entry', `Match entry fee`, {
    matchId,
    roomId,
    idempotencyKey: `match_entry_${userId}_${roomId}`,
  });
};

/**
 * Credit match win reward.
 */
const creditMatchWin = async (userId, coins, matchId, roomId) => {
  return adjustWallet(userId, coins, 'match_win', `Match winner reward`, {
    matchId,
    roomId,
    idempotencyKey: `match_win_${userId}_${roomId}`,
  });
};

/**
 * Create a coin request (user-side). No balance change.
 */
const createCoinRequest = async (userId, requestedAmount, reason) => {
  const { MIN_COIN_REQUEST } = require('../config/constants');
  const CoinRequest = require('../models/CoinRequest');

  if (requestedAmount < MIN_COIN_REQUEST) {
    throw new Error(`Minimum request amount is ${MIN_COIN_REQUEST} coins`);
  }

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.isBlocked) throw new Error('Account is blocked');

  // Prevent spamming — only one pending request per user at a time
  const existing = await CoinRequest.findOne({ user: userId, status: 'pending' });
  if (existing) throw new Error('You already have a pending coin request');

  const req = await CoinRequest.create({ user: userId, requestedAmount, reason });
  return req;
};

/**
 * Approve a coin request (admin-side). Atomically credits coins.
 */
const approveCoinRequest = async (requestId, adminId, remarks = '') => {
  const CoinRequest = require('../models/CoinRequest');
  const Notification = require('../models/Notification');
  const { emitNotification, emitWalletUpdate } = require('../socket/socketInstance');

  const coinReq = await CoinRequest.findById(requestId).populate('user');
  if (!coinReq) throw new Error('Request not found');
  if (coinReq.status !== 'pending') throw new Error('Request is no longer pending');
  if (coinReq.user._id.toString() === adminId.toString()) {
    throw new Error('Admin cannot approve their own request');
  }

  // Credit coins atomically
  const tx = await adjustWallet(
    coinReq.user._id,
    coinReq.requestedAmount,
    'coin_request',
    `Free demo coins granted via request #${coinReq._id}`,
    {
      adjustedBy: adminId,
      idempotencyKey: `coin_req_approve_${requestId}`,
      coinRequestId: coinReq._id,
    }
  );

  // Update request
  coinReq.status = 'approved';
  coinReq.adminRemarks = remarks;
  coinReq.reviewedBy = adminId;
  coinReq.reviewedAt = new Date();
  coinReq.walletTransaction = tx._id;
  await coinReq.save();

  // Create notification for user
  const notification = await Notification.create({
    recipient: coinReq.user._id,
    type: 'coin_request_approved',
    title: 'Coin Request Approved ✅',
    message: `Your request for ${coinReq.requestedAmount} free demo coins has been approved!`,
    sentBy: adminId,
    data: { requestId: coinReq._id, amount: coinReq.requestedAmount },
  });

  // Real-time push
  emitNotification(coinReq.user._id.toString(), notification);
  emitWalletUpdate(coinReq.user._id.toString(), { newBalance: tx.balanceAfter, amount: coinReq.requestedAmount });

  return { coinRequest: coinReq, transaction: tx };
};

/**
 * Reject a coin request (admin-side). No balance change.
 */
const rejectCoinRequest = async (requestId, adminId, remarks = '') => {
  const CoinRequest = require('../models/CoinRequest');
  const Notification = require('../models/Notification');
  const { emitNotification } = require('../socket/socketInstance');

  const coinReq = await CoinRequest.findById(requestId).populate('user', 'username');
  if (!coinReq) throw new Error('Request not found');
  if (coinReq.status !== 'pending') throw new Error('Request is no longer pending');

  coinReq.status = 'rejected';
  coinReq.adminRemarks = remarks;
  coinReq.reviewedBy = adminId;
  coinReq.reviewedAt = new Date();
  await coinReq.save();

  // Create notification for user
  const notification = await Notification.create({
    recipient: coinReq.user._id,
    type: 'coin_request_rejected',
    title: 'Coin Request Rejected',
    message: `Your request for ${coinReq.requestedAmount} coins was rejected.${remarks ? ` Reason: ${remarks}` : ''}`,
    sentBy: adminId,
    data: { requestId: coinReq._id, remarks },
  });

  // Real-time push
  emitNotification(coinReq.user._id.toString(), notification);

  return coinReq;
};

/**
 * Get wallet analytics for admin dashboard.
 */
const getWalletAnalytics = async () => {
  const CoinRequest = require('../models/CoinRequest');

  const [
    coinsGranted,
    coinsMatchWon,
    coinsConsumed,
    coinsRefunded,
    pendingRequests,
    totalInCirculation,
    recentTransactions,
  ] = await Promise.all([
    WalletTransaction.aggregate([
      { $match: { type: { $in: ['admin_adjust', 'coin_request', 'admin_correction', 'registration_bonus', 'daily_bonus'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    WalletTransaction.aggregate([
      { $match: { type: 'match_win' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    WalletTransaction.aggregate([
      { $match: { type: 'match_entry', amount: { $lt: 0 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    WalletTransaction.aggregate([
      { $match: { type: 'refund' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    CoinRequest.countDocuments({ status: 'pending' }),
    User.aggregate([
      { $match: { role: 'user' } },
      { $group: { _id: null, total: { $sum: '$walletBalance' } } },
    ]),
    WalletTransaction.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'username')
      .lean(),
  ]);

  return {
    totalInCirculation: totalInCirculation[0]?.total || 0,
    coinsGranted: coinsGranted[0]?.total || 0,
    coinsMatchWon: coinsMatchWon[0]?.total || 0,
    coinsConsumed: Math.abs(coinsConsumed[0]?.total || 0),
    coinsRefunded: coinsRefunded[0]?.total || 0,
    pendingRequests,
    recentTransactions,
  };
};

/**
 * Credit tournament winner reward.
 */
const creditTournamentReward = async (userId, coins, tournamentId) => {
  return adjustWallet(userId, coins, 'tournament_reward', 'Tournament winner reward', {
    idempotencyKey: `tournament_reward_${userId}_${tournamentId}`,
    tournamentId,
  });
};

module.exports = {
  adjustWallet,
  grantRegistrationBonus,
  claimDailyBonus,
  deductMatchEntry,
  creditMatchWin,
  createCoinRequest,
  approveCoinRequest,
  rejectCoinRequest,
  getWalletAnalytics,
  creditTournamentReward,
};
