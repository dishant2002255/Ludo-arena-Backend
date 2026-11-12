/**
 * Tournament Service — business logic for tournament lifecycle.
 */

const Tournament = require('../models/Tournament');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AdminLog = require('../models/AdminLog');
const { creditTournamentReward } = require('./wallet.service');
const { emitNotification, emitWalletUpdate, getIo } = require('../socket/socketInstance');
const logger = require('../utils/logger');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const logAdminAction = async (adminId, action, targetId, details, ip = '') => {
  try {
    await AdminLog.create({
      admin: adminId,
      action,
      targetType: 'tournament',
      targetId,
      details,
      ipAddress: ip,
    });
  } catch {}
};

const broadcastToParticipants = async (tournament, eventName, payload) => {
  const io = getIo();
  if (!io) return;
  for (const p of tournament.participants) {
    io.to(`user:${p.user.toString()}`).emit(eventName, payload);
  }
};

const notifyParticipants = async (tournament, type, title, message, adminId = null, extraData = {}) => {
  const notifications = tournament.participants.map((p) => ({
    recipient: p.user,
    type,
    title,
    message,
    sentBy: adminId,
    data: { tournamentId: tournament._id, ...extraData },
  }));
  const created = await Notification.insertMany(notifications);
  for (const n of created) {
    emitNotification(n.recipient.toString(), n);
  }
};

// ─── Tournament CRUD ──────────────────────────────────────────────────────────

const createTournament = async (adminId, data, bannerUrl = '') => {
  const tournament = await Tournament.create({
    ...data,
    createdBy: adminId,
    bannerUrl,
    status: 'draft',
    registrationOpen: false,
  });
  await logAdminAction(adminId, 'create_tournament', tournament._id, { title: tournament.title });

  const io = getIo();
  if (io) io.emit('tournament:created', { tournament });

  return tournament;
};

const updateTournament = async (tournamentId, adminId, updates, bannerUrl) => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status === 'completed' || tournament.status === 'cancelled') {
    throw new Error('Cannot edit a completed or cancelled tournament');
  }

  const allowedFields = ['title', 'description', 'rules', 'winnerReward'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) tournament[field] = updates[field];
  }
  if (bannerUrl) tournament.bannerUrl = bannerUrl;

  await tournament.save();
  await logAdminAction(adminId, 'update_tournament', tournament._id, updates);
  return tournament;
};

const toggleRegistration = async (tournamentId, adminId, open) => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status === 'completed' || tournament.status === 'cancelled') {
    throw new Error('Cannot modify a completed or cancelled tournament');
  }

  tournament.registrationOpen = open;
  if (open && tournament.status === 'draft') tournament.status = 'open';
  if (!open && tournament.status === 'open') tournament.status = 'draft';

  await tournament.save();
  await logAdminAction(adminId, open ? 'open_registration' : 'close_registration', tournament._id, {});
  return tournament;
};

const cancelTournament = async (tournamentId, adminId, reason = '') => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status === 'completed') throw new Error('Cannot cancel a completed tournament');

  tournament.status = 'cancelled';
  tournament.registrationOpen = false;
  tournament.cancelledAt = new Date();
  tournament.cancelReason = reason;
  await tournament.save();

  await logAdminAction(adminId, 'cancel_tournament', tournament._id, { reason });
  await notifyParticipants(
    tournament,
    'tournament_cancelled',
    'Tournament Cancelled',
    `The tournament "${tournament.title}" has been cancelled.${reason ? ` Reason: ${reason}` : ''}`,
    adminId,
    {}
  );

  const io = getIo();
  if (io) io.to(`tournament:${tournamentId}`).emit('tournament:cancelled', { tournamentId, reason });

  return tournament;
};

// ─── Participant Join ─────────────────────────────────────────────────────────

const joinTournament = async (tournamentId, userId) => {
  // Use findOneAndUpdate for atomic slot reservation
  const tournament = await Tournament.findOneAndUpdate(
    {
      _id: tournamentId,
      status: 'open',
      registrationOpen: true,
      $expr: { $lt: [{ $size: '$participants' }, '$requiredPlayers'] },
      'participants.user': { $ne: userId },
    },
    {
      $push: { participants: { user: userId, joinedAt: new Date() } },
    },
    { new: true }
  ).populate('participants.user', 'username avatar');

  if (!tournament) {
    // Determine which constraint failed for a useful error message
    const existing = await Tournament.findById(tournamentId);
    if (!existing) throw new Error('Tournament not found');
    if (existing.status !== 'open') throw new Error('Tournament is not open for registration');
    if (!existing.registrationOpen) throw new Error('Registration is closed');
    if (existing.participants.some((p) => p.user.toString() === userId.toString())) {
      throw new Error('You are already registered for this tournament');
    }
    throw new Error('Tournament is full');
  }

  // Notify all current participants about the new join
  const io = getIo();
  if (io) io.to(`tournament:${tournamentId}`).emit('tournament:joined', { tournament, userId });

  // Send notification to the joiner
  const user = await User.findById(userId).select('username');
  await Notification.create({
    recipient: userId,
    type: 'tournament_joined',
    title: 'Tournament Joined!',
    message: `You have successfully joined "${tournament.title}". Waiting for ${tournament.requiredPlayers - tournament.participants.length} more player(s).`,
    data: { tournamentId: tournament._id },
  });

  // Check if full
  if (tournament.participants.length >= tournament.requiredPlayers) {
    await _onTournamentFull(tournament);
  }

  return tournament;
};

const _onTournamentFull = async (tournament) => {
  tournament.status = 'waiting_for_admin';
  tournament.registrationOpen = false;
  await tournament.save();

  const io = getIo();
  if (io) {
    io.to(`tournament:${tournament._id.toString()}`).emit('tournament:full', {
      tournamentId: tournament._id,
    });
    // Notify admin room
    io.to('admin:room').emit('tournament:waiting', {
      tournamentId: tournament._id,
      title: tournament.title,
    });
  }

  await notifyParticipants(
    tournament,
    'tournament_full',
    '🎮 All Players Joined!',
    `All 4 players have joined "${tournament.title}". Waiting for admin to publish room details.`,
    null,
    {}
  );

  logger.info({ tournamentId: tournament._id }, 'Tournament full — waiting for admin');
};

// ─── Room Publishing ──────────────────────────────────────────────────────────

const publishRoomDetails = async (tournamentId, adminId, roomData, ip = '') => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'waiting_for_admin') {
    throw new Error('Tournament must be in waiting_for_admin status to publish room');
  }

  const wasPublished = !!tournament.externalRoomId;

  tournament.externalPlatform = roomData.externalPlatform || 'Ludo King';
  tournament.externalRoomId = roomData.externalRoomId;
  tournament.externalRoomPassword = roomData.externalRoomPassword || '';
  tournament.roomInstructions = roomData.roomInstructions || '';
  tournament.roomNotes = roomData.roomNotes || '';
  tournament.status = 'room_published';
  tournament.roomPublishedAt = new Date();
  tournament.roomPublishedBy = adminId;

  await tournament.save();

  await logAdminAction(adminId, wasPublished ? 'update_room_credentials' : 'publish_room', tournamentId, {
    platform: roomData.externalPlatform,
    roomId: roomData.externalRoomId,
  }, ip);

  // Notify all participants
  await notifyParticipants(
    tournament,
    'tournament_room_published',
    '🏆 Room Details Published!',
    `Admin has published the Ludo room for "${tournament.title}". Check your tournament page for room details.`,
    adminId,
    { platform: roomData.externalPlatform }
  );

  const io = getIo();
  if (io) {
    io.to(`tournament:${tournamentId}`).emit('tournament:room-published', {
      tournamentId,
    });
  }

  return tournament;
};

// ─── Screenshot Submission ────────────────────────────────────────────────────

const submitResult = async (tournamentId, userId, screenshotUrl, originalName, claimedResult, remarks = '') => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (!['room_published', 'result_pending'].includes(tournament.status)) {
    throw new Error('Tournament is not in a state to accept result submissions');
  }

  const isParticipant = tournament.participants.some((p) => p.user.toString() === userId.toString());
  if (!isParticipant) throw new Error('Only registered participants can submit results');

  // Update or create submission for this user
  const existingIdx = tournament.submissions.findIndex((s) => s.user.toString() === userId.toString());
  const submissionData = {
    user: userId,
    screenshotUrl,
    screenshotOriginalName: originalName,
    claimedResult,
    remarks,
    submittedAt: new Date(),
    status: 'submitted',
    adminRemarks: '',
    reviewedBy: null,
    reviewedAt: null,
  };

  if (existingIdx >= 0) {
    // Replace
    tournament.submissions[existingIdx] = submissionData;
  } else {
    tournament.submissions.push(submissionData);
  }

  if (tournament.status === 'room_published') {
    tournament.status = 'result_pending';
  }

  await tournament.save();

  // Notify admin
  const io = getIo();
  if (io) io.to('admin:room').emit('tournament:result-submitted', { tournamentId, userId });

  logger.info({ tournamentId, userId }, 'Result submitted');
  return tournament;
};

// ─── Admin Result Verification ────────────────────────────────────────────────

const verifySubmission = async (tournamentId, submissionId, adminId, status, adminRemarks = '', ip = '') => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const sub = tournament.submissions.id(submissionId);
  if (!sub) throw new Error('Submission not found');

  sub.status = status;
  sub.adminRemarks = adminRemarks;
  sub.reviewedBy = adminId;
  sub.reviewedAt = new Date();

  await tournament.save();

  await logAdminAction(adminId, `verify_submission_${status}`, tournamentId, {
    submissionId,
    adminRemarks,
  }, ip);

  // Notify the user
  const statusMessages = {
    approved: 'Your result submission has been approved ✅',
    rejected: 'Your result submission was rejected.',
    resubmission_required: 'Admin has requested another screenshot from you.',
  };
  const notif = await Notification.create({
    recipient: sub.user,
    type: 'tournament_verification_updated',
    title: 'Submission Update',
    message: `${statusMessages[status]}${adminRemarks ? ` Remarks: ${adminRemarks}` : ''}`,
    sentBy: adminId,
    data: { tournamentId, submissionId, status },
  });
  emitNotification(sub.user.toString(), notif);

  const io = getIo();
  if (io) io.to(`tournament:${tournamentId}`).emit('tournament:verification-updated', { tournamentId });

  return tournament;
};

const finalizeTournament = async (tournamentId, adminId, winnerUserId, verificationRemarks = '', ip = '') => {
  const tournament = await Tournament.findById(tournamentId).populate('participants.user', 'username');
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status === 'completed') throw new Error('Tournament already completed');
  if (tournament.rewardDistributed) throw new Error('Reward already distributed');

  // Validate winner is a participant
  const isParticipant = tournament.participants.some((p) => p.user._id.toString() === winnerUserId.toString());
  if (!isParticipant) throw new Error('Winner must be a registered participant');

  tournament.verifiedWinner = winnerUserId;
  tournament.verificationRemarks = verificationRemarks;
  tournament.status = 'completed';
  tournament.completedAt = new Date();
  tournament.rewardDistributed = false; // will be set after credit

  // Build final results
  tournament.finalResults = tournament.participants.map((p) => ({
    user: p.user._id,
    rank: p.user._id.toString() === winnerUserId.toString() ? 1 : 2,
    result: p.user._id.toString() === winnerUserId.toString() ? 'winner' : 'lost',
  }));

  await tournament.save();

  // Credit winner coins
  if (tournament.winnerReward > 0) {
    await creditTournamentReward(winnerUserId, tournament.winnerReward, tournamentId);
    const updatedWinner = await User.findById(winnerUserId).select('walletBalance');
    emitWalletUpdate(winnerUserId.toString(), {
      newBalance: updatedWinner.walletBalance,
      amount: tournament.winnerReward,
    });
  }

  tournament.rewardDistributed = true;
  await tournament.save();

  // Update user stats
  for (const p of tournament.participants) {
    const isWinner = p.user._id.toString() === winnerUserId.toString();
    await User.findByIdAndUpdate(p.user._id, {
      $inc: {
        totalMatches: 1,
        totalWins: isWinner ? 1 : 0,
        totalLosses: isWinner ? 0 : 1,
      },
    });
  }

  await logAdminAction(adminId, 'finalize_tournament', tournamentId, {
    winnerUserId,
    verificationRemarks,
  }, ip);

  // Notify all participants
  await notifyParticipants(
    tournament,
    'tournament_completed',
    '🏆 Tournament Completed!',
    `"${tournament.title}" has been completed. ${tournament.winnerReward > 0 ? `Winner receives ${tournament.winnerReward} coins.` : ''}`,
    adminId,
    { winnerUserId }
  );

  const io = getIo();
  if (io) {
    io.to(`tournament:${tournamentId}`).emit('tournament:completed', {
      tournamentId,
      winnerUserId,
    });
  }

  logger.info({ tournamentId, winnerUserId }, 'Tournament finalized');
  return tournament;
};

// ─── Queries ──────────────────────────────────────────────────────────────────

const getTournamentForParticipant = async (tournamentId, userId) => {
  const tournament = await Tournament.findById(tournamentId)
    .populate('participants.user', 'username avatar')
    .populate('verifiedWinner', 'username avatar')
    .populate('createdBy', 'username')
    .lean();

  if (!tournament) return null;

  const isParticipant = tournament.participants.some(
    (p) => p.user._id.toString() === userId.toString()
  );

  // Redact room credentials for non-participants
  if (!isParticipant) {
    tournament.externalRoomId = '';
    tournament.externalRoomPassword = '';
  }

  return { tournament, isParticipant };
};

module.exports = {
  createTournament,
  updateTournament,
  toggleRegistration,
  cancelTournament,
  joinTournament,
  publishRoomDetails,
  submitResult,
  verifySubmission,
  finalizeTournament,
  getTournamentForParticipant,
};
