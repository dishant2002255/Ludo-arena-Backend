/**
 * Room Service — handles room creation, joining, and state management.
 */

const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const Match = require('../models/Match');
const GameState = require('../models/GameState');
const User = require('../models/User');
const { deductMatchEntry } = require('./wallet.service');
const { initGameState } = require('../game/engine/game.engine');
const { PLAYER_COLORS, PLAYERS_PER_ROOM } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Find an available waiting room for a match, or create one.
 */
const joinOrCreateRoom = async (userId, matchId) => {
  const match = await Match.findById(matchId);
  if (!match) throw new Error('Match not found');
  if (match.status !== 'active') throw new Error('Match is not available');

  // Check if user is already in an active room for this match
  const existingRoom = await Room.findOne({
    match: matchId,
    status: { $in: ['waiting', 'full', 'in_progress'] },
    'players.user': userId,
  });
  if (existingRoom) {
    throw new Error('You are already in a room for this match');
  }

  // Check user balance
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.walletBalance < match.entryCoins) {
    throw new Error(`Insufficient coins. You need ${match.entryCoins} coins to join.`);
  }

  // Find a waiting room
  let room = await Room.findOne({
    match: matchId,
    status: 'waiting',
  }).sort({ createdAt: 1 }); // oldest first

  if (!room) {
    // Create a new room
    const roomId = `ROOM-${uuidv4().split('-')[0].toUpperCase()}`;
    room = await Room.create({
      roomId,
      match: matchId,
      players: [],
      status: 'waiting',
      entryCoins: match.entryCoins,
      winnerReward: match.winnerReward,
    });
    await Match.findByIdAndUpdate(matchId, { $inc: { totalRoomsCreated: 1 } });
  }

  // Assign the next available color
  const takenColors = room.players.map((p) => p.color);
  const availableColors = PLAYER_COLORS.filter((c) => !takenColors.includes(c));
  if (availableColors.length === 0) throw new Error('Room is full');

  // Double-check that the room hasn't been filled by a concurrent request
  if (room.players.length >= PLAYERS_PER_ROOM) {
    throw new Error('Room is full');
  }

  const assignedColor = availableColors[0];
  const position = room.players.length;

  // Deduct entry fee
  if (match.entryCoins > 0) {
    await deductMatchEntry(userId, match.entryCoins, matchId, room._id);
  }

  // Add player to room
  room.players.push({
    user: userId,
    color: assignedColor,
    position,
    isConnected: false,
  });

  if (room.players.length >= PLAYERS_PER_ROOM) {
    room.status = 'full';
  }

  await room.save();

  logger.info({ userId, roomId: room.roomId, color: assignedColor }, 'Player joined room');

  return { room, assignedColor };
};

/**
 * Start the game for a room that is full.
 * Creates the GameState document and updates the room.
 */
const startGame = async (roomId) => {
  const room = await Room.findOne({ roomId }).populate('match');
  if (!room) throw new Error('Room not found');
  if (room.status !== 'full') throw new Error('Room is not full yet');

  const playerInputs = room.players.map((p) => ({
    userId: p.user,
    color: p.color,
  }));

  const stateData = initGameState(playerInputs);

  const gameState = await GameState.create({
    room: room._id,
    ...stateData,
  });

  room.gameState = gameState._id;
  room.status = 'in_progress';
  room.startedAt = new Date();
  await room.save();

  logger.info({ roomId }, 'Game started');
  return { room, gameState };
};

/**
 * Fetch room with populated players.
 */
const getRoomDetails = async (roomId) => {
  return Room.findOne({ roomId })
    .populate('players.user', 'username avatar walletBalance')
    .populate('match', 'name entryCoins winnerReward rules');
};

module.exports = { joinOrCreateRoom, startGame, getRoomDetails };
