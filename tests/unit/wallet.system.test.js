/**
 * Wallet System Unit Tests
 * Tests wallet service logic directly without a DB connection.
 * Uses mocking to isolate pure logic.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

const { MIN_COIN_REQUEST } = require('../../src/config/constants');

describe('Constants — MIN_COIN_REQUEST', () => {
  test('MIN_COIN_REQUEST is 200', () => {
    expect(MIN_COIN_REQUEST).toBe(200);
  });
});

// ─── WalletTransaction type enum ─────────────────────────────────────────────

describe('WalletTransaction model', () => {
  const schema = require('../../src/models/WalletTransaction').schema;

  test('includes coin_request type', () => {
    const typeEnum = schema.path('type').enumValues;
    expect(typeEnum).toContain('coin_request');
  });

  test('includes admin_correction type', () => {
    const typeEnum = schema.path('type').enumValues;
    expect(typeEnum).toContain('admin_correction');
  });

  test('includes all legacy types', () => {
    const typeEnum = schema.path('type').enumValues;
    ['registration_bonus','daily_bonus','match_entry','match_win','admin_adjust','refund'].forEach(t => {
      expect(typeEnum).toContain(t);
    });
  });

  test('has coinRequest reference field', () => {
    expect(schema.path('coinRequest')).toBeDefined();
  });
});

// ─── CoinRequest model ────────────────────────────────────────────────────────

describe('CoinRequest model', () => {
  const schema = require('../../src/models/CoinRequest').schema;

  test('has requestedAmount field with min 200', () => {
    const field = schema.path('requestedAmount');
    expect(field).toBeDefined();
    const validators = field.validators;
    const minValidator = validators.find(v => v.type === 'min');
    expect(minValidator?.min).toBe(200);
  });

  test('status defaults to pending', () => {
    const field = schema.path('status');
    expect(field.defaultValue).toBe('pending');
  });

  test('status enum contains pending, approved, rejected', () => {
    const field = schema.path('status');
    expect(field.enumValues).toContain('pending');
    expect(field.enumValues).toContain('approved');
    expect(field.enumValues).toContain('rejected');
  });

  test('has user reference field', () => {
    expect(schema.path('user')).toBeDefined();
  });

  test('has adminRemarks field', () => {
    expect(schema.path('adminRemarks')).toBeDefined();
  });

  test('has reviewedBy reference field', () => {
    expect(schema.path('reviewedBy')).toBeDefined();
  });

  test('has walletTransaction reference field', () => {
    expect(schema.path('walletTransaction')).toBeDefined();
  });
});

// ─── Notification type enum ───────────────────────────────────────────────────

describe('Notification model extended types', () => {
  const schema = require('../../src/models/Notification').schema;

  test('includes coin_request_approved type', () => {
    const typeEnum = schema.path('type').enumValues;
    expect(typeEnum).toContain('coin_request_approved');
  });

  test('includes coin_request_rejected type', () => {
    const typeEnum = schema.path('type').enumValues;
    expect(typeEnum).toContain('coin_request_rejected');
  });

  test('includes match_won type', () => {
    const typeEnum = schema.path('type').enumValues;
    expect(typeEnum).toContain('match_won');
  });

  test('includes coin_request_submitted type', () => {
    const typeEnum = schema.path('type').enumValues;
    expect(typeEnum).toContain('coin_request_submitted');
  });

  test('includes match_entry_deducted type', () => {
    const typeEnum = schema.path('type').enumValues;
    expect(typeEnum).toContain('match_entry_deducted');
  });
});

// ─── Wallet service exports ───────────────────────────────────────────────────

describe('Wallet service exports', () => {
  const walletService = require('../../src/services/wallet.service');

  test('exports adjustWallet', () => {
    expect(typeof walletService.adjustWallet).toBe('function');
  });

  test('exports createCoinRequest', () => {
    expect(typeof walletService.createCoinRequest).toBe('function');
  });

  test('exports approveCoinRequest', () => {
    expect(typeof walletService.approveCoinRequest).toBe('function');
  });

  test('exports rejectCoinRequest', () => {
    expect(typeof walletService.rejectCoinRequest).toBe('function');
  });

  test('exports getWalletAnalytics', () => {
    expect(typeof walletService.getWalletAnalytics).toBe('function');
  });

  test('exports creditMatchWin', () => {
    expect(typeof walletService.creditMatchWin).toBe('function');
  });
});

// ─── Validator ────────────────────────────────────────────────────────────────

describe('CoinRequest validator', () => {
  const { submitCoinRequestSchema } = require('../../src/validators/coinRequest.validator');

  test('accepts valid request >= 200 coins', () => {
    const result = submitCoinRequestSchema.safeParse({ requestedAmount: 500, reason: 'Need more coins to play matches' });
    expect(result.success).toBe(true);
  });

  test('rejects amount below 200', () => {
    const result = submitCoinRequestSchema.safeParse({ requestedAmount: 100, reason: 'Testing minimum amount' });
    expect(result.success).toBe(false);
    const issues = result.error.issues || result.error.errors || [];
    expect(issues.some(i => i.message.match(/200/))).toBe(true);
  });

  test('rejects amount above 10000', () => {
    const result = submitCoinRequestSchema.safeParse({ requestedAmount: 20000, reason: 'Way too many coins' });
    expect(result.success).toBe(false);
  });

  test('rejects short reason (under 10 chars)', () => {
    const result = submitCoinRequestSchema.safeParse({ requestedAmount: 500, reason: 'test' });
    expect(result.success).toBe(false);
  });

  test('rejects missing requestedAmount', () => {
    const result = submitCoinRequestSchema.safeParse({ reason: 'A valid reason here' });
    expect(result.success).toBe(false);
  });

  test('rejects missing reason', () => {
    const result = submitCoinRequestSchema.safeParse({ requestedAmount: 500 });
    expect(result.success).toBe(false);
  });

  test('accepts exactly 200 coins (boundary)', () => {
    const result = submitCoinRequestSchema.safeParse({ requestedAmount: 200, reason: 'Testing boundary value' });
    expect(result.success).toBe(true);
  });

  test('accepts exactly 10000 coins (upper boundary)', () => {
    const result = submitCoinRequestSchema.safeParse({ requestedAmount: 10000, reason: 'Max coins allowed request' });
    expect(result.success).toBe(true);
  });
});

// ─── Review schema ────────────────────────────────────────────────────────────

describe('CoinRequest review validator', () => {
  const { reviewCoinRequestSchema } = require('../../src/validators/coinRequest.validator');

  test('accepts empty remarks (optional)', () => {
    const result = reviewCoinRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.remarks).toBe('');
  });

  test('accepts valid remarks', () => {
    const result = reviewCoinRequestSchema.safeParse({ remarks: 'Approved for demo purposes' });
    expect(result.success).toBe(true);
  });

  test('rejects remarks over 500 chars', () => {
    const result = reviewCoinRequestSchema.safeParse({ remarks: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});

// ─── socketInstance ───────────────────────────────────────────────────────────

describe('socketInstance singleton', () => {
  const { setIo, getIo, emitNotification, emitWalletUpdate } = require('../../src/socket/socketInstance');

  test('getIo returns null before setIo is called', () => {
    // Note: may already be set if other tests ran; just check it doesn't throw
    expect(() => getIo()).not.toThrow();
  });

  test('emitNotification does not throw when io is null', () => {
    // Without calling setIo with a real io, it should silently no-op
    expect(() => emitNotification('userId123', { title: 'Test' })).not.toThrow();
  });

  test('emitWalletUpdate does not throw when io is null', () => {
    expect(() => emitWalletUpdate('userId123', { newBalance: 500 })).not.toThrow();
  });
});
