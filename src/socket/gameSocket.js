/**
 * Game Socket Handler
 * Handles all real-time game events.
 */

const Room = require('../models/Room');
const GameState = require('../models/GameState');
const { handleDiceRoll, handleTokenMove } = require('../services/game.service');
const { startGame, getRoomDetails } = require('../services/room.service');
const logger = require('../utils/logger');

// Track active turn timers: roomId -> timeout handle
const turnTimers = new Map();

const clearTurnTimer = (roomId) => {
  if (turnTimers.has(roomId)) {
    clearTimeout(turnTimers.get(roomId));
    turnTimers.delete(roomId);
  }
};

/**
 * Start a turn timer.  When it fires the current player has their turn
 * auto-skipped (dice is force-rolled and skipped) so the game never stalls.
 */
const startTurnTimer = (io, roomId, timeoutSeconds) => {
  clearTurnTimer(roomId);
  const timer = setTimeout(async () => {
    try {
      logger.info({ roomId }, 'Turn timeout — auto-skipping current player');
      const room = await Room.findOne({ roomId }).populate('match');
      if (!room || room.status !== 'in_progress') return;

      const gameState = await GameState.findById(room.gameState);
      if (!gameState || gameState.status !== 'in_progress') return;

      // If dice hasn't been rolled yet, we roll for them (which may auto-skip)
      if (!gameState.diceRolled) {
        const { processRoll } = require('../game/engine/game.engine');
        const rules = room.match?.rules || {};
        const result = processRoll(gameState.toObject(), rules);
        if (result.success) {
          await GameState.findOneAndUpdate(
            { _id: gameState._id, version: gameState.version },
            { $set: { ...result.newState, version: gameState.version + 1 } }
          );
          io.to(roomId).emit('game:state', result.newState);
          io.to(roomId).emit('dice:result', {
            diceValue: result.diceValue,
            color: gameState.currentTurn,
            movableTokens: result.movableTokens || [],
            autoSkip: true,
            timeout: true,
          });
          io.to(roomId).emit('game:turn-changed', { color: result.newState.currentTurn });
          // Restart timer for next player
          startTurnTimer(io, roomId, timeoutSeconds);
        }
      }
    } catch (err) {
      logger.error({ err, roomId }, 'Turn timeout handler error');
    }
  }, timeoutSeconds * 1000);
  turnTimers.set(roomId, timer);
};

const registerGameHandlers = (io, socket) => {
  const userId = socket.user._id.toString();

  // Join room
  socket.on('room:join', async ({ roomId }) => {
    try {
      const room = await getRoomDetails(roomId);
      if (!room) return socket.emit('error', { message: 'Room not found' });

      const isPlayer = room.players.some((p) => p.user._id.toString() === userId);
      if (!isPlayer) return socket.emit('error', { message: 'Not a player in this room' });

      socket.join(roomId);

      // Mark connected
      await Room.updateOne(
        { roomId, 'players.user': socket.user._id },
        { $set: { 'players.$.isConnected': true } }
      );

      const updatedRoom = await getRoomDetails(roomId);
      io.to(roomId).emit('room:updated', { room: updatedRoom });
      io.to(roomId).emit('player:connected', { userId, username: socket.user.username });

      logger.info({ roomId, userId, username: socket.user.username }, 'Player joined room socket');

      // If room is full and game not started, start it
      if (updatedRoom.status === 'full') {
        try {
          const { room: startedRoom, gameState } = await startGame(roomId);
          io.to(roomId).emit('game:start', { room: startedRoom, gameState });
          logger.info({ roomId }, 'Game auto-started');

          // Start turn timer for first player
          const timeoutSeconds = startedRoom.match?.rules?.turnTimeoutSeconds || 30;
          startTurnTimer(io, roomId, timeoutSeconds);
        } catch (startErr) {
          logger.warn({ err: startErr }, 'Game auto-start failed');
        }
      }

      // Send current game state for reconnection
      if (updatedRoom.status === 'in_progress') {
        const gameState = await GameState.findOne({ room: updatedRoom._id });
        if (gameState) {
          socket.emit('game:state', gameState);
          socket.emit('player:reconnected', { userId, username: socket.user.username });
          io.to(roomId).emit('player:reconnected', { userId, username: socket.user.username });
          // Restart turn timer since someone reconnected
          const timeoutSeconds = updatedRoom.match?.rules?.turnTimeoutSeconds || 30;
          startTurnTimer(io, roomId, timeoutSeconds);
        }
      }
    } catch (err) {
      logger.error({ err }, 'room:join error');
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Roll dice
  socket.on('dice:roll', async ({ roomId }) => {
    try {
      const result = await handleDiceRoll(roomId, socket.user._id);

      // Clear turn timer since player acted
      clearTurnTimer(roomId);

      // Emit dice result to all players
      io.to(roomId).emit('dice:result', {
        diceValue: result.diceValue,
        color: result.newState.currentTurn,
        movableTokens: result.movableTokens || [],
        autoSkip: result.autoSkip || false,
        forfeit: result.forfeit || false,
      });

      // Emit updated state
      io.to(roomId).emit('game:state', result.newState);

      if (result.autoSkip || result.forfeit) {
        io.to(roomId).emit('game:turn-changed', { color: result.newState.currentTurn });
        // Start timer for next player
        const room = await Room.findOne({ roomId }).populate('match');
        const timeoutSeconds = room?.match?.rules?.turnTimeoutSeconds || 30;
        startTurnTimer(io, roomId, timeoutSeconds);
      }
      // If dice was rolled but tokens can be moved, don't start timer yet
      // (wait for token:move instead)
    } catch (err) {
      socket.emit('error', { message: err.message || 'Failed to roll dice' });
    }
  });

  // Move token
  socket.on('token:move', async ({ roomId, tokenId }) => {
    try {
      // Clear any pending timer
      clearTurnTimer(roomId);

      const result = await handleTokenMove(roomId, socket.user._id, tokenId);

      // Emit move to all players
      io.to(roomId).emit('token:moved', {
        events: result.events,
        newState: result.newState,
      });

      io.to(roomId).emit('game:state', result.newState);

      if (result.gameFinished) {
        io.to(roomId).emit('game:finished', {
          winnerColor: result.newState.winnerColor,
          winnerId: result.newState.winner,
        });
        clearTurnTimer(roomId);
      } else {
        const turnChangedEvent = result.events.find((e) => e.type === 'turn_changed');
        if (turnChangedEvent) {
          io.to(roomId).emit('game:turn-changed', { color: turnChangedEvent.nextColor });
        }
        // Start timer for next turn (whether same player or next)
        const room = await Room.findOne({ roomId }).populate('match');
        const timeoutSeconds = room?.match?.rules?.turnTimeoutSeconds || 30;
        startTurnTimer(io, roomId, timeoutSeconds);
      }
    } catch (err) {
      socket.emit('error', { message: err.message || 'Failed to move token' });
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    try {
      // Find rooms this player is in
      const rooms = await Room.find({
        'players.user': socket.user._id,
        status: { $in: ['waiting', 'full', 'in_progress'] },
      });

      for (const room of rooms) {
        await Room.updateOne(
          { _id: room._id, 'players.user': socket.user._id },
          { $set: { 'players.$.isConnected': false, 'players.$.disconnectedAt': new Date() } }
        );

        io.to(room.roomId).emit('player:disconnected', {
          userId,
          username: socket.user.username,
        });
      }
    } catch (err) {
      logger.error({ err }, 'Disconnect handler error');
    }
  });
};

module.exports = registerGameHandlers;
