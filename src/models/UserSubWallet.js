const mongoose = require('mongoose');

/**
 * UserSubWallet — per-user, per-Sub-Admin coin balance.
 *
 * Every user can hold coins under multiple Sub-Admins independently.
 * Coins under Sub-Admin A CANNOT be used for battles under Sub-Admin B.
 */
const userSubWalletSchema = new mongoose.Schema(
  {
    user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    balance:                 { type: Number, default: 0, min: 0 }, // playable & withdrawable
    lockedBattleBalance:     { type: Number, default: 0, min: 0 }, // in active open battles
    lockedWithdrawalBalance: { type: Number, default: 0, min: 0 }, // in pending withdrawals

    totalPurchased: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    totalWagered:   { type: Number, default: 0 },
    totalWon:       { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Each (user, subAdmin) pair is unique
userSubWalletSchema.index({ user: 1, subAdmin: 1 }, { unique: true });

/**
 * Upsert helper — get or create wallet for (user, subAdmin) pair.
 */
userSubWalletSchema.statics.getOrCreate = async function (userId, subAdminId) {
  let wallet = await this.findOne({ user: userId, subAdmin: subAdminId });
  if (!wallet) {
    wallet = await this.create({ user: userId, subAdmin: subAdminId });
  }
  return wallet;
};

module.exports = mongoose.model('UserSubWallet', userSubWalletSchema);
