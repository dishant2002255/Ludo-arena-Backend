const mongoose = require('mongoose');

/**
 * Tournament — Admin-managed external Ludo tournament.
 * The actual game is played outside the platform (e.g. Ludo King).
 * This model tracks registration, room credentials, submissions and results.
 */

// Submission from a single participant
const submissionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  screenshotUrl: { type: String, required: true },     // saved file path / URL
  screenshotOriginalName: { type: String },
  claimedResult: {
    type: String,
    enum: ['winner', 'lost'],
    required: true,
  },
  remarks: { type: String, trim: true, maxlength: 500, default: '' },
  submittedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['submitted', 'verification_pending', 'approved', 'rejected', 'resubmission_required'],
    default: 'submitted',
  },
  adminRemarks: { type: String, trim: true, maxlength: 500, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
});

// Participant slot
const participantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  joinedAt: { type: Date, default: Date.now },
});

const tournamentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Tournament title is required'],
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },
    bannerUrl: {
      type: String,
      default: '',  // uploaded file path or URL
    },
    rules: {
      type: String,
      trim: true,
      maxlength: [5000, 'Rules cannot exceed 5000 characters'],
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Registration ──────────────────────────────────────────────────
    requiredPlayers: {
      type: Number,
      default: 4,
      min: 4,
      max: 4,
    },
    participants: [participantSchema],
    registrationOpen: { type: Boolean, default: false }, // admin toggles this

    // ── Status lifecycle ──────────────────────────────────────────────
    // draft → open → full → waiting_for_admin → room_published → result_pending → completed | cancelled
    status: {
      type: String,
      enum: [
        'draft',
        'open',
        'full',
        'waiting_for_admin',
        'room_published',
        'result_pending',
        'completed',
        'cancelled',
      ],
      default: 'draft',
      index: true,
    },

    // ── External Room Credentials (published by admin) ────────────────
    externalPlatform: {
      type: String,
      trim: true,
      default: 'Ludo King',
    },
    externalRoomId: {
      type: String,
      trim: true,
      default: '',
    },
    externalRoomPassword: {
      type: String,
      trim: true,
      default: '',
    },
    roomInstructions: {
      type: String,
      trim: true,
      maxlength: [1000, 'Instructions cannot exceed 1000 characters'],
      default: '',
    },
    roomNotes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
      default: '',
    },
    roomPublishedAt: { type: Date, default: null },
    roomPublishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Result Submissions ────────────────────────────────────────────
    submissions: [submissionSchema],

    // ── Final Result (set by admin after verification) ────────────────
    verifiedWinner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    finalResults: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        rank: Number,
        result: { type: String, enum: ['winner', 'lost'] },
      },
    ],
    verificationRemarks: {
      type: String,
      trim: true,
      maxlength: [1000, 'Remarks cannot exceed 1000 characters'],
      default: '',
    },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, default: '' },

    // ── Virtual coin reward for winner ───────────────────────────────
    winnerReward: {
      type: Number,
      default: 0,
      min: [0, 'Reward cannot be negative'],
    },
    rewardDistributed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes
tournamentSchema.index({ status: 1 });
tournamentSchema.index({ createdBy: 1 });
tournamentSchema.index({ 'participants.user': 1 });
tournamentSchema.index({ createdAt: -1 });

// Virtual: available slots
tournamentSchema.virtual('availableSlots').get(function () {
  return this.requiredPlayers - this.participants.length;
});

// Virtual: isFull
tournamentSchema.virtual('isFull').get(function () {
  return this.participants.length >= this.requiredPlayers;
});

module.exports = mongoose.model('Tournament', tournamentSchema);
