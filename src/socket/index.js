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
    const isAdmin = socket.user.role === 'admin';

    logger.info({ userId, username: socket.user.username }, 'Socket connected');

    // Personal notification room
    socket.join(`user:${userId}`);

    // Admin gets access to admin:room for tournament alerts
    if (isAdmin) socket.join('admin:room');

    // Allow user/admin to subscribe to a specific tournament room
    socket.on('tournament:subscribe', ({ tournamentId }) => {
      if (tournamentId) socket.join(`tournament:${tournamentId}`);
    });

    socket.on('tournament:unsubscribe', ({ tournamentId }) => {
      if (tournamentId) socket.leave(`tournament:${tournamentId}`);
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
