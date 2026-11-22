const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const { error } = require('../utils/apiResponse');

const extractToken = (req) => {
  if (req.cookies?.token) return req.cookies.token;
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
};

const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) return error(res, 'Authentication required', 401);

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return error(res, 'User not found', 401);
    if (user.isBlocked) return error(res, 'Your account has been blocked. Contact support.', 403);

    // Block suspended sub_admins from all API access
    if (user.role === 'sub_admin' && user.subAdminInfo?.isActive === false) {
      return error(res, 'Your Sub-Admin account has been suspended by Main Admin.', 403);
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') return error(res, 'Invalid token', 401);
    if (err.name === 'TokenExpiredError') return error(res, 'Token expired, please login again', 401);
    return error(res, 'Authentication failed', 401);
  }
};

/** Existing admin guard — treats 'admin' and 'main_admin' identically */
const requireAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'main_admin'].includes(req.user.role)) {
    return error(res, 'Admin access required', 403);
  }
  next();
};

/** Super-Admin only (main_admin OR legacy admin role) */
const requireMainAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'main_admin'].includes(req.user.role)) {
    return error(res, 'Main Admin access required', 403);
  }
  next();
};

/** Sub-Admin OR Main Admin */
const requireSubAdminOrMain = (req, res, next) => {
  if (!req.user) return error(res, 'Authentication required', 401);
  const isMain = ['admin', 'main_admin'].includes(req.user.role);
  const isSub  = req.user.role === 'sub_admin' && req.user.subAdminInfo?.isActive === true;
  if (!isMain && !isSub) return error(res, 'Sub-Admin or Main Admin access required', 403);
  next();
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (token) {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.id).select('-password');
      if (user && !user.isBlocked) req.user = user;
    }
    next();
  } catch { next(); }
};

module.exports = { authenticate, requireAdmin, requireMainAdmin, requireSubAdminOrMain, optionalAuth };
