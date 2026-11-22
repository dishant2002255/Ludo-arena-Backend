const { z } = require('zod');

const createBattleSchema = z.object({
  subAdminId: z.string().min(1, 'subAdminId is required'),
  gameMode: z.enum(['classic', 'quick', 'one_kill', 'popular'], {
    message: 'gameMode must be classic, quick, one_kill or popular',
  }),
  maxPlayers: z.coerce.number().int().refine((v) => v === 2 || v === 4, {
    message: 'maxPlayers must be 2 or 4',
  }),
  entryCoins: z.coerce
    .number({ invalid_type_error: 'entryCoins must be a number' })
    .int('Entry must be a whole number')
    .min(1, 'Minimum entry is 1 coin'),
  roomId: z.string().trim().min(3, 'Ludo King room ID is required (min 3 characters)').max(30),
  roomPassword: z.string().trim().max(30).optional().default(''),
});

const submitResultSchema = z.object({
  claim: z.enum(['won', 'lost', 'cancel'], { message: 'claim must be won, lost or cancel' }),
  screenshotUrl: z.string().max(500).optional().default(''),
  cancelReason: z.string().max(300).optional().default(''),
  remarks: z.string().max(300).optional().default(''),
});

const resolveDisputeSchema = z
  .object({
    decision: z.enum(['winner', 'cancel'], { message: 'decision must be winner or cancel' }),
    winnerId: z.string().optional(),
    remarks: z.string().max(500).optional().default(''),
  })
  .refine((d) => d.decision !== 'winner' || (d.winnerId && d.winnerId.length > 0), {
    message: 'winnerId is required when decision is winner',
    path: ['winnerId'],
  });

module.exports = { createBattleSchema, submitResultSchema, resolveDisputeSchema };
