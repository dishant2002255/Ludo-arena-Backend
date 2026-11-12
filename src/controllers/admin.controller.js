const User = require('../models/User');
const Match = require('../models/Match');
const Room = require('../models/Room');
const GameHistory = require('../models/GameHistory');
const WalletTransaction = require('../models/WalletTransaction');
const CoinRequest = require('../models/CoinRequest');
const Tournament = require('../models/Tournament');
const AdminLog = require('../models/AdminLog');
const Notification = require('../models/Notification');
const { adjustWallet, approveCoinRequest, rejectCoinRequest, getWalletAnalytics } = require('../services/wallet.service');
const { success, error, paginated } = require('../utils/apiResponse');

const logAction = async (adminId, action, targetType, targetId, details, ip) => {
  try {
    await AdminLog.create({ admin: adminId, action, targetType, targetId, details, ipAddress: ip });
  } catch {}
};

// Dashboard stats
const getDashboard = async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalMatches,
      activeRooms,
      completedMatches,
      totalCoinsDistributed,
      pendingCoinRequests,
      // Tournament stats
      openTournaments,
      fullTournaments,
      waitingTournaments,
      pendingVerifications,
      completedTournaments,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'user', isBlocked: false }),
      Match.countDocuments(),
      Room.countDocuments({ status: { $in: ['waiting', 'full', 'in_progress'] } }),
      Room.countDocuments({ status: 'completed' }),
      WalletTransaction.aggregate([
        { $match: { type: 'match_win' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CoinRequest.countDocuments({ status: 'pending' }),
      Tournament.countDocuments({ status: 'open' }),
      Tournament.countDocuments({ status: 'full' }),
      Tournament.countDocuments({ status: 'waiting_for_admin' }),
      Tournament.countDocuments({ status: 'result_pending' }),
      Tournament.countDocuments({ status: 'completed' }),
    ]);

    const recentActivity = await AdminLog.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('admin', 'username')
      .lean();

    return success(res, {
      totalUsers,
      activeUsers,
      totalMatches,
      activeRooms,
      completedMatches,
      totalCoinsDistributed: totalCoinsDistributed[0]?.total || 0,
      pendingCoinRequests,
      // tournaments
      openTournaments,
      fullTournaments,
      waitingTournaments,
      pendingVerifications,
      completedTournaments,
      recentActivity,
    });
  } catch (err) {
    return error(res, 'Failed to fetch dashboard', 500);
  }
};

// User management
const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const filter = req.query.filter; // 'blocked', 'active'

    const query = { role: 'user' };
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (filter === 'blocked') query.isBlocked = true;
    if (filter === 'active') query.isBlocked = false;

    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(query),
    ]);

    return paginated(res, users, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch users', 500);
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return error(res, 'User not found', 404);

    const [recentGames, recentTransactions] = await Promise.all([
      GameHistory.find({ 'players.user': req.params.id }).sort({ completedAt: -1 }).limit(10).lean(),
      WalletTransaction.find({ user: req.params.id }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    return success(res, { user, recentGames, recentTransactions });
  } catch (err) {
    return error(res, 'Failed to fetch user', 500);
  }
};

const toggleBlockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return error(res, 'User not found', 404);
    if (user.role === 'admin') return error(res, 'Cannot block an admin', 400);

    user.isBlocked = !user.isBlocked;
    await user.save();

    await logAction(req.user._id, user.isBlocked ? 'block_user' : 'unblock_user', 'user', user._id, {}, req.ip);
    return success(res, { isBlocked: user.isBlocked }, `User ${user.isBlocked ? 'blocked' : 'unblocked'}`);
  } catch (err) {
    return error(res, 'Failed to update user', 500);
  }
};

// Match management
const createMatch = async (req, res) => {
  try {
    const match = await Match.create({ ...req.body, createdBy: req.user._id });
    await logAction(req.user._id, 'create_match', 'match', match._id, { name: match.name }, req.ip);
    return success(res, { match }, 'Match created', 201);
  } catch (err) {
    return error(res, err.message || 'Failed to create match', 500);
  }
};

const updateMatch = async (req, res) => {
  try {
    const match = await Match.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!match) return error(res, 'Match not found', 404);
    await logAction(req.user._id, 'update_match', 'match', match._id, req.body, req.ip);
    return success(res, { match }, 'Match updated');
  } catch (err) {
    return error(res, err.message || 'Failed to update match', 500);
  }
};

const deleteMatch = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return error(res, 'Match not found', 404);

    // Soft delete — disable instead
    match.status = 'disabled';
    await match.save();
    await logAction(req.user._id, 'disable_match', 'match', match._id, {}, req.ip);
    return success(res, {}, 'Match disabled');
  } catch (err) {
    return error(res, 'Failed to delete match', 500);
  }
};

const getAdminMatches = async (req, res) => {
  try {
    const matches = await Match.find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'username')
      .lean();
    return success(res, { matches });
  } catch (err) {
    return error(res, 'Failed to fetch matches', 500);
  }
};

// Rooms
const getRooms = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const query = status ? { status } : {};
    const [rooms, total] = await Promise.all([
      Room.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('players.user', 'username avatar')
        .populate('match', 'name')
        .lean(),
      Room.countDocuments(query),
    ]);

    return paginated(res, rooms, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch rooms', 500);
  }
};

// Results
const getResults = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [results, total] = await Promise.all([
      GameHistory.find()
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('winner', 'username avatar')
        .populate('match', 'name')
        .lean(),
      GameHistory.countDocuments(),
    ]);

    return paginated(res, results, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch results', 500);
  }
};

// Coin adjustment
const adjustCoins = async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;
    if (!userId || amount === undefined || !reason) {
      return error(res, 'userId, amount, and reason are required', 400);
    }

    const transaction = await adjustWallet(
      userId,
      amount,
      'admin_adjust',
      reason,
      { adjustedBy: req.user._id }
    );

    await logAction(req.user._id, 'adjust_coins', 'wallet', userId, { amount, reason }, req.ip);
    return success(res, { transaction }, 'Coins adjusted');
  } catch (err) {
    return error(res, err.message || 'Failed to adjust coins', 500);
  }
};

// ─── Coin Request Management ──────────────────────────────────────────────────

const getCoinRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    const query = {};
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query.status = status;
    }

    // If search provided, find matching users first
    if (search) {
      const users = await User.find({
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { _id: search.match(/^[a-f\d]{24}$/i) ? search : undefined },
        ].filter(Boolean),
      }).select('_id');
      query.user = { $in: users.map(u => u._id) };
    }

    const [requests, total] = await Promise.all([
      CoinRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'username email walletBalance')
        .populate('reviewedBy', 'username')
        .lean(),
      CoinRequest.countDocuments(query),
    ]);

    return paginated(res, requests, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch coin requests', 500);
  }
};

const getCoinRequestById = async (req, res) => {
  try {
    const coinReq = await CoinRequest.findById(req.params.id)
      .populate('user', 'username email walletBalance totalCoinsEarned totalCoinsSpent')
      .populate('reviewedBy', 'username')
      .populate('walletTransaction')
      .lean();

    if (!coinReq) return error(res, 'Request not found', 404);
    return success(res, { coinRequest: coinReq });
  } catch (err) {
    return error(res, 'Failed to fetch request', 500);
  }
};

const handleApproveCoinRequest = async (req, res) => {
  try {
    const { remarks } = req.body;
    const { id } = req.params;

    const result = await approveCoinRequest(id, req.user._id, remarks || '');

    await logAction(
      req.user._id,
      'approve_coin_request',
      'wallet',
      result.coinRequest.user,
      { requestId: id, amount: result.coinRequest.requestedAmount, remarks },
      req.ip
    );

    return success(
      res,
      { coinRequest: result.coinRequest, transaction: result.transaction },
      `Approved: ${result.coinRequest.requestedAmount} coins credited`
    );
  } catch (err) {
    return error(res, err.message || 'Failed to approve request', 400);
  }
};

const handleRejectCoinRequest = async (req, res) => {
  try {
    const { remarks } = req.body;
    const { id } = req.params;

    const coinReq = await rejectCoinRequest(id, req.user._id, remarks || '');

    await logAction(
      req.user._id,
      'reject_coin_request',
      'wallet',
      coinReq.user,
      { requestId: id, remarks },
      req.ip
    );

    return success(res, { coinRequest: coinReq }, 'Request rejected');
  } catch (err) {
    return error(res, err.message || 'Failed to reject request', 400);
  }
};

// ─── Wallet Analytics ─────────────────────────────────────────────────────────

const getWalletDashboard = async (req, res) => {
  try {
    const analytics = await getWalletAnalytics();
    return success(res, analytics);
  } catch (err) {
    return error(res, 'Failed to fetch wallet analytics', 500);
  }
};

const getUserTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.params.userId).select('username email walletBalance');
    if (!user) return error(res, 'User not found', 404);

    const [transactions, total] = await Promise.all([
      WalletTransaction.find({ user: req.params.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('adjustedBy', 'username')
        .populate('coinRequest', 'requestedAmount reason status')
        .lean(),
      WalletTransaction.countDocuments({ user: req.params.userId }),
    ]);

    return paginated(res, transactions, { page, limit, total, pages: Math.ceil(total / limit) }, 'User transactions');
  } catch (err) {
    return error(res, 'Failed to fetch transactions', 500);
  }
};

// Admin logs
const getLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AdminLog.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('admin', 'username')
        .lean(),
      AdminLog.countDocuments(),
    ]);

    return paginated(res, logs, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch logs', 500);
  }
};

// Send notification
const sendNotification = async (req, res) => {
  try {
    const { title, message, type, recipientIds } = req.body;
    const notifications = [];

    if (recipientIds && recipientIds.length > 0) {
      // Targeted
      for (const uid of recipientIds) {
        notifications.push({ recipient: uid, type: type || 'admin', title, message, sentBy: req.user._id });
      }
    } else {
      // Broadcast — null recipient means all
      notifications.push({ recipient: null, type: type || 'announcement', title, message, sentBy: req.user._id });
    }

    await Notification.insertMany(notifications);
    await logAction(req.user._id, 'send_notification', 'system', null, { title, count: notifications.length }, req.ip);
    return success(res, { count: notifications.length }, 'Notification sent');
  } catch (err) {
    return error(res, 'Failed to send notification', 500);
  }
};

module.exports = {
  getDashboard,
  getUsers,
  getUserById,
  toggleBlockUser,
  createMatch,
  updateMatch,
  deleteMatch,
  getAdminMatches,
  getRooms,
  getResults,
  adjustCoins,
  getLogs,
  sendNotification,
  // Coin requests
  getCoinRequests,
  getCoinRequestById,
  handleApproveCoinRequest,
  handleRejectCoinRequest,
  // Wallet analytics
  getWalletDashboard,
  getUserTransactions,
};
