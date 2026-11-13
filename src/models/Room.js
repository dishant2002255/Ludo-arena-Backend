const mongoose = require('mongoose');

const playerSlotSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  color: {
    type: String,
    enum: ['red', 'green', 'yellow', 'blue'],
    required: true,
  },
  position: { type: Number, min: 0, max: 3, required: true }, // seat 0-3
  isConnected: { type: Boolean, default: false },
  joinedAt: { type: Date, default: Date.now },
  disconnectedAt: { type: Date },
  finalRank: { type: Number, default: null }, // 1=winner, 2,3,4
});

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
    },
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
    },
    players: {
      type: [playerSlotSchema],
      validate: [
        (arr) => arr.length <= 4,
        'Room cannot have more than 4 players',
      ],
    },
    status: {
      type: String,
      enum: ['waiting', 'full', 'in_progress', 'completed', 'abandoned'],
      default: 'waiting',
    },
    gameState: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameState',
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    winnerColor: {
      type: String,
      enum: ['red', 'green', 'yellow', 'blue', null],
      default: null,
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    entryCoins: { type: Number, required: true },
    winnerReward: { type: Number, required: true },
    rewardDistributed: { type: Boolean, default: false },

    // External Ludo King room credentials (admin sets these after 4 players join)
    externalRoomId: { type: String, trim: true, default: '' },
    externalRoomPassword: { type: String, trim: true, default: '' },
    externalRoomPublishedAt: { type: Date, default: null },
    externalRoomPublishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

roomSchema.index({ status: 1 });
roomSchema.index({ match: 1 });
roomSchema.index({ 'players.user': 1 });

module.exports = mongoose.model('Room', roomSchema);
