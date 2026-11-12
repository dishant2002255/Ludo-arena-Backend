const Room = require('../models/Room');
const GameState = require('../models/GameState');
const { getRoomDetails } = require('../services/room.service');
const { success, error } = require('../utils/apiResponse');

const getRoomById = async (req, res) => {
  try {
    const room = await getRoomDetails(req.params.roomId);
    if (!room) return error(res, 'Room not found', 404);

    // Only players in the room can view it (or admins)
    const isPlayer = room.players.some((p) => p.user._id.toString() === req.user._id.toString());
    const isAdmin = req.user.role === 'admin';
    if (!isPlayer && !isAdmin) return error(res, 'Access denied', 403);

    return success(res, { room });
  } catch (err) {
    return error(res, 'Failed to fetch room', 500);
  }
};

const getRoomState = async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return error(res, 'Room not found', 404);

    const isPlayer = room.players.some((p) => p.user.toString() === req.user._id.toString());
    if (!isPlayer && req.user.role !== 'admin') return error(res, 'Access denied', 403);

    const gameState = await GameState.findOne({ room: room._id });
    return success(res, { gameState });
  } catch (err) {
    return error(res, 'Failed to fetch game state', 500);
  }
};

const reconnectToRoom = async (req, res) => {
  try {
    const room = await getRoomDetails(req.params.roomId);
    if (!room) return error(res, 'Room not found', 404);

    const isPlayer = room.players.some((p) => p.user._id.toString() === req.user._id.toString());
    if (!isPlayer) return error(res, 'You are not in this room', 403);

    let gameState = null;
    if (room.gameState) {
      gameState = await GameState.findById(room.gameState);
    }

    return success(res, { room, gameState }, 'Reconnected successfully');
  } catch (err) {
    return error(res, 'Failed to reconnect', 500);
  }
};

module.exports = { getRoomById, getRoomState, reconnectToRoom };
