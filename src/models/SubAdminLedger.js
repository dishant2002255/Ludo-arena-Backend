const mongoose = require('mongoose');

/**
 * SubAdminLedger — immutable audit trail of every stock movement for a Sub-Admin.
 * Records match the Anti-Cheat equation:
 *   NetCoinsIssued === coinStock + activeUserBalances + activeEscrow + totalCommissionBurned
 */
const subAdminLedgerSchema = new mongoose.Schema(
  {
    subAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'main_admin_issue',
        'main_admin_deduct',
        'user_coin_purchase',
        'user_withdrawal_return',
        'battle_commission_recorded',
      ],
      required: true,
    },
    amount:          { type: Number, required: true },   // +/- effect on coinStock (or 0 for commission record)
    stockBefore:     { type: Number, required: true },
    stockAfter:      { type: Number, required: true },
    commissionAmount:{ type: Number, default: 0 },        // only for battle_commission_recorded

    relatedUser:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    paymentOrder:        { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentOrder', default: null },
    withdrawalRequest:   { type: mongoose.Schema.Types.ObjectId, ref: 'WithdrawalRequest', default: null },
    battle:              { type: mongoose.Schema.Types.ObjectId, ref: 'OpenBattle', default: null },
    actedBy:             { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    remarks:             { type: String, trim: true, default: '' },
    idempotencyKey:      { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

subAdminLedgerSchema.index({ subAdmin: 1, createdAt: -1 });
subAdminLedgerSchema.index({ type: 1 });

module.exports = mongoose.model('SubAdminLedger', subAdminLedgerSchema);
