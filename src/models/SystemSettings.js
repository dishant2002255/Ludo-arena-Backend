const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },

    // ── Coin pricing ───────────────────────────────────────────────────────
    coinPriceRupees:        { type: Number, default: 1 },
    minimumPurchaseCoins:   { type: Number, default: 200 },
    maximumPurchaseCoins:   { type: Number, default: 10000 },

    // ── UPI Payment (global fallback — Sub-Admins override with own UPI) ──
    upiEnabled: { type: Boolean, default: false },
    upiId:      { type: String, trim: true, default: '' },
    upiName:    { type: String, trim: true, default: '' },
    upiNote:    { type: String, trim: true, default: 'Ludo Arena Coins Purchase' },
    upiApps: {
      gpay:    { type: Boolean, default: true },
      phonepe: { type: Boolean, default: true },
      paytm:   { type: Boolean, default: true },
      bhim:    { type: Boolean, default: true },
    },

    orderExpiryMinutes: { type: Number, default: 30 },
    adminAlarmEnabled:  { type: Boolean, default: true },

    // ── Open Battle settings ───────────────────────────────────────────────
    battleCommissionPercent: { type: Number, default: 5, min: 0, max: 30 },
    minBattleCoins:          { type: Number, default: 50 },
    maxBattleCoins:          { type: Number, default: 25000 },
    enabledGameModes:        { type: [String], default: ['classic', 'quick', 'one_kill', 'popular'] },

    // ── Withdrawal settings ────────────────────────────────────────────────
    minWithdrawalCoins: { type: Number, default: 200 },
    maxWithdrawalCoins: { type: Number, default: 50000 },

    // ── Live fake activity (social proof) ──────────────────────────────────
    fakeActivityEnabled: { type: Boolean, default: true },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

systemSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ key: 'global' });
  if (!settings) {
    settings = await this.create({ key: 'global' });
  }
  return settings;
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
