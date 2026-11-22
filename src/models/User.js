const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const subAdminInfoSchema = new mongoose.Schema({
  displayName:               { type: String, trim: true, default: '' },
  phone:                     { type: String, trim: true, default: '' },
  isActive:                  { type: Boolean, default: true },
  coinStock:                 { type: Number, default: 0, min: 0 },
  totalCoinsIssued:          { type: Number, default: 0 },
  totalCoinsDeducted:        { type: Number, default: 0 },
  totalCoinsSold:            { type: Number, default: 0 },
  totalWithdrawalsSettled:   { type: Number, default: 0 },
  totalCommissionEarned:     { type: Number, default: 0 },
  commissionPercentOverride: { type: Number, default: null, min: 0, max: 50 },
  upiEnabled:                { type: Boolean, default: false },
  upiId:                     { type: String, trim: true, default: '' },
  upiName:                   { type: String, trim: true, default: '' },
  upiNote:                   { type: String, trim: true, default: 'Ludo Arena Coins' },
  createdBy:                 { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [20, 'Username cannot exceed 20 characters'],
      match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    avatar: { type: String, default: '' },
    role: {
      type: String,
      // 'admin' kept for backward-compat — treated as main_admin everywhere
      enum: ['user', 'sub_admin', 'main_admin', 'admin'],
      default: 'user',
    },
    isActive:  { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },

    // ── Aggregate wallet balances (synced from UserSubWallet documents) ───
    walletBalance:    { type: Number, default: 0, min: 0 }, // = depositBalance + winningBalance
    depositBalance:   { type: Number, default: 0, min: 0 }, // Σ sub-wallet depositBalance
    winningBalance:   { type: Number, default: 0, min: 0 }, // Σ sub-wallet winningBalance
    totalCoinsEarned: { type: Number, default: 0 },
    totalCoinsSpent:  { type: Number, default: 0 },

    // ── Stats ─────────────────────────────────────────────────────────────
    totalMatches: { type: Number, default: 0 },
    totalWins:    { type: Number, default: 0 },
    totalLosses:  { type: Number, default: 0 },

    // ── Daily bonus (kept for now but API blocked) ──────────��─────────────
    lastDailyBonus: { type: Date, default: null },

    // ── Password reset ────────────────────────────────────────────────────
    resetPasswordToken:   String,
    resetPasswordExpires: Date,
    lastSeen:             { type: Date, default: Date.now },

    // ── Sub-Admin specific info (populated only when role === 'sub_admin') ─
    subAdminInfo: { type: subAdminInfoSchema, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        return ret;
      },
    },
  }
);

// ── Helpers ───────────────────────────────────────────────────────────────────
userSchema.virtual('isMainAdmin').get(function () {
  return this.role === 'main_admin' || this.role === 'admin';
});

userSchema.virtual('winRate').get(function () {
  if (this.totalMatches === 0) return 0;
  return Math.round((this.totalWins / this.totalMatches) * 100);
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.index({ walletBalance: -1 });
userSchema.index({ totalWins: -1 });
userSchema.index({ role: 1 });
userSchema.index({ 'subAdminInfo.isActive': 1 });

module.exports = mongoose.model('User', userSchema);
