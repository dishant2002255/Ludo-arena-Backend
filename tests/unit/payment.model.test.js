/**
 * Payment Infrastructure Unit Tests
 */

describe('PaymentOrder Model', () => {
  const schema = require('../../src/models/PaymentOrder').schema;

  test('status defaults to pending', () => {
    expect(schema.path('status').defaultValue).toBe('pending');
  });

  test('status enum includes all lifecycle values', () => {
    const vals = schema.path('status').enumValues;
    ['pending','admin_notified','approved','rejected','expired'].forEach(v => expect(vals).toContain(v));
  });

  test('coinsRequested has minimum of 200', () => {
    const field = schema.path('coinsRequested');
    const minValidator = field.validators?.find(v => v.type === 'min');
    expect(minValidator?.min).toBe(200);
  });

  test('adminAlarmActive defaults to true', () => {
    expect(schema.path('adminAlarmActive').defaultValue).toBe(true);
  });

  test('has orderReference field', () => {
    expect(schema.path('orderReference')).toBeDefined();
  });

  test('has expiresAt field', () => {
    expect(schema.path('expiresAt')).toBeDefined();
  });

  test('has walletTransaction reference', () => {
    expect(schema.path('walletTransaction')).toBeDefined();
  });

  test('upiPlatform includes all supported apps', () => {
    const vals = schema.path('upiPlatform').enumValues;
    ['gpay','phonepe','paytm','bhim','other'].forEach(v => expect(vals).toContain(v));
  });
});

describe('SystemSettings Model', () => {
  const SystemSettings = require('../../src/models/SystemSettings');
  const schema = SystemSettings.schema;

  test('upiEnabled defaults to false', () => {
    expect(schema.path('upiEnabled').defaultValue).toBe(false);
  });

  test('coinPriceRupees defaults to 1', () => {
    expect(schema.path('coinPriceRupees').defaultValue).toBe(1);
  });

  test('minimumPurchaseCoins defaults to 200', () => {
    expect(schema.path('minimumPurchaseCoins').defaultValue).toBe(200);
  });

  test('maximumPurchaseCoins defaults to 10000', () => {
    expect(schema.path('maximumPurchaseCoins').defaultValue).toBe(10000);
  });

  test('adminAlarmEnabled defaults to true', () => {
    expect(schema.path('adminAlarmEnabled').defaultValue).toBe(true);
  });

  test('has getSettings static method', () => {
    expect(typeof SystemSettings.getSettings).toBe('function');
  });
});

describe('WalletTransaction coin_purchase type', () => {
  const schema = require('../../src/models/WalletTransaction').schema;

  test('includes coin_purchase type', () => {
    expect(schema.path('type').enumValues).toContain('coin_purchase');
  });

  test('has paymentOrder reference field', () => {
    expect(schema.path('paymentOrder')).toBeDefined();
  });
});

describe('Notification payment types', () => {
  const schema = require('../../src/models/Notification').schema;
  const paymentTypes = ['payment_initiated','payment_approved','payment_rejected','payment_alarm'];

  test.each(paymentTypes)('includes %s', (type) => {
    expect(schema.path('type').enumValues).toContain(type);
  });
});

describe('Payment Service exports', () => {
  const service = require('../../src/services/payment.service');
  const fns = [
    'initiatePayment','notifyAdminOfPayment','approvePayment',
    'rejectPayment','dismissAlarm','getPendingOrders',
    'getAllOrders','getUserOrders','getOrderById',
    'getPaymentSettings','buildUpiUrl','getAppDeepLinks',
  ];
  test.each(fns)('exports %s', (fn) => {
    expect(typeof service[fn]).toBe('function');
  });
});

describe('UPI URL Builder', () => {
  const { buildUpiUrl, getAppDeepLinks } = require('../../src/services/payment.service');

  test('builds valid UPI URL with correct params', () => {
    const settings = { upiId: 'test@upi', upiName: 'Test Merchant', upiNote: 'Purchase', coinPriceRupees: 1 };
    const url = buildUpiUrl(settings, 200, 'LA-TEST-001');
    expect(url).toContain('upi://pay');
    expect(url).toContain('pa=test%40upi');
    expect(url).toContain('am=200.00');
    expect(url).toContain('cu=INR');
    expect(url).toContain('tr=LA-TEST-001');
  });

  test('getAppDeepLinks returns all platforms', () => {
    const links = getAppDeepLinks('upi://pay?pa=test@upi&am=200');
    expect(links.gpay).toBeDefined();
    expect(links.phonepe).toBeDefined();
    expect(links.paytm).toBeDefined();
    expect(links.bhim).toBeDefined();
    expect(links.generic).toBeDefined();
  });
});

describe('Constants — registration bonus', () => {
  test('REGISTRATION_BONUS is 50', () => {
    // Reset module to get fresh value
    jest.resetModules();
    const { REGISTRATION_BONUS } = require('../../src/config/constants');
    expect(REGISTRATION_BONUS).toBe(50);
  });
});

describe('socketInstance payment emitters', () => {
  const si = require('../../src/socket/socketInstance');

  test('exports emitPaymentAlarm', () => {
    expect(typeof si.emitPaymentAlarm).toBe('function');
  });

  test('exports dismissPaymentAlarm', () => {
    expect(typeof si.dismissPaymentAlarm).toBe('function');
  });

  test('exports emitPaymentStatusUpdate', () => {
    expect(typeof si.emitPaymentStatusUpdate).toBe('function');
  });

  test('emitPaymentAlarm does not throw when io is null', () => {
    expect(() => si.emitPaymentAlarm({ _id: 'test', user: {}, coinsRequested: 200, amountRupees: 200, upiPlatform: 'gpay' })).not.toThrow();
  });

  test('dismissPaymentAlarm does not throw when io is null', () => {
    expect(() => si.dismissPaymentAlarm('test-id')).not.toThrow();
  });

  test('emitPaymentStatusUpdate does not throw when io is null', () => {
    expect(() => si.emitPaymentStatusUpdate('userId', { status: 'approved' })).not.toThrow();
  });
});
