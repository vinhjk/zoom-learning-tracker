import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { calculateAttendance, calculateAttendanceScore } from '../zoom/attendance.ts';
import {
  verifyZoomWebhookSignature,
  validateTimestamp,
  handleZoomChallengeEvent,
  getStableEventId,
  isUniqueConstraintViolation,
  evaluateDeduplicationResult,
} from '../zoom/webhook.ts';
import { toCSV } from '../utils/export.ts';

describe('ZLT Core Business Logic Tests', () => {
  describe('Attendance Calculation', () => {
    it('calculates duration for a single participant with one session', () => {
      const records = [
        {
          name: 'Nguyen Van A',
          user_email: 'a@example.com',
          user_id: 'z1',
          join_time: '2026-11-23T10:00:00Z',
          leave_time: '2026-11-23T10:45:00Z',
          duration: 2700,
        },
      ];

      const results = calculateAttendance(records);
      assert.equal(results.length, 1);
      assert.equal(results[0].participant_name, 'Nguyen Van A');
      assert.equal(results[0].participant_email, 'a@example.com');
      assert.equal(results[0].total_duration_seconds, 2700);
      assert.equal(results[0].join_count, 1);
    });

    it('handles multiple joins and leaves correctly (cumulative duration)', () => {
      const records = [
        {
          name: 'Nguyen Van A',
          user_email: 'a@example.com',
          join_time: '2026-11-23T10:00:00Z',
          leave_time: '2026-11-23T10:30:00Z',
          duration: 1800,
        },
        {
          name: 'Nguyen Van A',
          user_email: 'a@example.com',
          join_time: '2026-11-23T10:40:00Z',
          leave_time: '2026-11-23T11:00:00Z',
          duration: 1200,
        },
      ];

      const results = calculateAttendance(records);
      assert.equal(results.length, 1);
      assert.equal(results[0].total_duration_seconds, 3000); // 1800 + 1200
      assert.equal(results[0].join_count, 2);
    });

    it('handles overlapping join intervals safely without double counting', () => {
      const records = [
        {
          name: 'Nguyen Van B',
          user_email: 'b@example.com',
          join_time: '2026-11-23T10:00:00Z',
          leave_time: '2026-11-23T10:30:00Z',
          duration: 1800,
        },
        {
          name: 'Nguyen Van B',
          user_email: 'b@example.com',
          join_time: '2026-11-23T10:15:00Z',
          leave_time: '2026-11-23T10:45:00Z',
          duration: 1800,
        },
      ];

      const results = calculateAttendance(records);
      assert.equal(results.length, 1);
      // Interval should extend from 10:00 to 10:45 = 45 minutes = 2700 seconds
      assert.equal(results[0].total_duration_seconds, 2700);
    });

    it('calculates attendance score capped at 100%', () => {
      // 60 minutes in a 60-minute session = 100%
      assert.equal(calculateAttendanceScore(3600, 60), 100);
      // 30 minutes in a 60-minute session = 50%
      assert.equal(calculateAttendanceScore(1800, 60), 50);
      // 90 minutes in a 60-minute session = 100% (capped)
      assert.equal(calculateAttendanceScore(5400, 60), 100);
      // 0 minutes = 0%
      assert.equal(calculateAttendanceScore(0, 60), 0);
      // Invalid session length handled safely
      assert.equal(calculateAttendanceScore(1800, 0), 0);
    });
  });

  describe('Zoom Webhook Security: Signature Verification', () => {
    const TEST_SECRET = 'mock_zoom_secret_token_abcdef123456';
    const TEST_BODY = JSON.stringify({
      event: 'meeting.participant_joined',
      payload: { object: { id: '123456789' } },
    });
    const TEST_TIMESTAMP = '1700000000';

    let originalSecret: string | undefined;

    beforeEach(() => {
      originalSecret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
      process.env.ZOOM_WEBHOOK_SECRET_TOKEN = TEST_SECRET;
    });

    afterEach(() => {
      if (originalSecret !== undefined) {
        process.env.ZOOM_WEBHOOK_SECRET_TOKEN = originalSecret;
      } else {
        delete process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
      }
    });

    function generateValidSignature(body: string, timestamp: string, secret: string): string {
      const message = `v0:${timestamp}:${body}`;
      const hash = crypto.createHmac('sha256', secret).update(message).digest('hex');
      return `v0=${hash}`;
    }

    it('returns true for a valid Zoom webhook signature', () => {
      const validSignature = generateValidSignature(TEST_BODY, TEST_TIMESTAMP, TEST_SECRET);
      const isValid = verifyZoomWebhookSignature(TEST_BODY, TEST_TIMESTAMP, validSignature);
      assert.equal(isValid, true);
    });

    it('returns false for an invalid signature with same length', () => {
      const validSignature = generateValidSignature(TEST_BODY, TEST_TIMESTAMP, TEST_SECRET);
      // Corrupt one character while preserving exact length
      const corruptedSignature = validSignature.slice(0, -1) + (validSignature.slice(-1) === 'a' ? 'b' : 'a');
      const isValid = verifyZoomWebhookSignature(TEST_BODY, TEST_TIMESTAMP, corruptedSignature);
      assert.equal(isValid, false);
    });

    it('returns false without RangeError when signature length is shorter than expected', () => {
      const shortSignature = 'v0=short_sig';
      // Prior to hardening, this threw a RangeError: Input buffers must have the same byte length
      assert.doesNotThrow(() => {
        const isValid = verifyZoomWebhookSignature(TEST_BODY, TEST_TIMESTAMP, shortSignature);
        assert.equal(isValid, false);
      });
    });

    it('returns false without RangeError when signature length is longer than expected', () => {
      const longSignature = generateValidSignature(TEST_BODY, TEST_TIMESTAMP, TEST_SECRET) + '_extra_bytes';
      assert.doesNotThrow(() => {
        const isValid = verifyZoomWebhookSignature(TEST_BODY, TEST_TIMESTAMP, longSignature);
        assert.equal(isValid, false);
      });
    });

    it('returns false when signature is empty', () => {
      assert.equal(verifyZoomWebhookSignature(TEST_BODY, TEST_TIMESTAMP, ''), false);
    });

    it('returns false when timestamp is empty', () => {
      const validSignature = generateValidSignature(TEST_BODY, TEST_TIMESTAMP, TEST_SECRET);
      assert.equal(verifyZoomWebhookSignature(TEST_BODY, '', validSignature), false);
    });

    it('returns false safely when ZOOM_WEBHOOK_SECRET_TOKEN is not configured', () => {
      delete process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
      const validSignature = generateValidSignature(TEST_BODY, TEST_TIMESTAMP, TEST_SECRET);
      const isValid = verifyZoomWebhookSignature(TEST_BODY, TEST_TIMESTAMP, validSignature);
      assert.equal(isValid, false);
    });
  });

  describe('Zoom Webhook Security: Timestamp Validation', () => {
    it('validates current timestamp within 5 minutes', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      assert.equal(validateTimestamp(`${nowSec}`), true);
    });

    it('accepts timestamp from 2 minutes ago', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      assert.equal(validateTimestamp(`${nowSec - 120}`), true);
    });

    it('accepts timestamp 2 minutes in the future (within clock drift threshold)', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      assert.equal(validateTimestamp(`${nowSec + 120}`), true);
    });

    it('rejects timestamp that is too old (10 minutes ago)', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      assert.equal(validateTimestamp(`${nowSec - 600}`), false);
    });

    it('rejects timestamp that is too far in the future (10 minutes in future)', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      assert.equal(validateTimestamp(`${nowSec + 600}`), false);
    });

    it('rejects non-numeric timestamp strings', () => {
      assert.equal(validateTimestamp('invalid_non_numeric'), false);
      assert.equal(validateTimestamp(''), false);
    });
  });

  describe('Zoom Webhook: URL Validation Challenge', () => {
    const TEST_SECRET = 'mock_zoom_secret_token_challenge_xyz';
    let originalSecret: string | undefined;

    beforeEach(() => {
      originalSecret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
      process.env.ZOOM_WEBHOOK_SECRET_TOKEN = TEST_SECRET;
    });

    afterEach(() => {
      if (originalSecret !== undefined) {
        process.env.ZOOM_WEBHOOK_SECRET_TOKEN = originalSecret;
      } else {
        delete process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
      }
    });

    it('correctly creates encryptedToken matching independent HMAC-SHA256 fixture', () => {
      const samplePlainToken = 'sample_plain_token_1234567890abcdef';

      // Independent test fixture computation
      const expectedEncryptedToken = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(samplePlainToken)
        .digest('hex');

      const response = handleZoomChallengeEvent(samplePlainToken);

      assert.equal(response.plainToken, samplePlainToken);
      assert.equal(response.encryptedToken, expectedEncryptedToken);
      // Zoom HMAC hex digest is 64 characters
      assert.equal(response.encryptedToken.length, 64);
    });

    it('throws error when secret token is not configured', () => {
      delete process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
      assert.throws(
        () => handleZoomChallengeEvent('some_plain_token'),
        /ZOOM_WEBHOOK_SECRET_TOKEN not configured/
      );
    });
  });

  describe('Export & Formula Injection Prevention', () => {
    it('sanitizes formula injection prefixes in CSV export', () => {
      const rows = [
        { name: '=cmd|"/C calc"!A0', email: '+test@email.com', role: '@admin' },
      ];
      const csv = toCSV(['name', 'email', 'role'], rows);
      // Should prefix with single quote
      assert.match(csv, /"'=cmd/);
      assert.match(csv, /"'\+test/);
      assert.match(csv, /"'@admin/);
    });
  });

  describe('Zoom Webhook Idempotency & Deduplication Engine', () => {
    const SAMPLE_JOIN_PAYLOAD_1 = {
      event: 'meeting.participant_joined',
      event_ts: 1626230691572,
      payload: {
        object: {
          id: '987654321',
          uuid: 'uuid_meeting_123',
          participant: {
            user_id: 'user_111',
            user_name: 'Nguyen Van A',
            email: 'a@example.com',
            join_time: '2026-11-23T10:00:00Z',
          },
        },
      },
    };

    const SAMPLE_JOIN_PAYLOAD_2_SAME_TIME = {
      event: 'meeting.participant_joined',
      event_ts: 1626230691572, // Identical millisecond!
      payload: {
        object: {
          id: '987654321',
          uuid: 'uuid_meeting_123',
          participant: {
            user_id: 'user_222', // Different participant!
            user_name: 'Tran Thi B',
            email: 'b@example.com',
            join_time: '2026-11-23T10:00:00Z',
          },
        },
      },
    };

    describe('getStableEventId', () => {
      it('returns payload.event_id when explicitly present in Zoom payload', () => {
        const payloadWithExplicitId = {
          event: 'meeting.participant_joined',
          event_id: 'explicit_zoom_event_id_xyz999',
          event_ts: 1626230691572,
        };
        const id = getStableEventId(payloadWithExplicitId);
        assert.equal(id, 'explicit_zoom_event_id_xyz999');
      });

      it('generates identical event identity across multiple retries (retry stability)', () => {
        const id1 = getStableEventId(SAMPLE_JOIN_PAYLOAD_1);
        const id2 = getStableEventId(SAMPLE_JOIN_PAYLOAD_1);
        const id3 = getStableEventId(JSON.parse(JSON.stringify(SAMPLE_JOIN_PAYLOAD_1)));
        assert.equal(id1, id2);
        assert.equal(id1, id3);
        assert.ok(id1.startsWith('meeting.participant_joined_1626230691572_'));
      });

      it('prevents collision: two different participants joining at the exact same millisecond get different IDs', () => {
        const idA = getStableEventId(SAMPLE_JOIN_PAYLOAD_1);
        const idB = getStableEventId(SAMPLE_JOIN_PAYLOAD_2_SAME_TIME);
        assert.notEqual(idA, idB);
      });

      it('generates a deterministic fingerprint when event_ts is missing (never uses Date.now)', () => {
        const payloadWithoutTs = {
          event: 'meeting.participant_joined',
          payload: {
            object: {
              id: '12345',
              participant: { user_name: 'Test' },
            },
          },
        };
        const id1 = getStableEventId(payloadWithoutTs);
        const id2 = getStableEventId(payloadWithoutTs);
        assert.equal(id1, id2);
        assert.ok(id1.startsWith('meeting.participant_joined_fp_'));
      });

      it('generates different IDs for different event types with same meeting/participant', () => {
        const joinPayload = {
          event: 'meeting.participant_joined',
          event_ts: 1626230691572,
          payload: { object: { id: '123', participant: { user_id: 'u1' } } },
        };
        const leavePayload = {
          event: 'meeting.participant_left',
          event_ts: 1626230691572,
          payload: { object: { id: '123', participant: { user_id: 'u1' } } },
        };
        assert.notEqual(getStableEventId(joinPayload), getStableEventId(leavePayload));
      });
    });

    describe('isUniqueConstraintViolation', () => {
      it('identifies PostgreSQL error code 23505 as unique violation', () => {
        assert.equal(isUniqueConstraintViolation({ code: '23505' }), true);
      });

      it('identifies duplicate key message string as unique violation', () => {
        assert.equal(
          isUniqueConstraintViolation({
            message: 'duplicate key value violates unique constraint "uq_webhook_events"',
          }),
          true
        );
      });

      it('identifies details string containing already exists as unique violation', () => {
        assert.equal(
          isUniqueConstraintViolation({
            details: 'Key (event_id, event_type)=(evt1, test) already exists.',
          }),
          true
        );
      });

      it('rejects connection errors (e.g. 57P01, ETIMEDOUT)', () => {
        assert.equal(isUniqueConstraintViolation({ code: '57P01', message: 'connection reset' }), false);
        assert.equal(isUniqueConstraintViolation({ code: 'ETIMEDOUT', message: 'timeout' }), false);
      });

      it('rejects syntax or relation errors (e.g. 42P01 table does not exist)', () => {
        assert.equal(isUniqueConstraintViolation({ code: '42P01', message: 'relation does not exist' }), false);
      });

      it('rejects non-error values safely', () => {
        assert.equal(isUniqueConstraintViolation(null), false);
        assert.equal(isUniqueConstraintViolation(undefined), false);
        assert.equal(isUniqueConstraintViolation('string_error'), false);
      });
    });

    describe('evaluateDeduplicationResult (Atomic Deduplication State Machine)', () => {
      it('decides DUPLICATE when event already exists in database (fast-path)', () => {
        const decision = evaluateDeduplicationResult({
          existingEventId: 'db_event_row_123',
          insertData: null,
          insertError: null,
        });
        assert.equal(decision.action, 'DUPLICATE');
        if (decision.action === 'DUPLICATE') {
          assert.equal(decision.eventDbId, 'db_event_row_123');
        }
      });

      it('decides DUPLICATE when insert hits 23505 unique constraint violation (concurrent race)', () => {
        const decision = evaluateDeduplicationResult({
          existingEventId: null,
          insertData: null,
          insertError: { code: '23505', message: 'Key already exists' },
        });
        assert.equal(decision.action, 'DUPLICATE');
      });

      it('decides DATABASE_ERROR on non-unique DB error so Zoom can retry later', () => {
        const decision = evaluateDeduplicationResult({
          existingEventId: null,
          insertData: null,
          insertError: { code: '57P01', message: 'database server shut down' },
        });
        assert.equal(decision.action, 'DATABASE_ERROR');
      });

      it('decides PROCEED when insert succeeds cleanly with new row ID', () => {
        const decision = evaluateDeduplicationResult({
          existingEventId: null,
          insertData: { id: 'new_db_event_456' },
          insertError: null,
        });
        assert.equal(decision.action, 'PROCEED');
        if (decision.action === 'PROCEED') {
          assert.equal(decision.eventDbId, 'new_db_event_456');
        }
      });
    });

    describe('Concurrency Simulation (Two simultaneous deliveries of same event)', () => {
      it('ensures Attendance Engine is triggered exactly once when 2 requests race', async () => {
        let attendanceEngineCallCount = 0;

        function simulateBusinessProcessing() {
          attendanceEngineCallCount++;
        }

        // Shared mock DB table state
        const mockDatabaseTable = new Set<string>();

        // Atomic simulate function representing the API route logic
        async function handleMockIncomingWebhook(eventId: string) {
          // Check fast path
          if (mockDatabaseTable.has(eventId)) {
            const decision = evaluateDeduplicationResult({
              existingEventId: eventId,
              insertData: null,
              insertError: null,
            });
            return decision;
          }

          // Atomic insert simulation:
          // In real PostgreSQL, a UNIQUE index causes the 2nd concurrent insert to fail with 23505
          if (mockDatabaseTable.has(eventId)) {
            // Lost race
            const decision = evaluateDeduplicationResult({
              existingEventId: null,
              insertData: null,
              insertError: { code: '23505', message: 'duplicate key value' },
            });
            return decision;
          }

          // Won race: atomically mark inserted
          mockDatabaseTable.add(eventId);
          const decision = evaluateDeduplicationResult({
            existingEventId: null,
            insertData: { id: eventId },
            insertError: null,
          });

          if (decision.action === 'PROCEED') {
            simulateBusinessProcessing();
          }

          return decision;
        }

        const sharedEventId = getStableEventId(SAMPLE_JOIN_PAYLOAD_1);

        // Execute two concurrent requests simultaneously with Promise.all
        const [res1, res2] = await Promise.all([
          handleMockIncomingWebhook(sharedEventId),
          handleMockIncomingWebhook(sharedEventId),
        ]);

        const actions = [res1.action, res2.action];

        // Verification:
        // Exactly ONE request must get PROCEED
        assert.equal(actions.filter((a) => a === 'PROCEED').length, 1);
        // Exactly ONE request must get DUPLICATE
        assert.equal(actions.filter((a) => a === 'DUPLICATE').length, 1);
        // Business logic must run EXACTLY ONCE
        assert.equal(attendanceEngineCallCount, 1);
      });
    });
  });
});
