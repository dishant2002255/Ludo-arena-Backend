module.exports = {
  // Wallet
  REGISTRATION_BONUS: parseInt(process.env.REGISTRATION_BONUS) || 50,
  DAILY_LOGIN_REWARD: parseInt(process.env.DAILY_LOGIN_REWARD) || 100,

  // Player colors
  PLAYER_COLORS: ['red', 'green', 'yellow', 'blue'],

  // Match
  PLAYERS_PER_ROOM: 4,

  // Room statuses
  ROOM_STATUS: {
    WAITING: 'waiting',
    FULL: 'full',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    ABANDONED: 'abandoned',
  },

  // Match statuses
  MATCH_STATUS: {
    ACTIVE: 'active',
    DISABLED: 'disabled',
  },

  // Game statuses
  GAME_STATUS: {
    WAITING: 'waiting',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
  },

  // Transaction types
  TRANSACTION_TYPE: {
    REGISTRATION_BONUS: 'registration_bonus',
    DAILY_BONUS: 'daily_bonus',
    MATCH_ENTRY: 'match_entry',
    MATCH_WIN: 'match_win',
    ADMIN_ADJUST: 'admin_adjust',
    COIN_REQUEST: 'coin_request',
    ADMIN_CORRECTION: 'admin_correction',
    REFUND: 'refund',
  },

  // Coin request statuses
  COIN_REQUEST_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
  },

  // Min coins that can be requested
  MIN_COIN_REQUEST: 200,

  // Roles
  ROLES: {
    USER: 'user',
    ADMIN: 'admin',
  },

  // Turn timeout (seconds)
  TURN_TIMEOUT_SECONDS: 30,

  // Token states
  TOKEN_STATE: {
    HOME: 'home',
    ACTIVE: 'active',
    FINISHED: 'finished',
  },

  // Safe cells on main track (0-indexed positions on 52-cell track)
  SAFE_CELLS: [0, 8, 13, 21, 26, 34, 39, 47],
};
