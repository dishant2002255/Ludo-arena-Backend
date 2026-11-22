const { z } = require('zod');

const createSubAdminSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters'),
  displayName: z.string().min(2).max(50).optional(),
  phone: z.string().max(20).optional(),
  upiId: z
    .string()
    .trim()
    .regex(/^[\w.\-]{2,}@[a-zA-Z]{2,}$/, 'Invalid UPI ID format (expected name@bank)')
    .optional()
    .or(z.literal('')),
  upiName: z.string().max(100).optional(),
  upiEnabled: z.boolean().optional().default(false),
  commissionPercentOverride: z.number().min(0).max(50).nullable().optional(),
  initialCoins: z.number().int().min(0).max(1000000).optional().default(0),
});

const issueCoinsSchema = z.object({
  amount: z
    .number({ invalid_type_error: 'amount must be a number' })
    .int('Amount must be a whole number')
    .min(1, 'Minimum issue amount is 1 coin')
    .max(1000000, 'Maximum issue amount is 1,000,000 coins'),
  remarks: z.string().max(500).optional().default(''),
});

const upiSettingsSchema = z.object({
  upiEnabled: z.boolean().optional(),
  upiId: z
    .string()
    .trim()
    .regex(/^[\w.\-]{2,}@[a-zA-Z]{2,}$/, 'Invalid UPI ID format (expected name@bank)')
    .optional()
    .or(z.literal('')),
  upiName: z.string().max(100).optional(),
  upiNote: z.string().max(200).optional(),
});

module.exports = { createSubAdminSchema, issueCoinsSchema, upiSettingsSchema };
