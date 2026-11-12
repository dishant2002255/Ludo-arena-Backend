const { z } = require('zod');

const createTournamentSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(150),
  description: z.string().max(2000).optional().default(''),
  rules: z.string().max(5000).optional().default(''),
  winnerReward: z.number().int().min(0).optional().default(0),
});

const updateTournamentSchema = createTournamentSchema.partial();

const publishRoomSchema = z.object({
  externalPlatform: z.string().min(1).max(100).optional().default('Ludo King'),
  externalRoomId: z.string().min(1, 'Room ID is required').max(100),
  externalRoomPassword: z.string().max(100).optional().default(''),
  roomInstructions: z.string().max(1000).optional().default(''),
  roomNotes: z.string().max(500).optional().default(''),
});

const submitResultSchema = z.object({
  claimedResult: z.enum(['winner', 'lost'], { errorMap: () => ({ message: 'Must be winner or lost' }) }),
  remarks: z.string().max(500).optional().default(''),
});

const verifySubmissionSchema = z.object({
  submissionId: z.string().min(1, 'Submission ID required'),
  status: z.enum(['approved', 'rejected', 'resubmission_required']),
  adminRemarks: z.string().max(500).optional().default(''),
});

const finalizeResultSchema = z.object({
  winnerUserId: z.string().min(1, 'Winner user ID required'),
  verificationRemarks: z.string().max(1000).optional().default(''),
});

module.exports = {
  createTournamentSchema,
  updateTournamentSchema,
  publishRoomSchema,
  submitResultSchema,
  verifySubmissionSchema,
  finalizeResultSchema,
};
