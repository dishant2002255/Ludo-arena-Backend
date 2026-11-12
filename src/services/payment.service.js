/**
 * Payment Service — Manual UPI coin purchase flow.
 *
 * HOW IT WORKS (no automated payment processing):
 *  1. User initiates purchase → PaymentOrder created
 *  2. User is shown UPI payment details (admin's UPI ID)
 *  3. User pays externally via their UPI app
 *  4. Admin receives a persistent alarm notification
 *  5. Admin verifies receipt in their own bank app
 *  6. Admin approves the order → coins credited to user
 *
 * STATUS: Infrastructure ready. Payment processing NOT active until
 * upiEnabled = true in SystemSettings AND a valid UPI ID is configured.
 */

const { v4: uuidv4 } = require('uuid');
const PaymentOrder = require('../models/PaymentOrder');
const SystemSettings = require('../models/SystemSettings');
const Notification = require('../models/Notification');
const AdminLog = require('../models/AdminLog');
const User = require('../models/User');
const { adjustWallet } = require('./wallet.service');
const {
  emitNotification,
  emitWalletUpdate,
  emitPaymentAlarm,
  dismissPaymentAlarm,
  emitPaymentStatusUpdate,
} = require('../socket/socketInstance');
const logger = require('../utils/logger');

// ─── Helper ───────────────────────────────────────────────────────────────────

const generateOrderReference = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = uuidv4().split('-')[0].toUpperCase();
  return `LA-${ts}-${rand}`;
};

const logAdminAction = async (adminId, action, targetId, details, ip = '') => {
  try {
    await AdminLog.create({
      admin: adminId,
      action,
      targetType: 'wallet',
      targetId,
      details,
      ipAddress: ip,
    });
  } catch {}
};

// ─── Get Settings ─────────────────────────────────────────────────────────────

const getPaymentSettings = async () => {
  return SystemSettings.getSettings();
};

// ─── Initiate Purchase ────────────────────────────────────────────────────────

/**
 * User initiates a coin purchase request.
 * Returns the order and UPI payment details.
 * Does NOT process any real payment.
 */
const initiatePayment = async (userId, coinsRequested, upiPlatform = 'other') => {
  const settings = await getPaymentSettings();

  // Guard: payment must be enabled by admin
  if (!settings.upiEnabled) {
    throw new Error('PAYMENT_NOT_ACTIVE');
  }

  if (!settings.upiId) {
    throw new Error('UPI not configured. Contact admin.');
  }

  if (coinsRequested < settings.minimumPurchaseCoins) {
    throw new Error(`Minimum purchase is ${settings.minimumPurchaseCoins} coins (₹${settings.minimumPurchaseCoins})`);
  }

  if (coinsRequested > settings.maximumPurchaseCoins) {
    throw new Error(`Maximum purchase is ${settings.maximumPurchaseCoins} coins`);
  }

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.isBlocked) throw new Error('Account blocked');

  // Check if user already has a pending order
  const existingPending = await PaymentOrder.findOne({ user: userId, status: { $in: ['pending', 'admin_notified'] } });
  if (existingPending) {
    throw new Error('You already have a pending payment. Please wait for admin verification or the order to expire.');
  }

  const amountRupees = coinsRequested * settings.coinPriceRupees;
  const orderReference = generateOrderReference();
  const expiresAt = new Date(Date.now() + settings.orderExpiryMinutes * 60 * 1000);

  const order = await PaymentOrder.create({
    user: userId,
    coinsRequested,
    amountRupees,
    orderReference,
    upiPlatform,
    status: 'pending',
    adminAlarmActive: true,
    expiresAt,
  });

  // Build UPI deep link (standard UPI URL scheme)
  const upiUrl = buildUpiUrl(settings, amountRupees, orderReference);

  logger.info({ userId, orderReference, coinsRequested, amountRupees }, 'Payment initiated');

  return { order, upiUrl, settings };
};

/**
 * Called when user confirms they have opened their UPI app.
 * Triggers the persistent admin alarm.
 */
const notifyAdminOfPayment = async (orderId, userId) => {
  const order = await PaymentOrder.findOne({ _id: orderId, user: userId })
    .populate('user', 'username email');

  if (!order) throw new Error('Order not found');
  if (!['pending', 'admin_notified'].includes(order.status)) {
    throw new Error('Order is not in a valid state');
  }

  order.status = 'admin_notified';
  await order.save();

  // Create persistent admin notification
  await Notification.create({
    recipient: null, // broadcast to all admins via admin:room socket
    type: 'payment_alarm',
    title: '💰 Payment Verification Required',
    message: `${order.user.username} has initiated a UPI payment of ₹${order.amountRupees} for ${order.coinsRequested} coins. Order: ${order.orderReference}`,
    sentBy: order.user._id,
    data: {
      orderId: order._id,
      orderReference: order.orderReference,
      amountRupees: order.amountRupees,
      coinsRequested: order.coinsRequested,
      upiPlatform: order.upiPlatform,
    },
  });

  // Fire persistent alarm to admin:room — keeps playing until dismissed
  emitPaymentAlarm(order);

  logger.info({ orderId, orderReference: order.orderReference }, 'Admin payment alarm fired');
  return order;
};

// ─── Admin Actions ────────────────────────────────────────────────────────────

/**
 * Admin approves payment → coins credited to user wallet.
 */
const approvePayment = async (orderId, adminId, adminRemarks = '', ip = '') => {
  const order = await PaymentOrder.findById(orderId).populate('user', 'username email');
  if (!order) throw new Error('Order not found');
  if (order.status === 'approved') throw new Error('Already approved');
  if (order.status === 'rejected') throw new Error('Order was rejected');
  if (order.status === 'expired') throw new Error('Order has expired');

  // Credit coins
  const tx = await adjustWallet(
    order.user._id,
    order.coinsRequested,
    'coin_purchase',
    `UPI coin purchase — ₹${order.amountRupees} — ${order.orderReference}`,
    {
      adjustedBy: adminId,
      idempotencyKey: `coin_purchase_${orderId}`,
      paymentOrderId: order._id,
    }
  );

  // Update order
  order.status = 'approved';
  order.adminRemarks = adminRemarks;
  order.reviewedBy = adminId;
  order.reviewedAt = new Date();
  order.walletTransaction = tx._id;
  order.adminAlarmActive = false;
  order.adminAlarmDismissedAt = new Date();
  await order.save();

  await logAdminAction(adminId, 'approve_payment', order._id, {
    orderReference: order.orderReference,
    amountRupees: order.amountRupees,
    coinsRequested: order.coinsRequested,
    adminRemarks,
  }, ip);

  // Dismiss alarm on all admin sockets
  dismissPaymentAlarm(orderId);

  // Notify user — real-time wallet update
  const updatedUser = await User.findById(order.user._id).select('walletBalance');
  emitWalletUpdate(order.user._id.toString(), {
    newBalance: updatedUser.walletBalance,
    amount: order.coinsRequested,
  });

  // Notify user with toast + redirect trigger
  const userNotif = await Notification.create({
    recipient: order.user._id,
    type: 'payment_approved',
    title: '✅ Payment Verified!',
    message: `Your payment of ₹${order.amountRupees} has been verified. ${order.coinsRequested} coins have been added to your wallet!`,
    sentBy: adminId,
    data: { orderId: order._id, coinsAdded: order.coinsRequested },
  });
  emitNotification(order.user._id.toString(), userNotif);

  // Tell user's checkout page to redirect to wallet
  emitPaymentStatusUpdate(order.user._id.toString(), {
    orderId: order._id.toString(),
    status: 'approved',
    coinsAdded: order.coinsRequested,
    newBalance: updatedUser.walletBalance,
    redirectTo: '/wallet',
  });

  logger.info({ orderId, coinsRequested: order.coinsRequested }, 'Payment approved');
  return { order, transaction: tx };
};

/**
 * Admin rejects payment.
 */
const rejectPayment = async (orderId, adminId, adminRemarks = '', ip = '') => {
  const order = await PaymentOrder.findById(orderId).populate('user', 'username email');
  if (!order) throw new Error('Order not found');
  if (order.status === 'approved') throw new Error('Cannot reject an approved order');
  if (order.status === 'rejected') throw new Error('Already rejected');

  order.status = 'rejected';
  order.adminRemarks = adminRemarks;
  order.reviewedBy = adminId;
  order.reviewedAt = new Date();
  order.adminAlarmActive = false;
  order.adminAlarmDismissedAt = new Date();
  await order.save();

  await logAdminAction(adminId, 'reject_payment', order._id, {
    orderReference: order.orderReference,
    adminRemarks,
  }, ip);

  dismissPaymentAlarm(orderId);

  const userNotif = await Notification.create({
    recipient: order.user._id,
    type: 'payment_rejected',
    title: '❌ Payment Not Verified',
    message: `Your payment request for ${order.coinsRequested} coins could not be verified.${adminRemarks ? ` Reason: ${adminRemarks}` : ''} Please contact support.`,
    sentBy: adminId,
    data: { orderId: order._id },
  });
  emitNotification(order.user._id.toString(), userNotif);

  emitPaymentStatusUpdate(order.user._id.toString(), {
    orderId: order._id.toString(),
    status: 'rejected',
    adminRemarks,
  });

  logger.info({ orderId }, 'Payment rejected');
  return order;
};

/**
 * Admin dismisses alarm without acting (order stays admin_notified).
 */
const dismissAlarm = async (orderId, adminId) => {
  const order = await PaymentOrder.findById(orderId);
  if (!order) throw new Error('Order not found');

  order.adminAlarmActive = false;
  order.adminAlarmDismissedAt = new Date();
  await order.save();

  dismissPaymentAlarm(orderId);
  return order;
};

// ─── Queries ──────────────────────────────────────────────────────────────────

const getPendingOrders = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    PaymentOrder.find({ status: { $in: ['pending', 'admin_notified'] } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'username email walletBalance')
      .lean(),
    PaymentOrder.countDocuments({ status: { $in: ['pending', 'admin_notified'] } }),
  ]);
  return { orders, total, page, pages: Math.ceil(total / limit) };
};

const getAllOrders = async (page = 1, limit = 20, status = '') => {
  const skip = (page - 1) * limit;
  const query = status ? { status } : {};
  const [orders, total] = await Promise.all([
    PaymentOrder.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'username email walletBalance')
      .populate('reviewedBy', 'username')
      .lean(),
    PaymentOrder.countDocuments(query),
  ]);
  return { orders, total, page, pages: Math.ceil(total / limit) };
};

const getUserOrders = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    PaymentOrder.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PaymentOrder.countDocuments({ user: userId }),
  ]);
  return { orders, total, page, pages: Math.ceil(total / limit) };
};

const getOrderById = async (orderId, userId = null) => {
  const query = userId ? { _id: orderId, user: userId } : { _id: orderId };
  return PaymentOrder.findOne(query)
    .populate('user', 'username email walletBalance')
    .populate('reviewedBy', 'username')
    .lean();
};

// ─── UPI URL Builder ──────────────────────────────────────────────────────────

/**
 * Builds a standard UPI intent URL.
 * This is the URL used to open UPI apps like GPay, PhonePe, Paytm.
 *
 * FORMAT: upi://pay?pa=UPI_ID&pn=NAME&am=AMOUNT&cu=INR&tn=NOTE&tr=REF
 */
const buildUpiUrl = (settings, amountRupees, orderReference) => {
  const params = new URLSearchParams({
    pa: settings.upiId,
    pn: settings.upiName || 'Ludo Arena',
    am: amountRupees.toFixed(2),
    cu: 'INR',
    tn: `${settings.upiNote || 'Ludo Arena Coins'} - ${orderReference}`,
    tr: orderReference,
  });
  return `upi://pay?${params.toString()}`;
};

/**
 * Returns deep-link URLs for specific UPI apps.
 * These open the respective app directly on mobile.
 */
const getAppDeepLinks = (upiUrl) => ({
  gpay:    `tez://upi/pay?${upiUrl.split('?')[1]}`,
  phonepe: `phonepe://${upiUrl}`,
  paytm:   `paytmmp://${upiUrl}`,
  bhim:    `upi://pay?${upiUrl.split('?')[1]}`,
  generic: upiUrl,
});

module.exports = {
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
  buildUpiUrl,
  getAppDeepLinks,
};
