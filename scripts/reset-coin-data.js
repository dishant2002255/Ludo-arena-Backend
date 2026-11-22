/**
 * Reset all user coins and payment data (1 Coin = ₹1 economy cleanup).
 * - Backs up affected collections to /backups before wiping
 * - Clears: UserSubWallet, PaymentOrder, WithdrawalRequest, SubAdminLedger,
 *           WalletTransaction, CoinRequest, OpenBattle
 * - Users: walletBalance/totalCoinsEarned/totalCoinsSpent → 0
 * - Sub-Admins: all coin counters → 0
 *
 * Run: node scripts/reset-coin-data.js [--yes]
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const collectionsToClear = [
  'UserSubWallet',
  'PaymentOrder',
  'WithdrawalRequest',
  'SubAdminLedger',
  'WalletTransaction',
  'CoinRequest',
  'OpenBattle',
];

async function backup(models, dir) {
  for (const name of collectionsToClear) {
    const docs = await models[name].find().lean();
    const file = path.join(dir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(docs, null, 2));
    console.log(`backup: ${name} (${docs.length} docs)`);
  }
}

async function main() {
  if (process.argv.includes('--yes') || process.argv.includes('--dry-run')) {
    // ok
  } else {
    console.log('Refusing to run without --yes. Usage: node scripts/reset-coin-data.js [--yes] [--dry-run]');
    process.exit(1);
  }
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(MONGO_URI);
  console.log('connected');

  const models = {
    UserSubWallet: mongoose.model('UserSubWallet'),
  };
  // Load real models
  models.UserSubWallet = require('../src/models/UserSubWallet');
  models.PaymentOrder = require('../src/models/PaymentOrder');
  models.WithdrawalRequest = require('../src/models/WithdrawalRequest');
  models.SubAdminLedger = require('../src/models/SubAdminLedger');
  models.WalletTransaction = require('../src/models/WalletTransaction');
  models.CoinRequest = require('../src/models/CoinRequest');
  models.OpenBattle = require('../src/models/OpenBattle');
  const User = require('../src/models/User');

  const backupDir = path.join(__dirname, '..', 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(backupDir, { recursive: true });
  await backup(models, backupDir);
  console.log('backup dir:', backupDir);

  if (dryRun) {
    console.log('DRY RUN — nothing deleted.');
    await mongoose.disconnect();
    return;
  }

  // 1. Clear coin/payment collections
  for (const name of collectionsToClear) {
    const r = await models[name].deleteMany({});
    console.log(`cleared ${name}: ${r.deletedCount}`);
  }

  // 2. Reset all players' balances
  const users = await User.updateMany(
    { role: 'user' },
    {
      $set: {
        walletBalance: 0,
        totalCoinsEarned: 0,
        totalCoinsSpent: 0,
        lastDailyBonus: null,
      },
    }
  );
  console.log('users reset:', users.modifiedCount);

  // 3. Reset sub-admin coin counters (stock back to 0 — main admin re-issues)
  const subs = await User.updateMany(
    { role: 'sub_admin' },
    {
      $set: {
        'subAdminInfo.coinStock': 0,
        'subAdminInfo.totalCoinsIssued': 0,
        'subAdminInfo.totalCoinsDeducted': 0,
        'subAdminInfo.totalCoinsSold': 0,
        'subAdminInfo.totalWithdrawalsSettled': 0,
        'subAdminInfo.totalCommissionEarned': 0,
      },
    }
  );
  console.log('sub-admins reset:', subs.modifiedCount);

  await mongoose.disconnect();
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
