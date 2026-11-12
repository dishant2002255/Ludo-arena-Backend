const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Match name is required'],
      trim: true,
      maxlength: [100, 'Match name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    entryCoins: {
      type: Number,
      required: [true, 'Entry coins is required'],
      min: [0, 'Entry coins cannot be negative'],
    },
    winnerReward: {
      type: Number,
      required: [true, 'Winner reward is required'],
      min: [0, 'Winner reward cannot be negative'],
    },
    status: {
      type: String,
      enum: ['active', 'disabled'],
      default: 'active',
    },
    maxPlayers: {
      type: Number,
      default: 4,
      min: 4,
      max: 4,
    },
    // Game rule configuration
    rules: {
      requireSixToStart: { type: Boolean, default: true },
      bonusTurnOnSix: { type: Boolean, default: true },
      bonusTurnOnCapture: { type: Boolean, default: false },
      maxConsecutiveSixes: { type: Number, default: 3 },
      turnTimeoutSeconds: { type: Number, default: 30 },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    totalRoomsCreated: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

matchSchema.index({ status: 1 });
matchSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Match', matchSchema);
