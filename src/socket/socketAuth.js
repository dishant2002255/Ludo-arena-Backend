const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Socket.IO authentication middleware.
 * Expects token in socket.handshake.auth.token OR cookie.
 */
const socketAuth = async (socket, next) => {
  try {
    // Try auth object first, then parse cookies
    let token = socket.handshake.auth?.token;

    if (!token) {
      // Try extracting from cookie header
      const cookieHeader = socket.handshake.headers?.cookie || '';
      const match = cookieHeader.match(/token=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) return next(new Error('User not found'));
    if (user.isBlocked) return next(new Error('Account blocked'));

    socket.user = user;
    next();
  } catch (err) {
    logger.warn({ err: err.message }, 'Socket auth failed');
    next(new Error('Authentication failed'));
  }
};

module.exports = socketAuth;
