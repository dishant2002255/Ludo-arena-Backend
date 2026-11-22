/**
 * Full database reset — wipes all coin history, resets all balances to 0.
 * Preserves user accounts, sub-admin UPI config, and system settings.
 * Creates a JSON backup in server/backups/ before deleting anything.
 *
 * Usage: node src/scripts/resetAllData.js [--yes] [--dry-run]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const COLLECTIONS_TO_WIPE = [
  'usersubwallets',
  'wallettransactions',
  'paymentorders',
  'withdrawalrequests',
  'subadminledgers',
  'openbattles',
  'notifications',
  'adminlogs',
  // Legacy
  'matches',
  'rooms',
  'gamestates',
  'gamehistories',
  'tournaments',
  'coinrequests',
  'disputes',
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const confirmed = process.argv.includes('--yes');

  if (!dryRun && !confirmed) {
    console.error('Safety: pass --yes to execute or --dry-run to preview. Exiting.');
    process.exit(1);
  }

  if (!MONGO_URI) {
    console.error('MONGO_URI / MONGODB_URI env variable not set');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');

  const db = mongoose.connection.db;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', '..', 'backups', `reset-${ts}`);
  fs.mkdirSync(backupDir, { recursive: true });

  // ── Step A: Backup ───────────────────────────────────────────────────────
  console.log('\n── Step A: Backing up collections ──');
  const allCollections = await db.listCollections().toArray();
  for (const col of allCollections) {
    const name = col.name;
    const docs = await db.collection(name).find().toArray();
    fs.writeFileSync(path.join(backupDir, `${name}.json`), JSON.stringify(docs, null, 2));
    console.log(`  backed up ${name}: ${docs.length} docs`);
  }
  console.log(`✓ Backup saved: ${backupDir}`);

  if (dryRun) {
    console.log('\n── DRY RUN — no data was changed ──');
    await mongoose.disconnect();
    return;
  }

  // ── Step B: Wipe history & transactional collections ────────────────────
  console.log('\n── Step B: Wiping collections ──');
  for (const name of COLLECTIONS_TO_WIPE) {
    const colExists = allCollections.find((c) => c.name === name);
    if (!colExists) { console.log(`  skip ${name} (doesn't exist)`); continue; }
    const r = await db.collection(name).deleteMany({});
    console.log(`  wiped ${name}: ${r.deletedCount} docs`);
  }

  // Insert a fresh admin audit entry
  const AdminLog = require('../models/AdminLog');
  await AdminLog.create({
    admin: new mongoose.Types.ObjectId(),
    action: 'system_full_history_and_coin_reset',
    targetType: 'system',
    details: { timestamp: new Date(), resetBy: 'resetAllData.js script' },
    ipAddress: 'localhost',
  });
  console.log('✓ Fresh audit entry created');

  // ── Step C: Reset all user & sub-admin balances ──────────────────────────
  console.log('\n── Step C: Resetting user balances ──');
  const User = require('../models/User');

  const userResult = await User.updateMany(
    {},
    {
      $set: {
        walletBalance: 0,
        depositBalance: 0,
        winningBalance: 0,
        totalCoinsEarned: 0,
        totalCoinsSpent: 0,
        totalMatches: 0,
        totalWins: 0,
        totalLosses: 0,
      },
    }
  );
  console.log(`  users reset: ${userResult.modifiedCount}`);

  const subAdminResult = await User.updateMany(
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
  console.log(`  sub-admins reset: ${subAdminResult.modifiedCount}`);

  // ── Step D: Post-reset verification ─────────────────────────────────────
  console.log('\n── Step D: Verification ──');
  const nonZeroWallet = await User.countDocuments({ walletBalance: { $ne: 0 } });
  const nonZeroDeposit = await User.countDocuments({ depositBalance: { $ne: 0 } });
  const nonZeroWinning = await User.countDocuments({ winningBalance: { $ne: 0 } });
  const nonZeroSubAdmin = await User.countDocuments({
    role: 'sub_admin',
    'subAdminInfo.coinStock': { $ne: 0 },
  });

  console.log(`  users with walletBalance ≠ 0: ${nonZeroWallet}`);
  console.log(`  users with depositBalance ≠ 0: ${nonZeroDeposit}`);
  console.log(`  users with winningBalance ≠ 0: ${nonZeroWinning}`);
  console.log(`  sub-admins with coinStock ≠ 0: ${nonZeroSubAdmin}`);

  if (nonZeroWallet === 0 && nonZeroDeposit === 0 && nonZeroWinning === 0 && nonZeroSubAdmin === 0) {
    console.log('\n✅ RESET COMPLETE — all balances are 0, all history wiped');
  } else {
    console.error('\n❌ VERIFICATION FAILED — some balances are non-zero!');
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log('✓ Disconnected');
}

main().catch((e) => { console.error(e); process.exit(1); });
