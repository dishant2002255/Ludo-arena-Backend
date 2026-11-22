const { z } = require('zod');

const createWithdrawalSchema = z
  .object({
    subAdminId: z.string().min(1, 'subAdminId is required'),
    amountCoins: z.coerce
      .number({ invalid_type_error: 'amountCoins must be a number' })
      .int('Amount must be a whole number')
      .min(1, 'Minimum withdrawal is 1 coin'),
    payoutMethod: z.enum(['upi', 'bank'], { message: 'payoutMethod must be upi or bank' }).default('upi'),
    userUpiId: z
      .string()
      .trim()
      .regex(/^[\w.\-]{2,}@[a-zA-Z]{2,}$/, 'Invalid UPI ID format (expected name@bank)')
      .optional()
      .or(z.literal('')),
    accountHolderName: z.string().min(2, 'Account holder name is required').max(100),
    bankAccountNumber: z.string().max(40).optional().or(z.literal('')),
    bankIfsc: z
      .string()
      .trim()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC format')
      .optional()
      .or(z.literal('')),
  })
  .refine((d) => d.payoutMethod !== 'upi' || (d.userUpiId && d.userUpiId.length > 0), {
    message: 'UPI ID is required for UPI payouts',
    path: ['userUpiId'],
  })
  .refine(
    (d) =>
      d.payoutMethod !== 'bank' ||
      (d.bankAccountNumber && d.bankAccountNumber.length > 0 && d.bankIfsc && d.bankIfsc.length > 0),
    { message: 'Bank account number and IFSC are required for bank payouts', path: ['bankAccountNumber'] }
  );

const approveWithdrawalSchema = z.object({
  utrReference: z
    .string()
    .trim()
    .min(6, 'UTR reference must be at least 6 characters')
    .max(30, 'UTR reference cannot exceed 30 characters'),
  adminRemarks: z.string().max(500).optional().default(''),
});

const rejectWithdrawalSchema = z.object({
  adminRemarks: z
    .string()
    .trim()
    .min(5, 'Rejection remarks required (min 5 characters)')
    .max(500, 'Remarks cannot exceed 500 characters'),
});

module.exports = { createWithdrawalSchema, approveWithdrawalSchema, rejectWithdrawalSchema };
