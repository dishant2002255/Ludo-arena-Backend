const Notification = require('../models/Notification');

const registerNotificationHandlers = (io, socket) => {
  // Send unread notifications on connect
  socket.on('notifications:fetch', async () => {
    try {
      const notifications = await Notification.find({
        $or: [{ recipient: socket.user._id }, { recipient: null }],
        isRead: false,
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      socket.emit('notifications:list', { notifications });
    } catch {}
  });

  socket.on('notifications:mark-read', async ({ notificationId }) => {
    try {
      await Notification.findByIdAndUpdate(notificationId, { isRead: true });
    } catch {}
  });
};

/**
 * Broadcast a notification to a specific user or all users.
 */
const broadcastNotification = (io, notification) => {
  if (notification.recipient) {
    io.to(`user:${notification.recipient}`).emit('notification:new', notification);
  } else {
    io.emit('notification:new', notification);
  }
};

module.exports = { registerNotificationHandlers, broadcastNotification };
