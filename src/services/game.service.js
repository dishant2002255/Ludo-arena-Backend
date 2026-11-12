/**
 * Game Service — persists game state changes and orchestrates engine calls.
 */

const GameState = require('../models/GameState');
const Room = require('../models/Room');
const GameHistory = require('../models/GameHistory');
const User = require('../models/User');
const { creditMatchWin } = require('./wallet.service');
const { processRoll, processMove } = require('../game/engine/game.engine');
const logger = require('../utils/logger');

/**
 * Load game state as a plain JS object.
 */
const loadGameState = async (roomId) => {
  const room = await Room.findOne({ roomId }).populate('gameState');
  if (!room || !room.gameState) return null;
  return room.gameState;
};

/**
 * Handle dice roll for a user in a room.
 */
const handleDiceRoll = async (roomId, userId) => {
  const room = await Room.findOne({ roomId }).populate('match');
  if (!room) throw new Error('Room not found');
  if (room.status !== 'in_progress') throw new Error('Game not in progress');

  const gameState = await GameState.findById(room.gameState);
  if (!gameState) throw new Error('Game state not found');

  // Verify it is this user's turn
  const currentPlayer = gameState.players.find((p) => p.color === gameState.currentTurn);
  if (!currentPlayer || currentPlayer.user.toString() !== userId.toString()) {
    throw new Error('Not your turn');
  }

  const rules = room.match.rules || {};
  const result = processRoll(gameState.toObject(), rules);

  if (!result.success) throw new Error(result.error);

  // Persist new state using version for optimistic concurrency
  await GameState.findOneAndUpdate(
    { _id: gameState._id, version: gameState.version },
    {
      $set: {
        ...result.newState,
        version: gameState.version + 1,
      },
    },
    { new: true }
  );

  return result;
};

/**
 * Handle token move for a user in a room.
 */
const handleTokenMove = async (roomId, userId, tokenId) => {
  const room = await Room.findOne({ roomId }).populate('match');
  if (!room) throw new Error('Room not found');
  if (room.status !== 'in_progress') throw new Error('Game not in progress');

  const gameState = await GameState.findById(room.gameState);
  if (!gameState) throw new Error('Game state not found');

  // Verify it is this user's turn
  const currentPlayer = gameState.players.find((p) => p.color === gameState.currentTurn);
  if (!currentPlayer || currentPlayer.user.toString() !== userId.toString()) {
    throw new Error('Not your turn');
  }

  const rules = room.match.rules || {};
  const result = processMove(gameState.toObject(), tokenId, rules);

  if (!result.success) throw new Error(result.error);

  // Persist
  await GameState.findOneAndUpdate(
    { _id: gameState._id, version: gameState.version },
    {
      $set: {
        ...result.newState,
        version: gameState.version + 1,
      },
    }
  );

  // Handle game finished
  if (result.gameFinished) {
    await finalizeGame(room, result.newState);
  }

  return result;
};

/**
 * Finalize a completed game — update room, distribute rewards, save history.
 */
const finalizeGame = async (room, finalState) => {
  const winnerPlayerState = finalState.players.find((p) => p.color === finalState.winnerColor);
  if (!winnerPlayerState) return;

  // Prevent double reward
  const latestRoom = await Room.findById(room._id);
  if (latestRoom.rewardDistributed) return;

  // Credit winner
  if (room.winnerReward > 0) {
    await creditMatchWin(
      winnerPlayerState.user,
      room.winnerReward,
      room.match,
      room._id
    );
  }

  // Notify all players about match result
  const Notification = require('../models/Notification');
  const { emitNotification, emitWalletUpdate } = require('../socket/socketInstance');

  for (const p of finalState.players) {
    const isWinner = p.user.toString() === winnerPlayerState.user.toString();
    const notif = await Notification.create({
      recipient: p.user,
      type: isWinner ? 'match_won' : 'match_result',
      title: isWinner ? '🏆 You Won!' : 'Match Result',
      message: isWinner
        ? `Congratulations! You won ${room.winnerReward} virtual coins!`
        : `Match finished. ${finalState.winnerColor} player wins this round.`,
      data: {
        roomId: room.roomId,
        winnerColor: finalState.winnerColor,
        coinsEarned: isWinner ? room.winnerReward : 0,
      },
    });
    emitNotification(p.user.toString(), notif);
    if (isWinner && room.winnerReward > 0) {
      // Fetch updated balance for real-time wallet update
      const updatedUser = await User.findById(p.user).select('walletBalance');
      if (updatedUser) {
        emitWalletUpdate(p.user.toString(), { newBalance: updatedUser.walletBalance, amount: room.winnerReward });
      }
    }
  }

  // Update room
  room.status = 'completed';
  room.winner = winnerPlayerState.user;
  room.winnerColor = finalState.winnerColor;
  room.completedAt = new Date();
  room.rewardDistributed = true;

  // Assign ranks to room players
  for (const p of room.players) {
    const ps = finalState.players.find((x) => x.user.toString() === p.user.toString());
    if (ps) p.finalRank = ps.rank;
  }
  room.players[room.players.findIndex((p) => p.user.toString() === winnerPlayerState.user.toString())].finalRank = 1;

  await room.save();

  // Update user stats
  for (const p of finalState.players) {
    const isWinner = p.user.toString() === winnerPlayerState.user.toString();
    await User.findByIdAndUpdate(p.user, {
      $inc: {
        totalMatches: 1,
        totalWins: isWinner ? 1 : 0,
        totalLosses: isWinner ? 0 : 1,
      },
    });
  }

  // Create game history
  const startedAt = room.startedAt;
  const completedAt = new Date();
  const duration = Math.round((completedAt - (startedAt || completedAt)) / 1000);
  // room.match may be an ObjectId or a populated object — normalise to ID
  const matchId = room.match?._id || room.match;

  await GameHistory.create({
    room: room._id,
    match: matchId,
    players: finalState.players.map((p, idx) => ({
      user: p.user,
      color: p.color,
      rank: p.user.toString() === winnerPlayerState.user.toString() ? 1 : idx + 2,
      coinsEarned: p.user.toString() === winnerPlayerState.user.toString() ? room.winnerReward : 0,
      coinsSpent: room.entryCoins,
    })),
    winner: winnerPlayerState.user,
    winnerColor: finalState.winnerColor,
    duration,
    startedAt,
    completedAt,
    isFinalized: true,
  });

  logger.info({ roomId: room.roomId, winner: winnerPlayerState.color }, 'Game finalized');
};

module.exports = { loadGameState, handleDiceRoll, handleTokenMove, finalizeGame };
