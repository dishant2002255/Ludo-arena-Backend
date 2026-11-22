const mongoose = require('mongoose');

/**
 * WithdrawalRequest — user requests to withdraw won coins back to their UPI/Bank.
 * On submit: coins LOCKED from UserSubWallet.balance → lockedWithdrawalBalance.
 * On approval: coins RETURNED to Sub-Admin coinStock (revolving model).
 * On rejection: coins REFUNDED from lockedWithdrawalBalance → balance.
 */
const withdrawalRequestSchema = new mongoose.Schema(
  {
    user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    amountCoins:  { type: Number, required: true, min: [1, 'Minimum withdrawal is 1 coin'] },
    amountRupees: { type: Number, required: true },   // 1:1 with amountCoins

    withdrawalReference: { type: String, required: true, unique: true }, // WD-XXXXXX

    payoutMethod: { type: String, enum: ['upi', 'bank'], default: 'upi' },

    // UPI payout details
    userUpiId:          { type: String, trim: true, default: '' },
    accountHolderName:  { type: String, trim: true, required: [true, 'Account holder name required'] },

    // Bank payout details (optional)
    bankAccountNumber: { type: String, trim: true, default: '' },
    bankIfsc:          { type: String, trim: true, default: '' },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },

    // Set by Sub-Admin on approval
    utrReference:   { type: String, trim: true, default: '' },
    payoutProofUrl: { type: String, default: null },
    adminRemarks:   { type: String, trim: true, maxlength: 500, default: '' },
    alarmActive:    { type: Boolean, default: true },
    reviewedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt:     { type: Date, default: null },

    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

withdrawalRequestSchema.index({ user: 1, subAdmin: 1, status: 1 });
withdrawalRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
