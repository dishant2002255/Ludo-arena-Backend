const User = require('../models/User');
const { generateToken, setCookieToken, clearCookieToken } = require('../utils/jwt');
const { grantRegistrationBonus } = require('../services/wallet.service');
const { success, error } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const crypto = require('crypto');

const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? 'email' : 'username';
      return error(res, `${field.charAt(0).toUpperCase() + field.slice(1)} already in use`, 409);
    }

    const user = await User.create({ username, email, password });

    // Grant registration bonus
    try {
      await grantRegistrationBonus(user._id);
      // Refresh balance
      const updated = await User.findById(user._id);
      user.walletBalance = updated.walletBalance;
    } catch (bonusErr) {
      logger.warn({ err: bonusErr }, 'Failed to grant registration bonus');
    }

    const token = generateToken({ id: user._id, role: user.role });
    setCookieToken(res, token);

    logger.info({ userId: user._id, username }, 'User registered');
    return success(
      res,
      {
        token,   // also returned in body for cross-origin Bearer fallback
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          walletBalance: user.walletBalance,
          avatar: user.avatar,
        },
      },
      'Registration successful',
      201
    );
  } catch (err) {
    logger.error({ err }, 'Register error');
    return error(res, err.message || 'Registration failed', 500);
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return error(res, 'Invalid email or password', 401);
    }

    if (user.isBlocked) {
      return error(res, 'Your account has been blocked. Contact support.', 403);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return error(res, 'Invalid email or password', 401);
    }

    // Update last seen
    await User.findByIdAndUpdate(user._id, { lastSeen: new Date() });

    const token = generateToken({ id: user._id, role: user.role });
    setCookieToken(res, token);

    logger.info({ userId: user._id }, 'User logged in');
    return success(res, {
      token,   // also returned in body for cross-origin Bearer fallback
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        walletBalance: user.walletBalance,
        avatar: user.avatar,
      },
    }, 'Login successful');
  } catch (err) {
    logger.error({ err }, 'Login error');
    return error(res, 'Login failed', 500);
  }
};

const logout = (req, res) => {
  clearCookieToken(res);
  return success(res, {}, 'Logged out successfully');
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    return success(res, { user });
  } catch (err) {
    return error(res, 'Failed to fetch user', 500);
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always respond with success to avoid email enumeration
    if (!user) {
      return success(res, {}, 'If an account exists, a reset link has been sent');
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // In production, send email here
    logger.info({ email, token }, 'Password reset token generated (email not configured in dev)');

    return success(res, { resetToken: token }, 'Password reset token generated');
  } catch (err) {
    return error(res, 'Failed to process request', 500);
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return error(res, 'Invalid or expired reset token', 400);
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    clearCookieToken(res);
    return success(res, {}, 'Password reset successful. Please login.');
  } catch (err) {
    return error(res, 'Failed to reset password', 500);
  }
};

module.exports = { register, login, logout, getMe, forgotPassword, resetPassword };
