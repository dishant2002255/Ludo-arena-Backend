const mongoose = require('mongoose');

const playerResultSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: String,
  color: String,
  rank: Number,
  coinsEarned: { type: Number, default: 0 },
  coinsSpent: { type: Number, default: 0 },
});

const gameHistorySchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
    },
    players: [playerResultSchema],
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    winnerColor: String,
    winnerUsername: String,
    duration: Number, // seconds
    startedAt: Date,
    completedAt: Date,
    isFinalized: { type: Boolean, default: true },
    // For administrative correction tracking
    correctionLog: [
      {
        correctedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reason: String,
        correctedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

gameHistorySchema.index({ room: 1 });
gameHistorySchema.index({ match: 1 });
gameHistorySchema.index({ winner: 1 });
gameHistorySchema.index({ 'players.user': 1 });
gameHistorySchema.index({ completedAt: -1 });

module.exports = mongoose.model('GameHistory', gameHistorySchema);
