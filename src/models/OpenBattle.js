const mongoose = require('mongoose');

/**
 * OpenBattle — User-created Ludo King challenge rooms.
 *
 * SECURITY INVARIANTS:
 * - roomId and roomPassword NEVER appear in public lobby responses
 * - Only participants (once full) + Sub-Admin + Main Admin can see credentials
 * - Scoped to a single Sub-Admin: users can only see/join battles under their selected Sub-Admin
 */

const submissionSchema = new mongoose.Schema({
  claim:              { type: String, enum: ['none', 'won', 'lost', 'cancel'], default: 'none' },
  screenshotUrl:      { type: String, default: '' },
  cancelReason:       { type: String, default: '' },
  remarks:            { type: String, default: '' },
  submittedAt:        { type: Date, default: null },
  verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
}, { _id: false });

const participantSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  joinedAt:    { type: Date, default: Date.now },
  entryTxId:   { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
  fromDeposit: { type: Number, default: 0 }, // how much of entry came from depositBalance
  fromWinning: { type: Number, default: 0 }, // how much came from winningBalance
  submission:  { type: submissionSchema, default: () => ({}) },
}, { _id: false });

const openBattleSchema = new mongoose.Schema(
  {
    battleCode: { type: String, required: true, unique: true }, // LB-XXXXXX

    subAdmin:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    creator:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    gameMode: {
      type: String,
      enum: ['classic', 'quick', 'one_kill', 'popular'],
      required: true,
    },
    maxPlayers:  { type: Number, enum: [2, 4], required: true },
    entryCoins:  { type: Number, required: true, min: 1 },
    totalPot:    { type: Number, required: true },

    commissionPercent: { type: Number, required: true },
    commissionCoins:   { type: Number, required: true },
    winningPrize:      { type: Number, required: true },

    // ── Room credentials — NEVER expose in lobby/list responses ───────────
    roomId:       { type: String, trim: true, required: true },
    roomPassword: { type: String, trim: true, default: '' },
    roomUpdatedAt:{ type: Date, default: null },

    status: {
      type: String,
      enum: ['open', 'in_progress', 'result_pending', 'disputed', 'completed', 'cancelled'],
      default: 'open',
      index: true,
    },

    participants: { type: [participantSchema], default: [] },

    winner:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rewardDistributed: { type: Boolean, default: false },
    refundDistributed: { type: Boolean, default: false },

    verifiedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedByRole: { type: String, default: '' },
    adminRemarks:   { type: String, default: '' },

    startedAt:    { type: Date, default: null },
    completedAt:  { type: Date, default: null },
    cancelledAt:  { type: Date, default: null },
    cancelReason: { type: String, default: '' },
  },
  { timestamps: true }
);

openBattleSchema.index({ subAdmin: 1, status: 1 });
openBattleSchema.index({ 'participants.user': 1, status: 1 });
// creator + battleCode already indexed via field definitions

module.exports = mongoose.model('OpenBattle', openBattleSchema);
