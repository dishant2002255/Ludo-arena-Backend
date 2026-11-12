/**
 * Creates an isolated Express app for integration testing.
 * Does NOT call server.listen() or connectDB() — test DB is provided externally.
 */
process.env.JWT_SECRET = 'test_jwt_secret_32chars_minimum__';
process.env.NODE_ENV = 'test';
process.env.REGISTRATION_BONUS = '500';
process.env.DAILY_LOGIN_REWARD = '100';

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const { errorHandler, notFound } = require('../../../src/middleware/errorHandler');
const authRoutes = require('../../../src/routes/auth.routes');
const userRoutes = require('../../../src/routes/user.routes');
const matchRoutes = require('../../../src/routes/match.routes');
const roomRoutes = require('../../../src/routes/room.routes');
const walletRoutes = require('../../../src/routes/wallet.routes');
const adminRoutes = require('../../../src/routes/admin.routes');

const buildApp = () => {
  const app = express();
  app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (_, res) => res.json({ success: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/matches', matchRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = buildApp;
