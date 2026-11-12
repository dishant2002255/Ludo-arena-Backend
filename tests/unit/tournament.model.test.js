/**
 * Tournament Model & Validator Unit Tests
 */

const { createTournamentSchema, publishRoomSchema, submitResultSchema, finalizeResultSchema } = require('../../src/validators/tournament.validator');

describe('Tournament Validators', () => {

  describe('createTournamentSchema', () => {
    test('accepts valid tournament data', () => {
      const r = createTournamentSchema.safeParse({ title: 'Weekend Cup', winnerReward: 200 });
      expect(r.success).toBe(true);
    });

    test('rejects title shorter than 3 chars', () => {
      const r = createTournamentSchema.safeParse({ title: 'AB' });
      expect(r.success).toBe(false);
    });

    test('defaults winnerReward to 0 when omitted', () => {
      const r = createTournamentSchema.safeParse({ title: 'Valid Title' });
      expect(r.success).toBe(true);
      expect(r.data.winnerReward).toBe(0);
    });

    test('defaults description to empty string', () => {
      const r = createTournamentSchema.safeParse({ title: 'Title Only' });
      expect(r.success).toBe(true);
      expect(r.data.description).toBe('');
    });

    test('rejects negative winnerReward', () => {
      const r = createTournamentSchema.safeParse({ title: 'Title', winnerReward: -100 });
      expect(r.success).toBe(false);
    });
  });

  describe('publishRoomSchema', () => {
    test('accepts valid room data', () => {
      const r = publishRoomSchema.safeParse({ externalRoomId: 'ROOM-123' });
      expect(r.success).toBe(true);
      expect(r.data.externalPlatform).toBe('Ludo King');
    });

    test('rejects missing externalRoomId', () => {
      const r = publishRoomSchema.safeParse({});
      expect(r.success).toBe(false);
    });

    test('defaults externalPlatform to Ludo King', () => {
      const r = publishRoomSchema.safeParse({ externalRoomId: 'ABC' });
      expect(r.data.externalPlatform).toBe('Ludo King');
    });

    test('defaults password to empty string', () => {
      const r = publishRoomSchema.safeParse({ externalRoomId: 'ABC' });
      expect(r.data.externalRoomPassword).toBe('');
    });
  });

  describe('submitResultSchema', () => {
    test('accepts winner', () => {
      const r = submitResultSchema.safeParse({ claimedResult: 'winner' });
      expect(r.success).toBe(true);
    });

    test('accepts lost', () => {
      const r = submitResultSchema.safeParse({ claimedResult: 'lost' });
      expect(r.success).toBe(true);
    });

    test('rejects invalid value', () => {
      const r = submitResultSchema.safeParse({ claimedResult: 'draw' });
      expect(r.success).toBe(false);
    });

    test('defaults remarks to empty string', () => {
      const r = submitResultSchema.safeParse({ claimedResult: 'winner' });
      expect(r.data.remarks).toBe('');
    });
  });

  describe('finalizeResultSchema', () => {
    test('accepts valid winner ID', () => {
      const r = finalizeResultSchema.safeParse({ winnerUserId: 'abc123' });
      expect(r.success).toBe(true);
    });

    test('rejects missing winnerUserId', () => {
      const r = finalizeResultSchema.safeParse({});
      expect(r.success).toBe(false);
    });

    test('defaults verificationRemarks to empty string', () => {
      const r = finalizeResultSchema.safeParse({ winnerUserId: 'abc123' });
      expect(r.data.verificationRemarks).toBe('');
    });
  });
});

describe('Tournament Model Schema', () => {
  const schema = require('../../src/models/Tournament').schema;

  test('has title field', () => {
    expect(schema.path('title')).toBeDefined();
  });

  test('status defaults to draft', () => {
    expect(schema.path('status').defaultValue).toBe('draft');
  });

  test('registrationOpen defaults to false', () => {
    expect(schema.path('registrationOpen').defaultValue).toBe(false);
  });

  test('requiredPlayers defaults to 4', () => {
    expect(schema.path('requiredPlayers').defaultValue).toBe(4);
  });

  test('status enum includes all lifecycle values', () => {
    const vals = schema.path('status').enumValues;
    ['draft','open','full','waiting_for_admin','room_published','result_pending','completed','cancelled']
      .forEach(v => expect(vals).toContain(v));
  });

  test('has participants array', () => {
    expect(schema.path('participants')).toBeDefined();
  });

  test('has externalRoomId field', () => {
    expect(schema.path('externalRoomId')).toBeDefined();
  });

  test('has externalRoomPassword field', () => {
    expect(schema.path('externalRoomPassword')).toBeDefined();
  });

  test('has verifiedWinner reference', () => {
    expect(schema.path('verifiedWinner')).toBeDefined();
  });

  test('has rewardDistributed flag', () => {
    expect(schema.path('rewardDistributed')).toBeDefined();
  });

  test('winnerReward defaults to 0', () => {
    expect(schema.path('winnerReward').defaultValue).toBe(0);
  });
});

describe('WalletTransaction tournament_reward type', () => {
  const schema = require('../../src/models/WalletTransaction').schema;

  test('includes tournament_reward type', () => {
    const types = schema.path('type').enumValues;
    expect(types).toContain('tournament_reward');
  });

  test('has tournament reference field', () => {
    expect(schema.path('tournament')).toBeDefined();
  });
});

describe('Notification tournament types', () => {
  const schema = require('../../src/models/Notification').schema;

  const tournamentTypes = [
    'tournament_created',
    'tournament_joined',
    'tournament_full',
    'tournament_waiting',
    'tournament_room_published',
    'tournament_result_submitted',
    'tournament_verification_updated',
    'tournament_completed',
    'tournament_cancelled',
  ];

  test.each(tournamentTypes)('includes %s type', (type) => {
    expect(schema.path('type').enumValues).toContain(type);
  });
});

describe('Tournament service exports', () => {
  const service = require('../../src/services/tournament.service');

  const fns = [
    'createTournament',
    'updateTournament',
    'toggleRegistration',
    'cancelTournament',
    'joinTournament',
    'publishRoomDetails',
    'submitResult',
    'verifySubmission',
    'finalizeTournament',
    'getTournamentForParticipant',
  ];

  test.each(fns)('exports %s function', (fn) => {
    expect(typeof service[fn]).toBe('function');
  });
});
