const User = require('../models/User');
const GameHistory = require('../models/GameHistory');
const Room = require('../models/Room');
const { success, error, paginated } = require('../utils/apiResponse');

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    return success(res, { user });
  } catch (err) {
    return error(res, 'Failed to fetch profile', 500);
  }
};

const updateProfile = async (req, res) => {
  try {
    const { username, avatar } = req.body;
    const updates = {};

    if (username) {
      const exists = await User.findOne({ username, _id: { $ne: req.user._id } });
      if (exists) return error(res, 'Username already taken', 409);
      updates.username = username;
    }
    if (avatar !== undefined) updates.avatar = avatar;

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    return success(res, { user });
  } catch (err) {
    return error(res, 'Failed to update profile', 500);
  }
};

const getDashboard = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Recent game history
    const recentGames = await GameHistory.find({ 'players.user': req.user._id })
      .sort({ completedAt: -1 })
      .limit(5)
      .populate('match', 'name')
      .lean();

    return success(res, {
      user,
      recentGames,
    });
  } catch (err) {
    return error(res, 'Failed to fetch dashboard', 500);
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({ isBlocked: false, role: 'user' })
        .select('username avatar totalWins totalMatches totalLosses walletBalance')
        .sort({ totalWins: -1, totalMatches: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments({ isBlocked: false, role: 'user' }),
    ]);

    const ranked = users.map((u, idx) => ({
      ...u,
      rank: skip + idx + 1,
      winRate: u.totalMatches > 0 ? Math.round((u.totalWins / u.totalMatches) * 100) : 0,
    }));

    return paginated(res, ranked, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch leaderboard', 500);
  }
};

const getMyMatches = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [games, total] = await Promise.all([
      GameHistory.find({ 'players.user': req.user._id })
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('match', 'name entryCoins winnerReward')
        .lean(),
      GameHistory.countDocuments({ 'players.user': req.user._id }),
    ]);

    return paginated(res, games, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch matches', 500);
  }
};

module.exports = { getProfile, updateProfile, getDashboard, getLeaderboard, getMyMatches };
