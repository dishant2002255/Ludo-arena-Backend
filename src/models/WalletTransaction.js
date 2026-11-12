const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'registration_bonus',
        'daily_bonus',
        'match_entry',
        'match_win',
        'admin_adjust',
        'coin_request',
        'admin_correction',
        'tournament_reward',
        'coin_purchase',      // UPI payment approved by admin
        'refund',
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    }, // positive = credit, negative = debit
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    // References
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      default: null,
    },
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      default: null,
    },
    // Admin who made the adjustment
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Link to coin request (if applicable)
    coinRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CoinRequest',
      default: null,
    },
    // Link to tournament (if applicable)
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament',
      default: null,
    },
    // Link to payment order (if applicable)
    paymentOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentOrder',
      default: null,
    },
    // Idempotency key to prevent duplicate processing
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ type: 1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
