const Match = require('../models/Match');
const { joinOrCreateRoom } = require('../services/room.service');
const { success, error, paginated } = require('../utils/apiResponse');

const getMatches = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { status: 'active' };

    const [matches, total] = await Promise.all([
      Match.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Match.countDocuments(filter),
    ]);

    return paginated(res, matches, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Failed to fetch matches', 500);
  }
};

const getMatchById = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id).populate('createdBy', 'username');
    if (!match) return error(res, 'Match not found', 404);
    return success(res, { match });
  } catch (err) {
    return error(res, 'Failed to fetch match', 500);
  }
};

const joinMatch = async (req, res) => {
  try {
    const { room, assignedColor } = await joinOrCreateRoom(req.user._id, req.params.id);

    const populated = await room.populate([
      { path: 'players.user', select: 'username avatar' },
      { path: 'match', select: 'name entryCoins winnerReward rules' },
    ]);

    return success(res, { room: populated, assignedColor }, 'Successfully joined match', 200);
  } catch (err) {
    return error(res, err.message || 'Failed to join match', 400);
  }
};

module.exports = { getMatches, getMatchById, joinMatch };
