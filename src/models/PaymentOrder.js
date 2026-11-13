const mongoose = require('mongoose');

/**
 * PaymentOrder — tracks every UPI coin purchase request.
 *
 * Flow:
 *   1. User requests coins → order created (status: pending)
 *   2. User redirected to UPI app externally
 *   3. Admin receives alarm notification
 *   4. Admin verifies receipt in their bank → approves or rejects
 *   5. On approval → coins credited to user wallet
 *
 * IMPORTANT: This model stores ZERO real financial data.
 * No actual payment processing happens here.
 * Admin manually verifies payment in their own bank/UPI app.
 */
const paymentOrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Coins requested (1 coin = ₹1)
    coinsRequested: {
      type: Number,
      required: true,
      min: [200, 'Minimum purchase is 200 coins (₹200)'],
    },

    // Amount in Rupees (same as coinsRequested since 1 coin = ₹1)
    amountRupees: {
      type: Number,
      required: true,
      min: [200, 'Minimum amount is ₹200'],
    },

    // Order reference shown to user during payment
    orderReference: {
      type: String,
      required: true,
      unique: true,
    },

    // Status lifecycle
    status: {
      type: String,
      enum: ['pending', 'admin_notified', 'approved', 'rejected', 'expired'],
      default: 'pending',
      // index defined below via schema.index({ status: 1 }) — not duplicated here
    },

    // UPI platform user selected
    upiPlatform: {
      type: String,
      enum: ['gpay', 'phonepe', 'paytm', 'bhim', 'other'],
      default: 'other',
    },

    // Admin actions
    adminRemarks: { type: String, trim: true, maxlength: 500, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },

    // Linked wallet transaction (set after approval)
    walletTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },

    // Admin notification alarm
    adminAlarmActive: { type: Boolean, default: true },  // true = alarm ringing
    adminAlarmDismissedAt: { type: Date, default: null },

    // Payment screenshot submitted by user as proof
    screenshotUrl: { type: String, default: null },
    screenshotOriginalName: { type: String, default: null },
    screenshotSubmittedAt: { type: Date, default: null },

    // Auto-expire pending orders after 30 minutes
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000),
    },
  },
  { timestamps: true }
);

paymentOrderSchema.index({ user: 1, status: 1 });
paymentOrderSchema.index({ createdAt: -1 });
// Note: orderReference has unique:true on field — no separate index needed
// TTL index to auto-expire abandoned orders
paymentOrderSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { status: 'pending' } });

module.exports = mongoose.model('PaymentOrder', paymentOrderSchema);
