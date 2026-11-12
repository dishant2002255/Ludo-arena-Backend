/**
 * Singleton Socket.IO instance.
 * Set once when the server starts; used by services to emit events without
 * needing to pass `io` through every call chain.
 */

let _io = null;

const setIo = (io) => {
  _io = io;
};

const getIo = () => _io;

/**
 * Send a real-time notification to a specific user (or broadcast if userId is null).
 * Safe to call even if no socket server is up (e.g. during tests).
 */
const emitNotification = (userId, notification) => {
  if (!_io) return;
  if (userId) {
    _io.to(`user:${userId}`).emit('notification:new', notification);
  } else {
    _io.emit('notification:new', notification);
  }
};

/**
 * Emit a wallet update event so the client can refresh balance without polling.
 */
const emitWalletUpdate = (userId, payload) => {
  if (!_io || !userId) return;
  _io.to(`user:${userId}`).emit('wallet:updated', payload);
};

/**
 * Emit a persistent payment alarm to ALL connected admin sockets.
 * The alarm keeps ringing until admin manually dismisses it.
 */
const emitPaymentAlarm = (order) => {
  if (!_io) return;
  _io.to('admin:room').emit('payment:alarm', {
    orderId: order._id,
    orderReference: order.orderReference,
    username: order.user?.username || 'User',
    userId: order.user?._id || order.user,
    coinsRequested: order.coinsRequested,
    amountRupees: order.amountRupees,
    upiPlatform: order.upiPlatform,
    createdAt: order.createdAt,
  });
};

/**
 * Tell admin sockets to stop the alarm for a specific order.
 */
const dismissPaymentAlarm = (orderId) => {
  if (!_io) return;
  _io.to('admin:room').emit('payment:alarm-dismissed', { orderId });
};

/**
 * Update a specific user's payment order status in real time.
 */
const emitPaymentStatusUpdate = (userId, payload) => {
  if (!_io || !userId) return;
  _io.to(`user:${userId}`).emit('payment:status-updated', payload);
};

module.exports = { setIo, getIo, emitNotification, emitWalletUpdate, emitPaymentAlarm, dismissPaymentAlarm, emitPaymentStatusUpdate };
