const mongoose = require('mongoose');

/**
 * UserSubWallet — per-user, per-Sub-Admin dual-bucket coin balance.
 *
 * depositBalance  — purchased via UPI. Playable ONLY, NEVER withdrawable.
 * winningBalance  — battle winnings. Both playable AND withdrawable.
 * balance         — always = depositBalance + winningBalance (total playable).
 */
const userSubWalletSchema = new mongoose.Schema(
  {
    user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // ── Dual buckets ──────────────────────────────────────────────────────
    depositBalance:  { type: Number, default: 0, min: 0 }, // play-only, NOT withdrawable
    winningBalance:  { type: Number, default: 0, min: 0 }, // play + withdrawable
    balance:         { type: Number, default: 0, min: 0 }, // = depositBalance + winningBalance

    lockedBattleBalance:     { type: Number, default: 0, min: 0 },
    lockedWithdrawalBalance: { type: Number, default: 0, min: 0 },

    totalPurchased: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    totalWagered:   { type: Number, default: 0 },
    totalWon:       { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSubWalletSchema.index({ user: 1, subAdmin: 1 }, { unique: true });

/** Recompute balance from buckets. Call before every save. */
userSubWalletSchema.methods.syncBalance = function () {
  this.balance = this.depositBalance + this.winningBalance;
};

userSubWalletSchema.statics.getOrCreate = async function (userId, subAdminId) {
  let wallet = await this.findOne({ user: userId, subAdmin: subAdminId });
  if (!wallet) {
    wallet = await this.create({ user: userId, subAdmin: subAdminId });
  }
  return wallet;
};

module.exports = mongoose.model('UserSubWallet', userSubWalletSchema);
