/**
 * Sub-Admin Service — coin stock management, sub-wallet operations,
 * withdrawal flow, and the Anti-Cheat audit equation.
 *
 * COIN LIFECYCLE INVARIANT (must always hold per Sub-Admin):
 *   NetCoinsIssued (totalIssued - totalDeducted)
 *     === coinStock
 *     + SUM(UserSubWallet.balance)
 *     + SUM(UserSubWallet.lockedBattleBalance)
 *     + SUM(UserSubWallet.lockedWithdrawalBalance)
 *     + totalCommissionEarned
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const User            = require('../models/User');
const UserSubWallet   = require('../models/UserSubWallet');
const SubAdminLedger  = require('../models/SubAdminLedger');
const WalletTransaction = require('../models/WalletTransaction');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const AdminLog        = require('../models/AdminLog');
const Notification    = require('../models/Notification');
const SystemSettings  = require('../models/SystemSettings');
const { getIo }       = require('../socket/socketInstance');
const logger          = require('../utils/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isMainAdmin = (user) => ['admin', 'main_admin'].includes(user?.role);

const genWithdrawalRef = () =>
  `WD-${Date.now().toString(36).toUpperCase()}-${uuidv4().split('-')[0].toUpperCase()}`;

const logAdminAction = async (adminId, action, targetType, targetId, details, ip = '') => {
  try {
    await AdminLog.create({ admin: adminId, action, targetType, targetId, details, ipAddress: ip });
  } catch {}
};

/**
 * Update the User's aggregate wallet fields = SUM of all their UserSubWallet bucket values.
 */
const syncUserAggregateBalance = async (userId) => {
  const wallets = await UserSubWallet.find({ user: userId });
  const depositBalance = wallets.reduce((s, w) => s + w.depositBalance, 0);
  const winningBalance = wallets.reduce((s, w) => s + w.winningBalance, 0);
  const walletBalance  = depositBalance + winningBalance;
  await User.findByIdAndUpdate(userId, { walletBalance, depositBalance, winningBalance });
  return { walletBalance, depositBalance, winningBalance };
};

// ─── Sub-Admin Creation ────────────────────────────────────────────────────────

const createSubAdmin = async (mainAdminId, data) => {
  const {
    username, email, password, displayName, phone,
    upiId, upiName, upiEnabled, commissionPercentOverride, initialCoins,
  } = data;

  // Create the user with sub_admin role
  const subAdmin = await User.create({
    username,
    email,
    password,
    role: 'sub_admin',
    walletBalance: 0,
    subAdminInfo: {
      displayName: displayName || username,
      phone: phone || '',
      isActive: true,
      coinStock: 0,
      totalCoinsIssued: 0,
      totalCoinsDeducted: 0,
      totalCoinsSold: 0,
      totalWithdrawalsSettled: 0,
      totalCommissionEarned: 0,
      commissionPercentOverride: commissionPercentOverride ?? null,
      upiEnabled: upiEnabled ?? false,
      upiId: upiId || '',
      upiName: upiName || displayName || username,
      upiNote: 'Ludo Arena Coins',
      createdBy: mainAdminId,
    },
  });

  await logAdminAction(mainAdminId, 'create_sub_admin', 'user', subAdmin._id, { username, email });

  // Issue initial coins if provided
  if (initialCoins && initialCoins > 0) {
    await issueCoinsToSubAdmin(mainAdminId, subAdmin._id, initialCoins, 'Initial coin issue on account creation');
  }

  return subAdmin;
};

// ─── Coin Stock Operations ─────────────────────────────────────────────────────

const issueCoinsToSubAdmin = async (mainAdminId, subAdminId, amount, remarks = '') => {
  if (amount <= 0) throw new Error('Amount must be positive');

  const subAdmin = await User.findById(subAdminId);
  if (!subAdmin || subAdmin.role !== 'sub_admin') throw new Error('Sub-Admin not found');

  const idempotencyKey = `issue_coins_${mainAdminId}_${subAdminId}_${Date.now()}`;
  const existing = await SubAdminLedger.findOne({ idempotencyKey });
  if (existing) return existing;

  const stockBefore = subAdmin.subAdminInfo.coinStock;
  const stockAfter  = stockBefore + amount;

  await User.findByIdAndUpdate(subAdminId, {
    $inc: {
      'subAdminInfo.coinStock':        amount,
      'subAdminInfo.totalCoinsIssued': amount,
    },
  });

  const ledger = await SubAdminLedger.create({
    subAdmin: subAdminId,
    type: 'main_admin_issue',
    amount,
    stockBefore,
    stockAfter,
    actedBy: mainAdminId,
    remarks,
    idempotencyKey,
  });

  await logAdminAction(mainAdminId, 'issue_coins_to_subadmin', 'user', subAdminId, { amount, remarks });

  logger.info({ mainAdminId, subAdminId, amount }, 'Coins issued to Sub-Admin');
  return ledger;
};

const deductCoinsFromSubAdmin = async (mainAdminId, subAdminId, amount, remarks = '') => {
  if (amount <= 0) throw new Error('Amount must be positive');

  const subAdmin = await User.findById(subAdminId);
  if (!subAdmin || subAdmin.role !== 'sub_admin') throw new Error('Sub-Admin not found');
  if (subAdmin.subAdminInfo.coinStock < amount) {
    throw new Error(`Insufficient Sub-Admin coin stock. Available: ${subAdmin.subAdminInfo.coinStock}`);
  }

  const stockBefore = subAdmin.subAdminInfo.coinStock;
  const stockAfter  = stockBefore - amount;

  await User.findByIdAndUpdate(subAdminId, {
    $inc: {
      'subAdminInfo.coinStock':          -amount,
      'subAdminInfo.totalCoinsDeducted':  amount,
    },
  });

  const ledger = await SubAdminLedger.create({
    subAdmin: subAdminId,
    type: 'main_admin_deduct',
    amount: -amount,
    stockBefore,
    stockAfter,
    actedBy: mainAdminId,
    remarks,
    idempotencyKey: `deduct_coins_${mainAdminId}_${subAdminId}_${Date.now()}`,
  });

  await logAdminAction(mainAdminId, 'deduct_coins_from_subadmin', 'user', subAdminId, { amount, remarks });
  return ledger;
};

// ─── Sub-Admin UPI Coin Purchase Approval ─────────────────────────────────────

const approveCoinPurchase = async (order, actingAdminId) => {
  const idempotencyKey = `coin_purchase_${order._id}`;
  const existing = await WalletTransaction.findOne({ idempotencyKey });
  if (existing) return existing;

  const subAdmin = await User.findById(order.subAdmin);
  if (!subAdmin) throw new Error('Sub-Admin not found');

  if (subAdmin.subAdminInfo.coinStock < order.coinsRequested) {
    throw new Error(
      `Sub-Admin has insufficient coin stock (${subAdmin.subAdminInfo.coinStock}). ` +
      `Request a top-up from Main Admin.`
    );
  }

  const stockBefore = subAdmin.subAdminInfo.coinStock;
  const stockAfter  = stockBefore - order.coinsRequested;

  await User.findByIdAndUpdate(order.subAdmin, {
    $inc: {
      'subAdminInfo.coinStock':     -order.coinsRequested,
      'subAdminInfo.totalCoinsSold': order.coinsRequested,
    },
  });

  const wallet = await UserSubWallet.getOrCreate(order.user, order.subAdmin);
  const balanceBefore = wallet.balance;

  // 100% → depositBalance (purchased coins are play-only)
  wallet.depositBalance += order.coinsRequested;
  wallet.totalPurchased += order.coinsRequested;
  wallet.syncBalance();
  await wallet.save();

  await syncUserAggregateBalance(order.user);

  const tx = await WalletTransaction.create({
    user:          order.user,
    type:          'coin_purchase',
    amount:        order.coinsRequested,
    balanceBefore,
    balanceAfter:  wallet.balance,
    description:   `UPI purchase ₹${order.amountRupees} from ${subAdmin.subAdminInfo.displayName}`,
    subAdmin:      order.subAdmin,
    paymentOrder:  order._id,
    adjustedBy:    actingAdminId,
    idempotencyKey,
  });

  await SubAdminLedger.create({
    subAdmin:     order.subAdmin,
    type:         'user_coin_purchase',
    amount:       -order.coinsRequested,
    stockBefore,
    stockAfter,
    relatedUser:  order.user,
    paymentOrder: order._id,
    actedBy:      actingAdminId,
    remarks:      `User purchased ${order.coinsRequested} coins`,
    idempotencyKey: `ledger_purchase_${order._id}`,
  });

  await logAdminAction(actingAdminId, 'approve_coin_purchase', 'wallet', order._id, {
    userId: order.user, coinsRequested: order.coinsRequested,
  });

  logger.info({ orderId: order._id, coinsRequested: order.coinsRequested }, 'Coin purchase approved');
  return { tx, newBalance: wallet.balance };
};

// ─── Withdrawal Request ───────────────────────────────────────────────────────

const submitWithdrawal = async (userId, subAdminId, data) => {
  const { amountCoins, payoutMethod, userUpiId, accountHolderName, bankAccountNumber, bankIfsc } = data;
  const settings = await SystemSettings.getSettings();

  if (amountCoins < settings.minWithdrawalCoins) {
    throw new Error(`Minimum withdrawal is ${settings.minWithdrawalCoins} coins`);
  }
  if (amountCoins > settings.maxWithdrawalCoins) {
    throw new Error(`Maximum withdrawal is ${settings.maxWithdrawalCoins} coins`);
  }

  const subAdmin = await User.findById(subAdminId);
  if (!subAdmin || subAdmin.role !== 'sub_admin' || !subAdmin.subAdminInfo?.isActive) {
    throw new Error('Sub-Admin not found or inactive');
  }

  const existingPending = await WithdrawalRequest.findOne({
    user: userId, subAdmin: subAdminId, status: 'pending',
  });
  if (existingPending) {
    throw new Error('You already have a pending withdrawal request for this Sub-Admin.');
  }

  const wallet = await UserSubWallet.getOrCreate(userId, subAdminId);

  // STRICT CHECK: only winningBalance is withdrawable
  if (wallet.winningBalance < amountCoins) {
    throw new Error(
      `Only Winning Coins can be withdrawn. Your withdrawable Winning Balance under ${subAdmin.subAdminInfo.displayName} is ₹${wallet.winningBalance}` +
      (wallet.depositBalance > 0 ? ` (Deposit Coins ₹${wallet.depositBalance} can only be used to play battles).` : '.')
    );
  }

  const withdrawalRef = genWithdrawalRef();
  const idempotencyKey = `wd_lock_${withdrawalRef}`;

  const existing = await WalletTransaction.findOne({ idempotencyKey });
  if (existing) throw new Error('Duplicate withdrawal request detected');

  const withdrawal = await WithdrawalRequest.create({
    user: userId,
    subAdmin: subAdminId,
    amountCoins,
    amountRupees: amountCoins,
    withdrawalReference: withdrawalRef,
    payoutMethod: payoutMethod || 'upi',
    userUpiId: userUpiId || '',
    accountHolderName,
    bankAccountNumber: bankAccountNumber || '',
    bankIfsc: bankIfsc || '',
    status: 'pending',
    alarmActive: true,
    idempotencyKey,
  });

  // Lock from winningBalance only
  const balBefore = wallet.balance;
  wallet.winningBalance -= amountCoins;
  wallet.lockedWithdrawalBalance += amountCoins;
  wallet.syncBalance();
  await wallet.save();
  await syncUserAggregateBalance(userId);

  await WalletTransaction.create({
    user:          userId,
    type:          'withdrawal_lock',
    amount:        -amountCoins,
    balanceBefore: balBefore,
    balanceAfter:  wallet.balance,
    description:   `Withdrawal locked: ${withdrawalRef}`,
    subAdmin:      subAdminId,
    withdrawalRequest: withdrawal._id,
    idempotencyKey,
  });

  const io = getIo();
  if (io) {
    const payload = {
      withdrawalId: withdrawal._id,
      withdrawalReference: withdrawalRef,
      userId, amountCoins, amountRupees: amountCoins,
    };
    io.to(`subadmin:${subAdminId}`).emit('withdrawal:new', payload);
    io.to('admin:room').emit('withdrawal:new', payload);
  }

  logger.info({ userId, subAdminId, amountCoins, withdrawalRef }, 'Withdrawal submitted');
  return withdrawal;
};

const approveWithdrawal = async (withdrawal, actingAdminId, utrReference = '', adminRemarks = '', ip = '') => {
  const idempotencyKey = `wd_approve_${withdrawal._id}`;
  const existing = await WalletTransaction.findOne({ idempotencyKey });
  if (existing) throw new Error('Already approved');

  const wallet = await UserSubWallet.getOrCreate(withdrawal.user, withdrawal.subAdmin);
  const balBefore = wallet.balance;

  wallet.lockedWithdrawalBalance -= withdrawal.amountCoins;
  wallet.totalWithdrawn += withdrawal.amountCoins;
  // balance/buckets unchanged — coins were already removed from winningBalance on submit
  await wallet.save();
  await syncUserAggregateBalance(withdrawal.user);

  withdrawal.status      = 'approved';
  withdrawal.utrReference = utrReference;
  withdrawal.adminRemarks = adminRemarks;
  withdrawal.reviewedBy  = actingAdminId;
  withdrawal.reviewedAt  = new Date();
  withdrawal.alarmActive = false;
  await withdrawal.save();

  // REVOLVING STOCK: return coins to Sub-Admin coinStock
  const subAdmin = await User.findById(withdrawal.subAdmin);
  const stockBefore = subAdmin.subAdminInfo.coinStock;
  const stockAfter  = stockBefore + withdrawal.amountCoins;
  await User.findByIdAndUpdate(withdrawal.subAdmin, {
    $inc: {
      'subAdminInfo.coinStock':              withdrawal.amountCoins,
      'subAdminInfo.totalWithdrawalsSettled': withdrawal.amountCoins,
    },
  });

  await SubAdminLedger.create({
    subAdmin:          withdrawal.subAdmin,
    type:              'user_withdrawal_return',
    amount:            withdrawal.amountCoins,
    stockBefore,
    stockAfter,
    relatedUser:       withdrawal.user,
    withdrawalRequest: withdrawal._id,
    actedBy:           actingAdminId,
    remarks:           `Withdrawal approved: ${withdrawal.withdrawalReference}, UTR: ${utrReference}`,
    idempotencyKey:    `ledger_wd_approve_${withdrawal._id}`,
  });

  await WalletTransaction.create({
    user:          withdrawal.user,
    type:          'withdrawal_approved',
    amount:        0,
    balanceBefore: balBefore,
    balanceAfter:  balBefore,
    description:   `Withdrawal approved ₹${withdrawal.amountRupees} — UTR: ${utrReference}`,
    subAdmin:      withdrawal.subAdmin,
    withdrawalRequest: withdrawal._id,
    adjustedBy:    actingAdminId,
    idempotencyKey,
  });

  await logAdminAction(actingAdminId, 'approve_withdrawal', 'wallet', withdrawal._id, {
    amountCoins: withdrawal.amountCoins, utrReference,
  }, ip);

  const io = getIo();
  if (io) {
    io.to(`user:${withdrawal.user}`).emit('withdrawal:updated', {
      withdrawalId: withdrawal._id,
      status: 'approved', utrReference, amountCoins: withdrawal.amountCoins,
    });
    io.to(`subadmin:${withdrawal.subAdmin}`).emit('withdrawal:alarm-dismissed', { withdrawalId: withdrawal._id });
    io.to('admin:room').emit('withdrawal:alarm-dismissed', { withdrawalId: withdrawal._id });
  }

  return withdrawal;
};

const rejectWithdrawal = async (withdrawal, actingAdminId, adminRemarks = '', ip = '') => {
  if (!adminRemarks || adminRemarks.trim().length < 5) {
    throw new Error('Admin remarks required (min 5 characters)');
  }
  const idempotencyKey = `wd_reject_${withdrawal._id}`;
  const existing = await WalletTransaction.findOne({ idempotencyKey });
  if (existing) throw new Error('Already rejected');

  const wallet = await UserSubWallet.getOrCreate(withdrawal.user, withdrawal.subAdmin);
  const balBefore = wallet.balance;

  // Refund back to winningBalance (it came from there on submit)
  wallet.winningBalance += withdrawal.amountCoins;
  wallet.lockedWithdrawalBalance -= withdrawal.amountCoins;
  wallet.syncBalance();
  await wallet.save();
  await syncUserAggregateBalance(withdrawal.user);

  withdrawal.status      = 'rejected';
  withdrawal.adminRemarks = adminRemarks;
  withdrawal.reviewedBy  = actingAdminId;
  withdrawal.reviewedAt  = new Date();
  withdrawal.alarmActive = false;
  await withdrawal.save();

  await WalletTransaction.create({
    user:          withdrawal.user,
    type:          'withdrawal_refund',
    amount:        withdrawal.amountCoins,
    balanceBefore: balBefore,
    balanceAfter:  wallet.balance,
    description:   `Withdrawal rejected — refunded to Winning Wallet: ${withdrawal.withdrawalReference}`,
    subAdmin:      withdrawal.subAdmin,
    withdrawalRequest: withdrawal._id,
    adjustedBy:    actingAdminId,
    idempotencyKey,
  });

  await logAdminAction(actingAdminId, 'reject_withdrawal', 'wallet', withdrawal._id, { adminRemarks }, ip);

  const io = getIo();
  if (io) {
    io.to(`user:${withdrawal.user}`).emit('withdrawal:updated', {
      withdrawalId: withdrawal._id, status: 'rejected', adminRemarks,
    });
    io.to(`subadmin:${withdrawal.subAdmin}`).emit('withdrawal:alarm-dismissed', { withdrawalId: withdrawal._id });
    io.to('admin:room').emit('withdrawal:alarm-dismissed', { withdrawalId: withdrawal._id });
  }

  return withdrawal;
};

// ─── Anti-Cheat Audit Metrics ─────────────────────────────────────────────────

const getSubAdminAuditMetrics = async (subAdminId) => {
  const OpenBattle        = require('../models/OpenBattle');
  const PaymentOrder      = require('../models/PaymentOrder');

  const [
    subAdmin,
    wallets,
    approvedDeposits,
    approvedWithdrawals,
    pendingDeposits,
    pendingWithdrawals,
    disputedBattles,
    ledgerCommission,
  ] = await Promise.all([
    User.findById(subAdminId),
    UserSubWallet.find({ subAdmin: subAdminId }),
    PaymentOrder.aggregate([
      { $match: { subAdmin: new mongoose.Types.ObjectId(subAdminId), status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amountRupees' }, count: { $sum: 1 } } },
    ]),
    WithdrawalRequest.aggregate([
      { $match: { subAdmin: new mongoose.Types.ObjectId(subAdminId), status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amountRupees' }, count: { $sum: 1 } } },
    ]),
    PaymentOrder.countDocuments({ subAdmin: subAdminId, status: { $in: ['pending', 'admin_notified'] } }),
    WithdrawalRequest.countDocuments({ subAdmin: subAdminId, status: 'pending' }),
    OpenBattle.countDocuments({ subAdmin: subAdminId, status: 'disputed' }),
    OpenBattle.aggregate([
      { $match: { subAdmin: new mongoose.Types.ObjectId(subAdminId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$commissionCoins' } } },
    ]),
  ]);

  if (!subAdmin) throw new Error('Sub-Admin not found');

  const coinStock            = subAdmin.subAdminInfo.coinStock;
  const totalCoinsIssued     = subAdmin.subAdminInfo.totalCoinsIssued;
  const totalCoinsDeducted   = subAdmin.subAdminInfo.totalCoinsDeducted;
  const netCoinsIssued       = totalCoinsIssued - totalCoinsDeducted;
  const totalCommissionEarned = ledgerCommission[0]?.total || 0;

  const activeUserBalances   = wallets.reduce((s, w) => s + w.balance, 0);
  const escrowBattle         = wallets.reduce((s, w) => s + w.lockedBattleBalance, 0);
  const escrowWithdrawal     = wallets.reduce((s, w) => s + w.lockedWithdrawalBalance, 0);
  const activeEscrow         = escrowBattle + escrowWithdrawal;

  const auditSum = coinStock + activeUserBalances + activeEscrow + totalCommissionEarned;
  const auditBalanced = netCoinsIssued === auditSum;

  const totalApprovedDepositsRupees    = approvedDeposits[0]?.total || 0;
  const totalApprovedWithdrawalsRupees = approvedWithdrawals[0]?.total || 0;

  return {
    subAdminId,
    coinStock,
    totalCoinsIssued,
    totalCoinsDeducted,
    netCoinsIssued,
    activeUserBalances,
    escrowBattle,
    escrowWithdrawal,
    activeEscrow,
    totalCommissionEarned,
    totalApprovedDepositsRupees,
    totalApprovedDepositsCount: approvedDeposits[0]?.count || 0,
    totalApprovedWithdrawalsRupees,
    totalApprovedWithdrawalsCount: approvedWithdrawals[0]?.count || 0,
    netCashInHandRupees: totalApprovedDepositsRupees - totalApprovedWithdrawalsRupees,
    pendingDepositOrdersCount: pendingDeposits,
    pendingWithdrawalsCount: pendingWithdrawals,
    disputedBattlesCount: disputedBattles,
    auditSum,
    auditBalanced,
    discrepancyDelta: netCoinsIssued - auditSum,
  };
};

module.exports = {
  createSubAdmin,
  issueCoinsToSubAdmin,
  deductCoinsFromSubAdmin,
  approveCoinPurchase,
  submitWithdrawal,
  approveWithdrawal,
  rejectWithdrawal,
  syncUserAggregateBalance,
  getSubAdminAuditMetrics,
};
