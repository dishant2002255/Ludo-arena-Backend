/**
 * Payment Service — Sub-Admin scoped UPI coin purchase flow.
 *
 * HOW IT WORKS (no automated payment processing):
 *  1. User picks a Sub-Admin and initiates purchase → PaymentOrder created
 *  2. User is shown the SUB-ADMIN's UPI details and pays directly to them
 *  3. User pays externally via their UPI app (screenshot proof optional)
 *  4. Sub-Admin (or Main Admin) receives a persistent alarm notification
 *  5. Admin verifies receipt in their own bank app
 *  6. Approval deducts Sub-Admin coinStock and credits the user's
 *     UserSubWallet via subAdmin.service.approveCoinPurchase
 *
 * INVARIANT: 1 Coin = ₹1. No free coins anywhere.
 */
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const PaymentOrder = require('../models/PaymentOrder');
const SystemSettings = require('../models/SystemSettings');
const Notification = require('../models/Notification');
const AdminLog = require('../models/AdminLog');
const User = require('../models/User');
const subAdminService = require('./subAdmin.service');
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

const isMainAdmin = (u) => ['admin', 'main_admin'].includes(u?.role);

// ─── Get Settings ─────────────────────────────────────────────────────────────

const getPaymentSettings = async () => SystemSettings.getSettings();

// ─── Initiate Purchase (Sub-Admin scoped) ─────────────────────────────────────

/**
 * User initiates a coin purchase from a specific Sub-Admin.
 * Returns the order and the SUB-ADMIN's UPI payment details.
 */
const initiatePayment = async (userId, subAdminId, coinsRequested, upiPlatform = 'other') => {
  const settings = await getPaymentSettings();

  if (coinsRequested < settings.minimumPurchaseCoins) {
    throw new Error(`Minimum purchase is ${settings.minimumPurchaseCoins} coins (₹${settings.minimumPurchaseCoins})`);
  }
  if (coinsRequested > settings.maximumPurchaseCoins) {
    throw new Error(`Maximum purchase is ${settings.maximumPurchaseCoins} coins`);
  }

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.isBlocked) throw new Error('Account blocked');

  // Validate Sub-Admin
  const subAdmin = await User.findById(subAdminId);
  if (!subAdmin || subAdmin.role !== 'sub_admin') {
    throw new Error('Sub-Admin not found');
  }
  if (subAdmin.isBlocked || subAdmin.subAdminInfo?.isActive === false) {
    throw new Error('This Sub-Admin is currently unavailable');
  }
  if (!subAdmin.subAdminInfo.upiEnabled || !subAdmin.subAdminInfo.upiId) {
    throw new Error('This Sub-Admin has not enabled UPI payments yet');
  }
  if (subAdmin.subAdminInfo.coinStock < coinsRequested) {
    throw new Error(
      `Sub-Admin has insufficient coin stock (${subAdmin.subAdminInfo.coinStock}). Please try a smaller amount or another Sub-Admin.`
    );
  }

  // One pending order per (user, subAdmin)
  const existingPending = await PaymentOrder.findOne({
    user: userId,
    subAdmin: subAdminId,
    status: { $in: ['pending', 'admin_notified'] },
  });
  if (existingPending) {
    throw new Error('You already have a pending payment with this Sub-Admin. Please wait for verification or the order to expire.');
  }

  const amountRupees = coinsRequested * settings.coinPriceRupees; // 1:1
  const orderReference = generateOrderReference();
  const expiresAt = new Date(Date.now() + settings.orderExpiryMinutes * 60 * 1000);

  const order = await PaymentOrder.create({
    user: userId,
    subAdmin: subAdminId,
    coinsRequested,
    amountRupees,
    orderReference,
    upiPlatform,
    status: 'pending',
    adminAlarmActive: true,
    expiresAt,
  });

  // Build UPI deep link from the SUB-ADMIN's UPI details
  const upiUrl = buildUpiUrl(
    {
      upiId: subAdmin.subAdminInfo.upiId,
      upiName: subAdmin.subAdminInfo.upiName || subAdmin.subAdminInfo.displayName,
      upiNote: subAdmin.subAdminInfo.upiNote || 'Ludo Arena Coins',
    },
    amountRupees,
    orderReference
  );

  let qrCodeDataUrl = null;
  try {
    qrCodeDataUrl = await QRCode.toDataURL(upiUrl, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  } catch (qrErr) {
    logger.warn({ qrErr }, 'QR code generation failed — continuing without QR');
  }

  logger.info({ userId, subAdminId, orderReference, coinsRequested, amountRupees }, 'Payment initiated');
  return { order, upiUrl, qrCodeDataUrl, subAdmin };
};

/**
 * Called when user confirms they have paid.
 * Triggers persistent alarm to the SUB-ADMIN (and Main Admin).
 * Idempotent — safe to call multiple times.
 */
const notifyAdminOfPayment = async (orderId, userId) => {
  const order = await PaymentOrder.findOne({ _id: orderId, user: userId })
    .populate('user', 'username email')
    .populate('subAdmin', 'subAdminInfo.displayName');
  if (!order) throw new Error('Order not found');
  if (!order.subAdmin) throw new Error('Order is missing Sub-Admin scope');

  if (order.status === 'admin_notified') {
    logger.info({ orderId }, 'Sub-Admin already notified — skipping duplicate');
    return order;
  }
  if (order.status !== 'pending') {
    throw new Error(`Order cannot be notified in status: ${order.status}`);
  }

  order.status = 'admin_notified';
  await order.save();

  const subAdminName = order.subAdmin?.subAdminInfo?.displayName || 'Sub-Admin';

  await Notification.create({
    recipient: order.subAdmin._id,
    type: 'payment_alarm',
    title: '💰 Payment Verification Required',
    message: `${order.user.username} has paid ₹${order.amountRupees} for ${order.coinsRequested} coins via your UPI ID. Order: ${order.orderReference}`,
    sentBy: order.user._id,
    data: {
      orderId: order._id,
      orderReference: order.orderReference,
      amountRupees: order.amountRupees,
      coinsRequested: order.coinsRequested,
      upiPlatform: order.upiPlatform,
      screenshotUrl: order.screenshotUrl,
    },
  });

  emitPaymentAlarm(order);

  logger.info({ orderId, orderReference: order.orderReference }, 'Sub-Admin payment alarm fired');
  return order;
};

// ─── Admin Actions (Sub-Admin scoped) ─────────────────────────────────────────

/**
 * Approve payment — Sub-Admin (own orders) or Main Admin (any order).
 * Credits the user's UserSubWallet and deducts Sub-Admin coinStock
 * via subAdminService.approveCoinPurchase (revolving stock + ledger).
 */
const approvePayment = async (orderId, actingAdmin, adminRemarks = '', ip = '') => {
  const adminId = actingAdmin._id;
  const order = await PaymentOrder.findById(orderId)
    .populate('user', 'username email')
    .populate('subAdmin', 'subAdminInfo.displayName');
  if (!order) throw new Error('Order not found');
  if (!order.subAdmin) throw new Error('Order is missing Sub-Admin scope');
  if (order.status === 'approved') throw new Error('Already approved');
  if (order.status === 'rejected') throw new Error('Order was rejected');
  if (order.status === 'expired') throw new Error('Order has expired');

  // Scope check: sub-admins may only approve their own orders
  if (!isMainAdmin(actingAdmin) && String(actingAdmin._id) !== String(order.subAdmin._id)) {
    throw new Error('You can only approve payment orders under your own Sub-Admin account');
  }

  // Credit user sub-wallet & deduct stock (idempotent, audited)
  const result = await subAdminService.approveCoinPurchase(order, adminId);

  // Update order
  order.status = 'approved';
  order.adminRemarks = adminRemarks;
  order.reviewedBy = adminId;
  order.reviewedAt = new Date();
  order.walletTransaction = result.tx._id;
  order.adminAlarmActive = false;
  order.adminAlarmDismissedAt = new Date();
  await order.save();

  await logAdminAction(adminId, 'approve_payment', order._id, {
    orderReference: order.orderReference,
    subAdmin: order.subAdmin._id,
    amountRupees: order.amountRupees,
    coinsRequested: order.coinsRequested,
    adminRemarks,
  }, ip);

  dismissPaymentAlarm(orderId, order.subAdmin._id);

  const updatedUser = await User.findById(order.user._id).select('walletBalance');
  emitWalletUpdate(order.user._id.toString(), {
    newBalance: updatedUser.walletBalance,
    amount: order.coinsRequested,
  });

  const userNotif = await Notification.create({
    recipient: order.user._id,
    type: 'payment_approved',
    title: '✅ Payment Verified!',
    message: `Your payment of ₹${order.amountRupees} to ${order.subAdmin.subAdminInfo?.displayName || 'Sub-Admin'} has been verified. ${order.coinsRequested} coins have been added to your wallet!`,
    sentBy: adminId,
    data: { orderId: order._id, coinsAdded: order.coinsRequested },
  });
  emitNotification(order.user._id.toString(), userNotif);

  emitPaymentStatusUpdate(order.user._id.toString(), {
    orderId: order._id.toString(),
    status: 'approved',
    coinsAdded: order.coinsRequested,
    newBalance: updatedUser.walletBalance,
    redirectTo: '/wallet',
  });

  logger.info({ orderId, subAdminId: order.subAdmin._id, coinsRequested: order.coinsRequested }, 'Payment approved');
  return { order, transaction: result.tx };
};

/**
 * Reject payment — Sub-Admin (own orders) or Main Admin (any order).
 * No coins move; user is simply told the proof was insufficient.
 */
const rejectPayment = async (orderId, actingAdmin, adminRemarks = '', ip = '') => {
  const adminId = actingAdmin._id;
  const order = await PaymentOrder.findById(orderId)
    .populate('user', 'username email')
    .populate('subAdmin', 'subAdminInfo.displayName');
  if (!order) throw new Error('Order not found');
  if (!order.subAdmin) throw new Error('Order is missing Sub-Admin scope');
  if (order.status === 'approved') throw new Error('Cannot reject an approved order');
  if (order.status === 'rejected') throw new Error('Already rejected');
  if (!adminRemarks || adminRemarks.trim().length < 3) {
    throw new Error('Rejection remarks are required');
  }

  if (!isMainAdmin(actingAdmin) && String(actingAdmin._id) !== String(order.subAdmin._id)) {
    throw new Error('You can only reject payment orders under your own Sub-Admin account');
  }

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

  dismissPaymentAlarm(orderId, order.subAdmin._id);

  const userNotif = await Notification.create({
    recipient: order.user._id,
    type: 'payment_rejected',
    title: '❌ Payment Not Verified',
    message: `Your payment request for ${order.coinsRequested} coins could not be verified. Reason: ${adminRemarks} Please contact support.`,
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
const dismissAlarm = async (orderId, actingAdmin) => {
  const order = await PaymentOrder.findById(orderId);
  if (!order) throw new Error('Order not found');
  if (!isMainAdmin(actingAdmin) && String(actingAdmin._id) !== String(order.subAdmin)) {
    throw new Error('You can only dismiss alarms for your own orders');
  }
  order.adminAlarmActive = false;
  order.adminAlarmDismissedAt = new Date();
  await order.save();
  dismissPaymentAlarm(orderId, order.subAdmin);
  return order;
};

// ─── Queries (scoped) ─────────────────────────────────────────────────────────

const getPendingOrders = async (scope = {}, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const base = { status: { $in: ['pending', 'admin_notified'] }, ...scope };
  const [orders, total] = await Promise.all([
    PaymentOrder.find(base)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'username email walletBalance')
      .populate('subAdmin', 'username subAdminInfo.displayName')
      .lean(),
    PaymentOrder.countDocuments(base),
  ]);
  return { orders, total, page, pages: Math.ceil(total / limit) };
};

const getAllOrders = async (scope = {}, page = 1, limit = 20, status = '') => {
  const skip = (page - 1) * limit;
  const query = { ...scope };
  if (status) query.status = status;
  const [orders, total] = await Promise.all([
    PaymentOrder.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'username email walletBalance')
      .populate('subAdmin', 'username subAdminInfo.displayName')
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
      .populate('subAdmin', 'username subAdminInfo.displayName')
      .lean(),
    PaymentOrder.countDocuments({ user: userId }),
  ]);
  return { orders, total, page, pages: Math.ceil(total / limit) };
};

const getOrderById = async (orderId, userId = null) => {
  const query = userId ? { _id: orderId, user: userId } : { _id: orderId };
  return PaymentOrder.findOne(query)
    .populate('user', 'username email walletBalance')
    .populate('subAdmin', 'username subAdminInfo.displayName')
    .populate('reviewedBy', 'username')
    .lean();
};

// ─── UPI URL Builder ──────────────────────────────────────────────────────────

/**
 * Builds a standard UPI intent URL.
 *
 * IMPORTANT: URLSearchParams encodes @ as %40 which UPI apps REJECT.
 * We must build the query string manually to keep @ unencoded in pa field.
 *
 * FORMAT: upi://pay?pa=UPI_ID&pn=NAME&am=AMOUNT&cu=INR&tn=NOTE&tr=REF
 */
const buildUpiUrl = (upi, amountRupees, orderReference) => {
  const pa  = upi.upiId;                                  // keep @ as-is
  const pn  = encodeURIComponent(upi.upiName || 'Ludo Arena');
  const am  = amountRupees.toFixed(2);
  const cu  = 'INR';
  const tn  = encodeURIComponent(`${upi.upiNote || 'Ludo Arena Coins'} ${orderReference}`);
  const tr  = encodeURIComponent(orderReference);
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}&tr=${tr}`;
};

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
