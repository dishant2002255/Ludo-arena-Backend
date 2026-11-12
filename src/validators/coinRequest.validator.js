const { z } = require('zod');

const submitCoinRequestSchema = z.object({
  requestedAmount: z
    .number({ invalid_type_error: 'requestedAmount must be a number' })
    .int('Must be a whole number')
    .min(200, 'Minimum request is 200 coins')
    .max(10000, 'Maximum request is 10,000 coins'),
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason cannot exceed 500 characters'),
});

const reviewCoinRequestSchema = z.object({
  remarks: z.string().max(500).optional().default(''),
});

module.exports = { submitCoinRequestSchema, reviewCoinRequestSchema };
