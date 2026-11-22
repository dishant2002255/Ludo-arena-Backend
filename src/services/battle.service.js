/**
 * Battle Service — user-created Ludo King Open Battles.
 *
 * RULES:
 * - Battle is scoped to one Sub-Admin. Entry coins are locked from the user's
 *   UserSubWallet(user, subAdmin). Users can only see/join battles of their
 *   selected Sub-Admin.
 * - roomId/roomPassword are exposed ONLY to participants (once the battle is
 *   full), the owning Sub-Admin and the Main Admin — never in lobby lists.
 * - Result flow: every participant submits a claim (won/lost/cancel) + optional
 *   screenshot. Auto-transitions:
 *     • all claim 'cancel'  → mutual cancel, FULL refund, 0 commission
 *     • exactly one 'won' (rest 'lost') → auto-completed, prize paid, commission burned
 *     • anything else       → disputed, Sub-Admin/Main Admin resolves
 * - Commission coins are BURNED (no one receives them) and recorded on
 *   subAdmin.subAdminInfo.totalCommissionEarned to satisfy the audit equation.
 */
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const OpenBattle = require('../models/OpenBattle');
const User = require('../models/User');
const UserSubWallet = require('../models/UserSubWallet');
const WalletTransaction = require('../models/WalletTransaction');
const SubAdminLedger = require('../models/SubAdminLedger');
const SystemSettings = require('../models/SystemSettings');
const Notification = require('../models/Notification');
const AdminLog = require('../models/AdminLog');
const { getIo } = require('../socket/socketInstance');
const { syncUserAggregateBalance } = require('./subAdmin.service');
const logger = require('../utils/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const genBattleCode = () =>
  `LB-${Date.now().toString(36).toUpperCase()}-${uuidv4().split('-')[0].toUpperCase()}`;

const isMainAdmin = (u) => ['admin', 'main_admin'].includes(u?.role);

/** Strip room credentials from a battle doc for lobby/public responses. */
const publicBattleView = (battle) => {
  const o = battle.toObject ? battle.toObject() : battle;
  delete o.roomId;
  delete o.roomPassword;
  delete o.roomUpdatedAt;
  // Redact submissions details in lobby
  o.participants = (o.participants || []).map((p) => ({
    user: p.user,
    joinedAt: p.joinedAt,
    hasSubmitted: p.submission?.claim && p.submission.claim !== 'none',
  }));
  return o;
};

/** Include credentials only for participants of a FULL battle, or admins. */
const canSeeCredentials = (battle, user) => {
  if (!user) return false;
  if (isMainAdmin(user)) return true;
  if (String(battle.subAdmin) === String(user._id)) return true;
  const isParticipant = battle.participants.some(
    (p) => String(p.user) === String(user._id)
  );
  return isParticipant && ['in_progress', 'result_pending', 'disputed', 'completed'].includes(battle.status);
};

const getWalletOrFail = async (userId, subAdminId, entryCoins) => {
  const wallet = await UserSubWallet.getOrCreate(userId, subAdminId);
  if (wallet.balance < entryCoins) {
    const subAdmin = await User.findById(subAdminId).select('subAdminInfo.displayName');
    throw new Error(
      `Insufficient balance under ${subAdmin?.subAdminInfo?.displayName || 'this Sub-Admin'}. Available: ${wallet.balance}, needed: ${entryCoins}. Buy more coins via UPI.`
    );
  }
  return wallet;
};

/** Lock entry coins for a participant. Idempotent per (battle, user). */
const lockEntry = async (userId, subAdminId, battleId, battleCode, entryCoins) => {
  const idempotencyKey = `battle_entry_${battleId}_${userId}`;
  const existing = await WalletTransaction.findOne({ idempotencyKey });
  if (existing) return existing;

  const wallet = await getWalletOrFail(userId, subAdminId, entryCoins);
  const balBefore = wallet.balance;
  wallet.balance -= entryCoins;
  wallet.lockedBattleBalance += entryCoins;
  wallet.totalWagered += entryCoins;
  await wallet.save();
  await syncUserAggregateBalance(userId);

  const tx = await WalletTransaction.create({
    user: userId,
    type: 'battle_entry',
    amount: -entryCoins,
    balanceBefore: balBefore,
    balanceAfter: wallet.balance,
    description: `Entry locked for battle ${battleCode}`,
    subAdmin: subAdminId,
    openBattle: battleId,
    idempotencyKey,
  });
  return tx;
};

// ─── Create ───────────────────────────────────────────────────────────────────

const createBattle = async (userId, data) => {
  const { subAdminId, gameMode, maxPlayers, entryCoins, roomId, roomPassword } = data;

  const settings = await SystemSettings.getSettings();
  if (!roomId || String(roomId).trim().length < 3) {
    throw new Error('Ludo King room ID is required (min 3 characters)');
  }
  if (!settings.enabledGameModes.includes(gameMode)) {
    throw new Error(`Game mode "${gameMode}" is not enabled`);
  }
  if (![2, 4].includes(Number(maxPlayers))) throw new Error('maxPlayers must be 2 or 4');
  if (entryCoins < settings.minBattleCoins) {
    throw new Error(`Minimum battle entry is ${settings.minBattleCoins} coins`);
  }
  if (entryCoins > settings.maxBattleCoins) {
    throw new Error(`Maximum battle entry is ${settings.maxBattleCoins} coins`);
  }

  const subAdmin = await User.findById(subAdminId);
  if (!subAdmin || subAdmin.role !== 'sub_admin' || subAdmin.subAdminInfo?.isActive === false) {
    throw new Error('Sub-Admin not found or inactive');
  }

  // No unfinished battle under the same Sub-Admin as creator
  const activeAsPlayer = await OpenBattle.findOne({
    'participants.user': userId,
    subAdmin: subAdminId,
    status: { $in: ['open', 'in_progress', 'result_pending', 'disputed'] },
  });
  if (activeAsPlayer) {
    throw new Error(`You already have an active battle (${activeAsPlayer.battleCode}) under this Sub-Admin. Finish it first.`);
  }

  const commissionPercent =
    subAdmin.subAdminInfo.commissionPercentOverride ?? settings.battleCommissionPercent;

  const totalPot = entryCoins * maxPlayers;
  const commissionCoins = Math.floor((totalPot * commissionPercent) / 100);
  const winningPrize = totalPot - commissionCoins;

  const battle = await OpenBattle.create({
    battleCode: genBattleCode(),
    subAdmin: subAdminId,
    creator: userId,
    gameMode,
    maxPlayers: Number(maxPlayers),
    entryCoins,
    totalPot,
    commissionPercent,
    commissionCoins,
    winningPrize,
    roomId: String(roomId).trim(),
    roomPassword: String(roomPassword || '').trim(),
    status: 'open',
    participants: [],
  });

  // Creator is participant #1 — lock entry
  try {
    const tx = await lockEntry(userId, subAdminId, battle._id, battle.battleCode, entryCoins);
    battle.participants.push({ user: userId, entryTxId: tx._id, submission: {} });
    await battle.save();
  } catch (err) {
    await OpenBattle.findByIdAndDelete(battle._id);
    throw err;
  }

  const io = getIo();
  if (io) {
    io.to(`lobby:subadmin:${subAdminId}`).emit('battle:created', publicBattleView(await OpenBattle.findById(battle._id)));
  }

  logger.info({ battleId: battle._id, battleCode: battle.battleCode, userId, subAdminId }, 'Open battle created');
  return battle;
};

// ─── Join ─────────────────────────────────────────────────────────────────────

const joinBattle = async (userId, battleId) => {
  const battle = await OpenBattle.findById(battleId);
  if (!battle) throw new Error('Battle not found');
  if (battle.status !== 'open') throw new Error('Battle is no longer open for joining');
  if (battle.participants.length >= battle.maxPlayers) throw new Error('Battle is already full');
  if (battle.participants.some((p) => String(p.user) === String(userId))) {
    throw new Error('You already joined this battle');
  }

  // Same-Sub-Admin matchmaking
  const wallet = await UserSubWallet.findOne({ user: userId, subAdmin: battle.subAdmin });
  if (!wallet || wallet.balance < battle.entryCoins) {
    const subAdmin = await User.findById(battle.subAdmin).select('subAdminInfo.displayName');
    throw new Error(
      `You need coins under ${subAdmin?.subAdminInfo?.displayName || 'this Sub-Admin'} to join this battle. Available: ${wallet?.balance || 0}, needed: ${battle.entryCoins}.`
    );
  }

  const tx = await lockEntry(userId, battle.subAdmin, battle._id, battle.battleCode, battle.entryCoins);
  battle.participants.push({ user: userId, entryTxId: tx._id, submission: {} });

  const io = getIo();

  if (battle.participants.length >= battle.maxPlayers) {
    battle.status = 'in_progress';
    battle.startedAt = new Date();
  }
  await battle.save();

  // Notify lobby + battle room
  if (io) {
    const fresh = await OpenBattle.findById(battle._id);
    io.to(`lobby:subadmin:${battle.subAdmin}`).emit('battle:updated', publicBattleView(fresh));

    if (battle.status === 'in_progress') {
      // Battle is FULL — now reveal room credentials to participants
      io.to(`battle:${battle._id}`).emit('battle:started', {
        battleId: battle._id,
        battleCode: battle.battleCode,
        roomId: battle.roomId,
        roomPassword: battle.roomPassword,
      });
      // Also notify each participant directly (they may not be in the room yet)
      for (const p of battle.participants) {
        if (String(p.user) === String(userId)) continue;
        const notif = await Notification.create({
          recipient: p.user,
          type: 'battle_started',
          title: '🎮 Your battle is full!',
          message: `Battle ${battle.battleCode} is starting. Open it to view the Ludo King room credentials.`,
          data: { battleId: battle._id, battleCode: battle.battleCode },
        }).catch(() => null);
        if (notif) io.to(`user:${p.user}`).emit('notification:new', notif);
      }
    }
  }

  logger.info({ battleId: battle._id, userId }, 'Joined open battle');
  return battle;
};

// ─── Leave / Creator-cancel (open battles only) ───────────────────────────────

const leaveBattle = async (userId, battleId) => {
  const battle = await OpenBattle.findById(battleId);
  if (!battle) throw new Error('Battle not found');
  if (battle.status !== 'open') throw new Error('You can only leave an open (not full) battle');
  if (!battle.participants.some((p) => String(p.user) === String(userId))) {
    throw new Error('You are not in this battle');
  }
  if (String(battle.creator) === String(userId) && battle.participants.length > 1) {
    throw new Error('You created this battle — cancel it instead of leaving');
  }

  return cancelAndRefund(battle, `${userId} left the open battle`, [userId]);
};

// ─── Submit result claim ─────────────────────────────────────────────────────

const submitResult = async (userId, battleId, { claim, screenshotUrl, cancelReason, remarks }) => {
  const battle = await OpenBattle.findById(battleId);
  if (!battle) throw new Error('Battle not found');
  if (!['in_progress', 'result_pending', 'disputed'].includes(battle.status)) {
    throw new Error(`Battle is ${battle.status} — results cannot be submitted`);
  }

  const participant = battle.participants.find((p) => String(p.user) === String(userId));
  if (!participant) throw new Error('You are not a participant of this battle');
  if (participant.submission.claim && participant.submission.claim !== 'none') {
    throw new Error('You already submitted your result for this battle');
  }
  if (claim === 'won' && !screenshotUrl) {
    throw new Error('Screenshot is required when claiming a win');
  }

  participant.submission = {
    claim,
    screenshotUrl: screenshotUrl || '',
    cancelReason: cancelReason || '',
    remarks: remarks || '',
    submittedAt: new Date(),
    verificationStatus: 'pending',
  };

  const allSubmitted = battle.participants.every(
    (p) => p.submission.claim && p.submission.claim !== 'none'
  );

  if (allSubmitted) {
    battle.status = 'result_pending';
    await autoTransition(battle);
  } else {
    await battle.save();
  }

  const io = getIo();
  if (io) {
    io.to(`battle:${battle._id}`).emit('battle:submission', {
      battleId: battle._id,
      userId,
      claim,
    });
    io.to(`subadmin:${battle.subAdmin}`).emit('battle:submission', {
      battleId: battle._id,
      battleCode: battle.battleCode,
      userId,
      claim,
    });
  }

  return battle;
};

/**
 * Auto-transition a result_pending battle.
 * Mutates battle.status / winner. Returns the battle.
 */
const autoTransition = async (battle) => {
  const claims = battle.participants.map((p) => p.submission.claim);
  const wonCount = claims.filter((c) => c === 'won').length;
  const lostCount = claims.filter((c) => c === 'lost').length;
  const cancelCount = claims.filter((c) => c === 'cancel').length;
  const total = claims.length;

  if (cancelCount === total) {
    // Mutual cancel — full refund, 0 commission
    battle.status = 'cancelled';
    battle.cancelledAt = new Date();
    battle.cancelReason = 'Mutual cancel — all participants agreed';
    battle.commissionCoins = 0;
    await battle.save();
    await refundAll(battle, 'Mutual cancel — full refund');
    return battle;
  }

  if (wonCount === 1 && lostCount === total - wonCount) {
    // Clean result — auto finalize
    const winner = battle.participants.find((p) => p.submission.claim === 'won');
    battle.winner = winner.user;
    for (const p of battle.participants) p.submission.verificationStatus = 'approved';
    await finalizeBattle(battle, winner.user, null, 'Auto-verified from unanimous claims');
    return battle;
  }

  // Anything else — dispute, needs Sub-Admin / Main Admin
  battle.status = 'disputed';
  await battle.save();

  const io = getIo();
  if (io) {
    const payload = { battleId: battle._id, battleCode: battle.battleCode, reason: 'Conflicting result claims' };
    io.to(`subadmin:${battle.subAdmin}`).emit('battle:disputed', payload);
    io.to('admin:room').emit('battle:disputed', payload);
  }
  await Notification.create({
    recipient: battle.subAdmin,
    type: 'battle_disputed',
    title: '⚖️ Battle dispute needs your review',
    message: `Battle ${battle.battleCode} has conflicting result claims. Please verify screenshots and resolve.`,
    data: { battleId: battle._id },
  }).catch(() => {});

  return battle;
};

// ─── Settlement ───────────────────────────────────────────────────────────────

/** Pay winner + burn commission. Idempotent. */
const finalizeBattle = async (battle, winnerId, verifiedBy, remarks = '') => {
  if (battle.rewardDistributed) return battle;
  if (battle.status === 'completed') return battle;

  const idempotencyKey = `battle_win_${battle._id}_${winnerId}`;
  const existing = await WalletTransaction.findOne({ idempotencyKey });
  if (existing) return battle;

  battle.status = 'completed';
  battle.winner = winnerId;
  battle.rewardDistributed = true;
  battle.completedAt = new Date();
  battle.verifiedBy = verifiedBy;
  battle.adminRemarks = remarks;
  if (verifiedBy) battle.verifiedByRole = 'admin';
  await battle.save();

  // Release escrow for every participant
  for (const p of battle.participants) {
    const wallet = await UserSubWallet.getOrCreate(p.user, battle.subAdmin);
    wallet.lockedBattleBalance = Math.max(0, wallet.lockedBattleBalance - battle.entryCoins);
    if (String(p.user) === String(winnerId)) {
      wallet.balance += battle.winningPrize;
      wallet.totalWon += battle.winningPrize;
    }
    await wallet.save();
    await syncUserAggregateBalance(p.user);
  }

  // Winner transaction
  const winnerWallet = await UserSubWallet.findOne({ user: winnerId, subAdmin: battle.subAdmin });
  await WalletTransaction.create({
    user: winnerId,
    type: 'battle_win',
    amount: battle.winningPrize,
    balanceBefore: winnerWallet.balance - battle.winningPrize,
    balanceAfter: winnerWallet.balance,
    description: `Won battle ${battle.battleCode} (pot ${battle.totalPot}, commission ${battle.commissionCoins} @ ${battle.commissionPercent}%)`,
    subAdmin: battle.subAdmin,
    openBattle: battle._id,
    adjustedBy: verifiedBy || undefined,
    idempotencyKey,
  });

  // Commission BURNED — recorded on sub-admin for the audit equation
  if (battle.commissionCoins > 0) {
    await User.findByIdAndUpdate(battle.subAdmin, {
      $inc: { 'subAdminInfo.totalCommissionEarned': battle.commissionCoins },
    });
    await SubAdminLedger.create({
      subAdmin: battle.subAdmin,
      type: 'battle_commission_recorded',
      amount: 0,
      stockBefore: 0,
      stockAfter: 0,
      commissionAmount: battle.commissionCoins,
      battle: battle._id,
      actedBy: verifiedBy || battle.creator,
      remarks: `Commission burned from battle ${battle.battleCode}`,
      idempotencyKey: `battle_comm_${battle._id}`,
    });
  }

  // Notify participants
  const io = getIo();
  if (io) {
    io.to(`lobby:subadmin:${battle.subAdmin}`).emit('battle:completed', { battleId: battle._id, battleCode: battle.battleCode });
    for (const p of battle.participants) {
      io.to(`user:${p.user}`).emit('battle:result', {
        battleId: battle._id,
        battleCode: battle.battleCode,
        isWinner: String(p.user) === String(winnerId),
        winningPrize: battle.winningPrize,
      });
      io.to(`user:${p.user}`).emit('wallet:updated', {});
    }
  }

  logger.info({ battleId: battle._id, winnerId }, 'Battle finalized');
  return battle;
};

/** Refund specific users (locked entry back to balance). */
const refundUsers = async (battle, userIds, reason) => {
  for (const uid of userIds) {
    const idempotencyKey = `battle_refund_${battle._id}_${uid}`;
    const existing = await WalletTransaction.findOne({ idempotencyKey });
    if (existing) continue;

    const wallet = await UserSubWallet.getOrCreate(uid, battle.subAdmin);
    const balBefore = wallet.balance;
    wallet.balance += battle.entryCoins;
    wallet.lockedBattleBalance = Math.max(0, wallet.lockedBattleBalance - battle.entryCoins);
    await wallet.save();
    await syncUserAggregateBalance(uid);

    await WalletTransaction.create({
      user: uid,
      type: 'battle_refund',
      amount: battle.entryCoins,
      balanceBefore: balBefore,
      balanceAfter: wallet.balance,
      description: `Refund: ${reason} (${battle.battleCode})`,
      subAdmin: battle.subAdmin,
      openBattle: battle._id,
      idempotencyKey,
    });
  }
};

const refundAll = async (battle, reason) => {
  await refundUsers(battle, battle.participants.map((p) => p.user), reason);
  battle.refundDistributed = true;
  await battle.save();

  const io = getIo();
  if (io) {
    io.to(`lobby:subadmin:${battle.subAdmin}`).emit('battle:cancelled', { battleId: battle._id, battleCode: battle.battleCode });
    for (const p of battle.participants) {
      io.to(`user:${p.user}`).emit('battle:result', {
        battleId: battle._id,
        battleCode: battle.battleCode,
        refunded: true,
        amount: battle.entryCoins,
      });
      io.to(`user:${p.user}`).emit('wallet:updated', {});
    }
  }
};

/** Cancel + refund given users; if nobody remains → battle cancelled. */
const cancelAndRefund = async (battle, reason, userIdsToRefund) => {
  await refundUsers(battle, userIdsToRefund, reason);

  // Remove refunded users from the battle
  battle.participants = battle.participants.filter(
    (p) => !userIdsToRefund.some((u) => String(u) === String(p.user))
  );
  const remaining = battle.participants;

  if (remaining.length === 0) {
    battle.status = 'cancelled';
    battle.cancelledAt = new Date();
    battle.cancelReason = reason;
    battle.refundDistributed = true;
    await battle.save();
    const io = getIo();
    if (io) io.to(`lobby:subadmin:${battle.subAdmin}`).emit('battle:cancelled', { battleId: battle._id, battleCode: battle.battleCode });
  } else {
    // Creator left — hand over creation rights to the next participant
    if (userIdsToRefund.some((u) => String(u) === String(battle.creator))) {
      battle.creator = remaining[0].user;
    }
    await battle.save();
  }

  for (const uid of userIdsToRefund) {
    const io = getIo();
    if (io) io.to(`user:${uid}`).emit('wallet:updated', {});
  }
  return battle;
};

// ─── Admin resolution of disputes ─────────────────────────────────────────────

const resolveDispute = async (actingUser, battleId, { decision, winnerId, remarks }) => {
  const battle = await OpenBattle.findById(battleId);
  if (!battle) throw new Error('Battle not found');
  if (battle.status !== 'disputed' && battle.status !== 'result_pending') {
    throw new Error(`Battle is ${battle.status} — nothing to resolve`);
  }
  if (!isMainAdmin(actingUser) && String(actingUser._id) !== String(battle.subAdmin)) {
    throw new Error('Only the owning Sub-Admin or Main Admin can resolve disputes');
  }

  if (decision === 'cancel') {
    battle.status = 'cancelled';
    battle.cancelledAt = new Date();
    battle.cancelReason = remarks || 'Cancelled by admin after dispute';
    battle.commissionCoins = 0;
    battle.winner = null;
    await battle.save();
    await refundAll(battle, 'Admin cancelled battle — full refund');
  } else if (decision === 'winner') {
    if (!winnerId) throw new Error('winnerId is required for winner decision');
    if (!battle.participants.some((p) => String(p.user) === String(winnerId))) {
      throw new Error('Winner must be a participant of this battle');
    }
    for (const p of battle.participants) {
      p.submission.verificationStatus =
        String(p.user) === String(winnerId) ? 'approved' : 'rejected';
    }
    await finalizeBattle(battle, winnerId, actingUser._id, remarks || 'Resolved by admin');
  } else {
    throw new Error('decision must be "winner" or "cancel"');
  }

  await AdminLog.create({
    admin: actingUser._id,
    action: 'resolve_battle_dispute',
    targetType: 'battle',
    targetId: battle._id,
    details: { decision, winnerId, remarks },
    ipAddress: '',
  }).catch(() => {});

  return battle;
};

// ─── Queries ──────────────────────────────────────────────────────────────────

const listBattles = async (filter = {}, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [battles, total] = await Promise.all([
    OpenBattle.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('creator', 'username')
      .populate('subAdmin', 'username subAdminInfo.displayName')
      .lean(),
    OpenBattle.countDocuments(filter),
  ]);
  return { battles: battles.map(publicBattleView), total, page, pages: Math.ceil(total / limit) };
};

const getBattleDetail = async (user, battleId) => {
  const battle = await OpenBattle.findById(battleId)
    .populate('creator', 'username')
    .populate('subAdmin', 'username subAdminInfo.displayName')
    .populate('winner', 'username');
  if (!battle) throw new Error('Battle not found');

  const view = publicBattleView(battle);
  if (canSeeCredentials(battle, user)) {
    view.roomId = battle.roomId;
    view.roomPassword = battle.roomPassword;
    view.roomUpdatedAt = battle.roomUpdatedAt;
  }
  // Full submission detail only for participants / admins
  if (
    isMainAdmin(user) ||
    String(battle.subAdmin) === String(user._id) ||
    battle.participants.some((p) => String(p.user) === String(user._id))
  ) {
    view.participants = battle.participants.map((p) => ({
      user: p.user,
      joinedAt: p.joinedAt,
      submission: p.submission,
    }));
  }
  return view;
};

module.exports = {
  createBattle,
  joinBattle,
  leaveBattle,
  submitResult,
  resolveDispute,
  listBattles,
  getBattleDetail,
  publicBattleView,
  canSeeCredentials,
};
