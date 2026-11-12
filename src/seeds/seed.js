require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Match = require('../models/Match');
const WalletTransaction = require('../models/WalletTransaction');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB for seeding');
};

const seedAdmin = async () => {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@ludoarena.com';
  const username = process.env.SEED_ADMIN_USERNAME || 'superadmin';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';

  const exists = await User.findOne({ email });
  if (exists) {
    console.log('Admin already exists, skipping...');
    return exists;
  }

  const admin = await User.create({
    username,
    email,
    password,
    role: 'admin',
    walletBalance: 999999,
    isActive: true,
  });

  console.log(`Admin created: ${email}`);
  return admin;
};

const seedDemoUsers = async () => {
  const demoUsers = [
    { username: 'player_red', email: 'red@demo.com', password: 'Demo@1234' },
    { username: 'player_green', email: 'green@demo.com', password: 'Demo@1234' },
    { username: 'player_yellow', email: 'yellow@demo.com', password: 'Demo@1234' },
    { username: 'player_blue', email: 'blue@demo.com', password: 'Demo@1234' },
  ];

  const created = [];
  for (const u of demoUsers) {
    const exists = await User.findOne({ email: u.email });
    if (!exists) {
      const user = await User.create({ ...u, walletBalance: 500, totalCoinsEarned: 500 });
      created.push(user.username);
    }
  }
  if (created.length > 0) console.log(`Demo users created: ${created.join(', ')}`);
  else console.log('Demo users already exist, skipping...');
};

const seedMatches = async (adminId) => {
  const count = await Match.countDocuments();
  if (count > 0) {
    console.log('Matches already exist, skipping...');
    return;
  }

  const matches = [
    {
      name: 'Classic Arena',
      description: 'Standard Ludo match. Free entry, 300 coins winner reward.',
      entryCoins: 0,
      winnerReward: 300,
      status: 'active',
      createdBy: adminId,
    },
    {
      name: 'Bronze League',
      description: 'Entry: 50 coins. Winner takes 150 coins.',
      entryCoins: 50,
      winnerReward: 150,
      status: 'active',
      createdBy: adminId,
    },
    {
      name: 'Silver League',
      description: 'Entry: 100 coins. Winner takes 350 coins.',
      entryCoins: 100,
      winnerReward: 350,
      status: 'active',
      createdBy: adminId,
    },
    {
      name: 'Gold League',
      description: 'Entry: 200 coins. Winner takes 700 coins.',
      entryCoins: 200,
      winnerReward: 700,
      status: 'active',
      createdBy: adminId,
    },
    {
      name: 'Diamond League',
      description: 'Entry: 500 coins. Winner takes 1800 coins.',
      entryCoins: 500,
      winnerReward: 1800,
      status: 'active',
      createdBy: adminId,
      rules: {
        bonusTurnOnCapture: true,
        turnTimeoutSeconds: 20,
      },
    },
  ];

  await Match.insertMany(matches);
  console.log(`${matches.length} sample matches created`);
};

const run = async () => {
  try {
    await connectDB();
    const admin = await seedAdmin();
    await seedDemoUsers();
    await seedMatches(admin._id);
    console.log('\n✅ Seed complete!');
    console.log(`\nAdmin login:\n  Email: ${process.env.SEED_ADMIN_EMAIL || 'admin@ludoarena.com'}`);
    console.log(`  Password: ${process.env.SEED_ADMIN_PASSWORD || 'Admin@123456'}`);
    console.log('\nDemo users (password: Demo@1234):');
    console.log('  red@demo.com, green@demo.com, yellow@demo.com, blue@demo.com');
  } catch (err) {
    console.error('Seed failed:', err);
  } finally {
    await mongoose.disconnect();
  }
};

run();
