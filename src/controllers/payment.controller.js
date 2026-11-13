/**
 * Payment Controller — user and admin handlers for coin purchase flow.
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
  getAppDeepLinks,
} = require('../services/payment.service');
const SystemSettings = require('../models/SystemSettings');
const { success, error, paginated } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// ─── User handlers ────────────────────────────────────────────────────────────

/**
 * GET /api/payment/settings
 * Returns public payment settings (upiEnabled, minimum, pricing).
 * Never exposes UPI ID to unauthorized users.
 */
const getPublicSettings = async (req, res) => {
  try {
    const settings = await getPaymentSettings();
    return success(res, {
      upiEnabled: settings.upiEnabled,
      coinPriceRupees: settings.coinPriceRupees,
      minimumPurchaseCoins: settings.minimumPurchaseCoins,
      maximumPurchaseCoins: settings.maximumPurchaseCoins,
      upiApps: settings.upiApps,
      orderExpiryMinutes: settings.orderExpiryMinutes,
      upiConfigured: !!(settings.upiId),
      // Show UPI name but NOT the UPI ID (security)
      upiName: settings.upiName || '',
    });
  } catch (err) {
    return error(res, 'Failed to fetch payment settings', 500);
  }
};

/**
 * POST /api/payment/initiate
 * User initiates a coin purchase. Returns order + UPI URL.
 */
const initiate = async (req, res) => {
  try {
    const { coinsRequested, upiPlatform } = req.body;

    if (!coinsRequested || isNaN(coinsRequested)) {
      return error(res, 'coinsRequested is required', 400);
    }

    const result = await initiatePayment(req.user._id, parseInt(coinsRequested), upiPlatform || 'other');

    return success(res, {
      order: {
        _id: result.order._id,
        orderReference: result.order.orderReference,
        coinsRequested: result.order.coinsRequested,
        amountRupees: result.order.amountRupees,
        status: result.order.status,
        expiresAt: result.order.expiresAt,
      },
      upiUrl: result.upiUrl,
      qrCodeDataUrl: result.qrCodeDataUrl,   // base64 PNG for QR display
      upiId: result.settings.upiId,
      upiName: result.settings.upiName,
      instructions: `Scan the QR code or pay ₹${result.order.amountRupees} to UPI ID: ${result.settings.upiId}. Use reference: ${result.order.orderReference}`,
    }, 'Payment initiated. Scan the QR code or use the UPI ID to complete payment.');
  } catch (err) {
    if (err.message === 'PAYMENT_NOT_ACTIVE') {
      return error(res, 'Coin purchases are not currently available. Please use the free coin request feature.', 503);
    }
    return error(res, err.message || 'Failed to initiate payment', 400);
  }
};

/**
 * POST /api/payment/notify/:orderId
 * User confirms they have opened UPI app → triggers admin alarm.
 */
const notifyAdmin = async (req, res) => {
  try {
    const order = await notifyAdminOfPayment(req.params.orderId, req.user._id);
    return success(res, {
      orderId: order._id,
      status: order.status,
      message: 'Admin has been notified. Please wait for verification.',
    });
  } catch (err) {
    return error(res, err.message || 'Failed to notify admin', 400);
  }
};

/**
 * POST /api/payment/screenshot/:orderId
 * User uploads their payment screenshot as proof.
 * This is called with "I Have Paid" — before admin verification.
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

    return success(res, {
      screenshotUrl: order.screenshotUrl,
    }, 'Screenshot uploaded successfully');
  } catch (err) {
    return error(res, err.message || 'Upload failed', 500);
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
 * User fetches a specific order status (for checkout page polling).
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

// ─── Admin handlers ───────────────────────────────────────────────────────────

/**
 * GET /api/payment/admin/pending
 * Admin fetches all pending payment orders (with alarm active).
 */
const adminGetPending = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const result = await getPendingOrders(page, 20);
    return paginated(res, result.orders, { page: result.page, total: result.total, pages: result.pages, limit: 20 });
  } catch (err) {
    return error(res, 'Failed to fetch pending orders', 500);
  }
};

/**
 * GET /api/payment/admin/all
 * Admin fetches all orders (with optional status filter).
 */
const adminGetAll = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const result = await getAllOrders(page, 20, req.query.status || '');
    return paginated(res, result.orders, { page: result.page, total: result.total, pages: result.pages, limit: 20 });
  } catch (err) {
    return error(res, 'Failed to fetch orders', 500);
  }
};

/**
 * PATCH /api/payment/admin/:orderId/approve
 * Admin approves payment → coins credited.
 */
const adminApprove = async (req, res) => {
  try {
    const { adminRemarks } = req.body;
    const result = await approvePayment(req.params.orderId, req.user._id, adminRemarks || '', req.ip);
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
 * Admin rejects payment.
 */
const adminReject = async (req, res) => {
  try {
    const { adminRemarks } = req.body;
    const order = await rejectPayment(req.params.orderId, req.user._id, adminRemarks || '', req.ip);
    return success(res, { order }, 'Payment rejected');
  } catch (err) {
    return error(res, err.message || 'Failed to reject', 400);
  }
};

/**
 * PATCH /api/payment/admin/:orderId/dismiss-alarm
 * Admin dismisses alarm without acting on the order.
 */
const adminDismissAlarm = async (req, res) => {
  try {
    const order = await dismissAlarm(req.params.orderId, req.user._id);
    return success(res, { order }, 'Alarm dismissed');
  } catch (err) {
    return error(res, err.message || 'Failed to dismiss', 400);
  }
};

/**
 * GET /api/payment/admin/settings
 * Admin fetches full payment settings including UPI ID.
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
 * Admin updates payment settings (UPI ID, enable/disable, etc.)
 */
const adminUpdateSettings = async (req, res) => {
  try {
    const allowed = [
      'upiEnabled', 'upiId', 'upiName', 'upiNote',
      'upiApps', 'coinPriceRupees', 'minimumPurchaseCoins',
      'maximumPurchaseCoins', 'orderExpiryMinutes', 'adminAlarmEnabled',
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

    // Log admin action
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
