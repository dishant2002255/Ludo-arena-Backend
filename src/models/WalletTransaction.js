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
        // Legacy / free-to-play types
        'registration_bonus',
        'daily_bonus',
        'match_entry',
        'match_win',
        'admin_adjust',
        'coin_request',
        'admin_correction',
        'tournament_reward',
        'coin_purchase',
        'refund',
        // Sub-Admin scoped types
        'battle_entry',
        'battle_win',
        'battle_refund',
        'withdrawal_lock',
        'withdrawal_approved',
        'withdrawal_refund',
      ],
      required: true,
    },
    amount:       { type: Number, required: true },
    balanceBefore:{ type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    description:  { type: String, trim: true },

    // References
    room:              { type: mongoose.Schema.Types.ObjectId, ref: 'Room',              default: null },
    match:             { type: mongoose.Schema.Types.ObjectId, ref: 'Match',             default: null },
    adjustedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User',              default: null },
    coinRequest:       { type: mongoose.Schema.Types.ObjectId, ref: 'CoinRequest',       default: null },
    tournament:        { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament',        default: null },
    paymentOrder:      { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentOrder',      default: null },
    subAdmin:          { type: mongoose.Schema.Types.ObjectId, ref: 'User',              default: null },
    openBattle:        { type: mongoose.Schema.Types.ObjectId, ref: 'OpenBattle',        default: null },
    withdrawalRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'WithdrawalRequest', default: null },

    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ type: 1 });
walletTransactionSchema.index({ subAdmin: 1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
