const mongoose = require('mongoose');

/**
 * SystemSettings — singleton admin-configurable platform settings.
 * Only one document exists (upserted on first access).
 *
 * IMPORTANT: UPI payment settings are stored here but payment processing
 * is NOT automated. Admin manually verifies payments in their bank.
 */
const systemSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },

    // ── Coin pricing ───────────────────────────────────────────────────────
    coinPriceRupees: { type: Number, default: 1 },         // 1 coin = ₹1
    minimumPurchaseCoins: { type: Number, default: 200 },  // min ₹200
    maximumPurchaseCoins: { type: Number, default: 10000 }, // max ₹10,000

    // ── UPI Payment Configuration (PLACEHOLDER — not yet active) ──────────
    upiEnabled: { type: Boolean, default: false },         // must be false until legal clearance
    upiId: { type: String, trim: true, default: '' },      // e.g. merchant@upi
    upiName: { type: String, trim: true, default: '' },    // display name
    upiNote: { type: String, trim: true, default: 'Ludo Arena Coins Purchase' },

    // UPI deep links for each app
    upiApps: {
      gpay:    { type: Boolean, default: true },
      phonepe: { type: Boolean, default: true },
      paytm:   { type: Boolean, default: true },
      bhim:    { type: Boolean, default: true },
    },

    // ── Payment order expiry ───────────────────────────────────────────────
    orderExpiryMinutes: { type: Number, default: 30 },

    // ── Admin notification settings ────────────────────────────────────────
    adminAlarmEnabled: { type: Boolean, default: true },

    // Last updated by
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Always upsert on get
systemSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ key: 'global' });
  if (!settings) {
    settings = await this.create({ key: 'global' });
  }
  return settings;
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
