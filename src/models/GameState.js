const mongoose = require('mongoose');

// Each token position on the board
const tokenSchema = new mongoose.Schema({
  id: { type: Number, required: true }, // 0-3
  state: {
    type: String,
    enum: ['home', 'active', 'finished'],
    default: 'home',
  },
  position: {
    type: Number,
    default: -1, // -1 = in base, 0-51 = main track, 100-105 = home lane
  },
});

const playerStateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  color: {
    type: String,
    enum: ['red', 'green', 'yellow', 'blue'],
    required: true,
  },
  tokens: { type: [tokenSchema], default: [] },
  finishedTokens: { type: Number, default: 0 },
  hasFinished: { type: Boolean, default: false },
  rank: { type: Number, default: null },
});

const gameStateSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      unique: true,
    },
    players: [playerStateSchema],
    currentTurn: {
      type: String,
      enum: ['red', 'green', 'yellow', 'blue'],
    },
    currentTurnUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    turnOrder: {
      type: [String],
      default: [],
    }, // ['red','green','yellow','blue']
    lastDiceValue: {
      type: Number,
      min: 1,
      max: 6,
      default: null,
    },
    diceRolled: { type: Boolean, default: false },
    consecutiveSixes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['waiting', 'in_progress', 'completed'],
      default: 'waiting',
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    winnerColor: { type: String, default: null },
    turnStartedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
    // Concurrency control
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GameState', gameStateSchema);
