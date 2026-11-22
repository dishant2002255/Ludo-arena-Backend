/**
 * Payment Controller — user and (sub-)admin handlers for the Sub-Admin scoped
 * UPI coin purchase flow (1 Coin = ₹1).
 */
const {
  initiatePayment,
  notifyAdminOfPayment,
  approvePayment,
  rejectPayment,
  dismissAlarm,
  getPendingOrders,
  getAllOrders,
  getUserOrders,
  getOrderById,
  getPaymentSettings,
} = require('../services/payment.service');
const PaymentOrder = require('../models/PaymentOrder');
const { success, error, paginated } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const isMainAdmin = (u) => ['admin', 'main_admin'].includes(u?.role);

/** Scope filter: sub-admins only see their own orders */
const scopeFor = (user) =>
  isMainAdmin(user) ? {} : { subAdmin: user._id };

// ─── User handlers ────────────────────────────────────────────────────────────

/**
 * POST /api/payment/initiate
 * User initiates a coin purchase from a specific Sub-Admin.
 */
const initiate = async (req, res) => {
  try {
    const { subAdminId, coinsRequested, upiPlatform } = req.body;
    if (!subAdminId) return error(res, 'subAdminId is required', 400);
    if (!coinsRequested || isNaN(coinsRequested)) {
      return error(res, 'coinsRequested is required', 400);
    }
    const result = await initiatePayment(
      req.user._id,
      subAdminId,
      parseInt(coinsRequested),
      upiPlatform || 'other'
    );
    const sa = result.subAdmin.subAdminInfo;
    return success(res, {
      order: {
        _id: result.order._id,
        orderReference: result.order.orderReference,
        subAdminId,
        subAdminName: sa.displayName,
        coinsRequested: result.order.coinsRequested,
        amountRupees: result.order.amountRupees,
        status: result.order.status,
        expiresAt: result.order.expiresAt,
      },
      upiUrl: result.upiUrl,
      qrCodeDataUrl: result.qrCodeDataUrl,
      upiId: sa.upiId,
      upiName: sa.upiName || sa.displayName,
      instructions: `Pay ₹${result.order.amountRupees} to UPI ID: ${sa.upiId} (${sa.displayName}). Use reference: ${result.order.orderReference}. After paying, tap "I Have Paid".`,
    }, 'Payment initiated. Pay the Sub-Admin via UPI to complete your purchase.');
  } catch (err) {
    return error(res, err.message || 'Failed to initiate payment', 400);
  }
};

/**
 * POST /api/payment/notify/:orderId
 * User confirms they have paid → triggers Sub-Admin + Main Admin alarm.
 */
const notifyAdmin = async (req, res) => {
  try {
    const order = await notifyAdminOfPayment(req.params.orderId, req.user._id);
    return success(res, {
      orderId: order._id,
      status: order.status,
      message: 'Sub-Admin has been notified. Please wait for verification.',
    });
  } catch (err) {
    return error(res, err.message || 'Failed to notify admin', 400);
  }
};

/**
 * POST /api/payment/screenshot/:orderId
 * User uploads their payment screenshot as proof.
 */
const uploadScreenshotHandler = async (req, res) => {
  try {
    if (!req.file) return error(res, 'Screenshot is required', 400);
    const order = await PaymentOrder.findOne({ _id: req.params.orderId, user: req.user._id });
    if (!order) return error(res, 'Order not found', 404);
    if (!['pending', 'admin_notified'].includes(order.status)) {
      return error(res, 'Order cannot be updated at this stage', 400);
    }
    order.screenshotUrl = `/uploads/screenshots/${req.file.filename}`;
    order.screenshotOriginalName = req.file.originalname;
    order.screenshotSubmittedAt = new Date();
    await order.save();
    return success(res, { screenshotUrl: order.screenshotUrl }, 'Screenshot uploaded successfully');
  } catch (err) {
    logger.error({ err }, 'Screenshot upload error');
    return error(res, err.message || 'Upload failed', 500);
  }
};

/**
 * GET /api/payment/settings
 * Public purchase pricing (Sub-Admin UPI details come from /api/wallet/sub-admins).
 */
const getPublicSettings = async (req, res) => {
  try {
    const settings = await getPaymentSettings();
    return success(res, {
      coinPriceRupees: settings.coinPriceRupees,
      minimumPurchaseCoins: settings.minimumPurchaseCoins,
      maximumPurchaseCoins: settings.maximumPurchaseCoins,
      orderExpiryMinutes: settings.orderExpiryMinutes,
    });
  } catch (err) {
    return error(res, 'Failed to fetch payment settings', 500);
  }
};

const getMyOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const result = await getUserOrders(req.user._id, page, limit);
    return paginated(res, result.orders, { page: result.page, total: result.total, pages: result.pages, limit });
  } catch (err) {
    return error(res, 'Failed to fetch orders', 500);
  }
};

/**
 * GET /api/payment/order/:orderId
 */
const getOrderStatus = async (req, res) => {
  try {
    const order = await getOrderById(req.params.orderId, req.user._id);
    if (!order) return error(res, 'Order not found', 404);
    return success(res, { order });
  } catch (err) {
    return error(res, 'Failed to fetch order', 500);
  }
};

// ─── Admin / Sub-Admin handlers ────────────────────────────────────────────────

/**
 * GET /api/payment/admin/pending
 */
const adminGetPending = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const result = await getPendingOrders(scopeFor(req.user), page, 20);
    return paginated(res, result.orders, { page: result.page, total: result.total, pages: result.pages, limit: 20 });
  } catch (err) {
    return error(res, 'Failed to fetch pending orders', 500);
  }
};

/**
 * GET /api/payment/admin/all
 */
const adminGetAll = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const result = await getAllOrders(scopeFor(req.user), page, 20, req.query.status || '');
    return paginated(res, result.orders, { page: result.page, total: result.total, pages: result.pages, limit: 20 });
  } catch (err) {
    return error(res, 'Failed to fetch orders', 500);
  }
};

/**
 * PATCH /api/payment/admin/:orderId/approve
 */
const adminApprove = async (req, res) => {
  try {
    const { adminRemarks } = req.body;
    const result = await approvePayment(req.params.orderId, req.user, adminRemarks || '', req.ip);
    return success(res, {
      order: result.order,
      transaction: result.transaction,
    }, `Approved: ${result.order.coinsRequested} coins credited`);
  } catch (err) {
    return error(res, err.message || 'Failed to approve', 400);
  }
};

/**
 * PATCH /api/payment/admin/:orderId/reject
 */
const adminReject = async (req, res) => {
  try {
    const { adminRemarks } = req.body;
    const order = await rejectPayment(req.params.orderId, req.user, adminRemarks || '', req.ip);
    return success(res, { order }, 'Payment rejected');
  } catch (err) {
    return error(res, err.message || 'Failed to reject', 400);
  }
};

/**
 * PATCH /api/payment/admin/:orderId/dismiss-alarm
 */
const adminDismissAlarm = async (req, res) => {
  try {
    const order = await dismissAlarm(req.params.orderId, req.user);
    return success(res, { order }, 'Alarm dismissed');
  } catch (err) {
    return error(res, err.message || 'Failed to dismiss', 400);
  }
};

/**
 * GET /api/payment/admin/settings
 * Full payment settings (Main Admin only).
 */
const adminGetSettings = async (req, res) => {
  try {
    const settings = await getPaymentSettings();
    return success(res, { settings });
  } catch (err) {
    return error(res, 'Failed to fetch settings', 500);
  }
};

/**
 * PATCH /api/payment/admin/settings
 * Main Admin updates global payment settings (min/max purchase, expiry…).
 * UPI IDs now live on Sub-Admin profiles, not here.
 */
const adminUpdateSettings = async (req, res) => {
  try {
    const SystemSettings = require('../models/SystemSettings');
    const allowed = [
      'coinPriceRupees', 'minimumPurchaseCoins',
      'maximumPurchaseCoins', 'orderExpiryMinutes', 'adminAlarmEnabled', 'upiApps',
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updatedBy = req.user._id;
    const settings = await SystemSettings.findOneAndUpdate(
      { key: 'global' },
      { $set: updates },
      { new: true, upsert: true }
    );
    const AdminLog = require('../models/AdminLog');
    await AdminLog.create({
      admin: req.user._id,
      action: 'update_payment_settings',
      targetType: 'system',
      details: updates,
      ipAddress: req.ip,
    });
    return success(res, { settings }, 'Payment settings updated');
  } catch (err) {
    return error(res, err.message || 'Failed to update settings', 500);
  }
};

module.exports = {
  getPublicSettings,
  initiate,
  notifyAdmin,
  uploadScreenshotHandler,
  getMyOrders,
  getOrderStatus,
  adminGetPending,
  adminGetAll,
  adminApprove,
  adminReject,
  adminDismissAlarm,
  adminGetSettings,
  adminUpdateSettings,
};
