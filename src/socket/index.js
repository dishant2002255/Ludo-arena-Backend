const socketAuth = require('./socketAuth');
const registerGameHandlers = require('./gameSocket');
const { registerNotificationHandlers } = require('./notificationSocket');
const { setIo } = require('./socketInstance');
const logger = require('../utils/logger');

const initSocket = (io) => {
  setIo(io);
  io.use(socketAuth);

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    const isAdmin = ['admin', 'main_admin'].includes(socket.user.role);
    const isSubAdmin = socket.user.role === 'sub_admin';

    logger.info({ userId, username: socket.user.username }, 'Socket connected');

    // Personal notification room
    socket.join(`user:${userId}`);

    // Admin gets access to admin:room for tournament/payment/withdrawal alerts
    if (isAdmin) socket.join('admin:room');

    // Sub-Admin room — payment alarms, withdrawal alarms, battle disputes
    if (isSubAdmin) socket.join(`subadmin:${userId}`);

    // Allow user/admin to subscribe to a specific tournament room
    socket.on('tournament:subscribe', ({ tournamentId }) => {
      if (tournamentId) socket.join(`tournament:${tournamentId}`);
    });

    socket.on('tournament:unsubscribe', ({ tournamentId }) => {
      if (tournamentId) socket.leave(`tournament:${tournamentId}`);
    });

    // ─── Open Battle subscriptions ────────────────────────────────────────
    // Participants subscribe to a specific battle room (result events,
    // credentials reveal when the battle fills).
    socket.on('battle:subscribe', ({ battleId }) => {
      if (battleId) socket.join(`battle:${battleId}`);
    });

    socket.on('battle:unsubscribe', ({ battleId }) => {
      if (battleId) socket.leave(`battle:${battleId}`);
    });

    // Lobby subscription — users watch open battles under a Sub-Admin.
    // Sub-Admins and main admins may watch any lobby.
    socket.on('lobby:subscribe', ({ subAdminId }) => {
      if (!subAdminId) return;
      if (isSubAdmin && String(subAdminId) !== String(userId)) return;
      socket.join(`lobby:subadmin:${subAdminId}`);
    });

    socket.on('lobby:unsubscribe', ({ subAdminId }) => {
      if (subAdminId) socket.leave(`lobby:subadmin:${subAdminId}`);
    });

    // Register game and notification handlers
    registerGameHandlers(io, socket);
    registerNotificationHandlers(io, socket);

    socket.on('disconnect', () => {
      logger.info({ userId }, 'Socket disconnected');
    });
  });
};

module.exports = initSocket;
