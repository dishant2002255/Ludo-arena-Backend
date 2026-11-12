const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null = broadcast to all
    },
    type: {
      type: String,
      enum: [
        'announcement',
        'match_result',
        'coin_credit',
        'coin_request_submitted',
        'coin_request_approved',
        'coin_request_rejected',
        'match_entry_deducted',
        'match_won',
        'match_cancelled',
        // Tournament events
        'tournament_created',
        'tournament_joined',
        'tournament_full',
        'tournament_waiting',
        'tournament_room_published',
        'tournament_result_submitted',
        'tournament_verification_updated',
        'tournament_completed',
        'tournament_cancelled',
        // Wallet events
        'wallet_request_submitted',
        'wallet_request_approved',
        'wallet_request_rejected',
        'wallet_coins_credited',
        // Payment events
        'payment_initiated',
        'payment_approved',
        'payment_rejected',
        'payment_alarm',
        'system',
        'admin',
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    isRead: { type: Boolean, default: false },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
