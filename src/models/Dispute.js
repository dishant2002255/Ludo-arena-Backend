const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema(
  {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['open', 'under_review', 'resolved', 'dismissed'],
      default: 'open',
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolution: { type: String, trim: true },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

disputeSchema.index({ status: 1 });
disputeSchema.index({ reportedBy: 1 });

module.exports = mongoose.model('Dispute', disputeSchema);
