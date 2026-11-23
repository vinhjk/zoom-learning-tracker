import crypto from 'crypto';

/**
 * Verifies Zoom webhook signature.
 * Zoom sends: x-zm-request-timestamp and x-zm-signature headers.
 */
export function verifyZoomWebhookSignature(
  body: string,
  timestamp: string,
  signature: string
): boolean {
  const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secretToken) {
    console.error('ZOOM_WEBHOOK_SECRET_TOKEN not configured');
    return false;
  }

  if (!signature || !timestamp) {
    return false;
  }

  const message = `v0:${timestamp}:${body}`;
  const hashForVerify = crypto
    .createHmac('sha256', secretToken)
    .update(message)
    .digest('hex');

  const expectedSignature = `v0=${hashForVerify}`;

  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  // crypto.timingSafeEqual requires buffers to have the exact same byte length.
  // Mismatched lengths throw a RangeError in Node.js if not checked upfront.
  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Validates that the timestamp is within acceptable range (5 minutes).
 */
export function validateTimestamp(timestamp: string): boolean {
  if (!timestamp) return false;
  const requestTime = parseInt(timestamp, 10) * 1000;
  if (isNaN(requestTime)) return false;

  const currentTime = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  return Math.abs(currentTime - requestTime) <= fiveMinutes;
}

/**
 * Generates the response for Zoom's URL validation challenge.
 */
export function handleZoomChallengeEvent(
  plainToken: string
): { plainToken: string; encryptedToken: string } {
  const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secretToken) {
    throw new Error('ZOOM_WEBHOOK_SECRET_TOKEN not configured');
  }

  const encryptedToken = crypto
    .createHmac('sha256', secretToken)
    .update(plainToken)
    .digest('hex');

  return { plainToken, encryptedToken };
}

/**
 * Recursively serializes any JavaScript value to a deterministic JSON string
 * by recursively sorting object keys.
 */
export function serializeDeterministic(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(serializeDeterministic).join(',') + ']';
  }
  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${serializeDeterministic(obj[key])}`
  );
  return '{' + entries.join(',') + '}';
}

/**
 * Generates a stable, deterministic event identifier from a Zoom webhook payload.
 *
 * Rules:
 * 1. NEVER uses Date.now() or random numbers (which change across retries).
 * 2. Uses payload.event_id if explicitly provided by Zoom.
 * 3. Builds a composite key incorporating:
 *    - event type (e.g. meeting.participant_joined)
 *    - meeting ID or UUID
 *    - participant identity (participant_uuid || user_id || email || user_name)
 *    - action time (join_time || leave_time)
 *    - event_ts (event timestamp from Zoom)
 * 4. If event_ts or participant info is missing, falls back to a deterministic SHA-256
 *    fingerprint of the normalized canonical payload.
 * 5. Eliminates collision risk: two participants joining at the same millisecond receive distinct IDs.
 */
export function getStableEventId(payload: Record<string, unknown>): string {
  if (!payload || typeof payload !== 'object') {
    return 'unknown_invalid_payload';
  }

  // 1. Direct event_id if provided by Zoom
  if (typeof payload.event_id === 'string' && payload.event_id.trim()) {
    return payload.event_id.trim();
  }

  const eventType = (payload.event as string) || 'unknown';
  const eventTs = payload.event_ts != null ? String(payload.event_ts) : '';
  const obj = (payload.payload as Record<string, unknown>)?.object as Record<string, unknown> | undefined;
  const meetingId = (obj?.id as string) || (obj?.uuid as string) || '';
  const participant = obj?.participant as Record<string, unknown> | undefined;

  const participantId = participant
    ? (participant.participant_uuid as string) ||
      (participant.user_id as string) ||
      (participant.id as string) ||
      (participant.email as string) ||
      (participant.user_name as string) ||
      ''
    : '';

  const actionTime = participant
    ? (participant.join_time as string) || (participant.leave_time as string) || ''
    : '';

  // 2. Structured composite key when core fields are present
  if (eventTs && meetingId) {
    const rawIdentifier = `${eventType}:${meetingId}:${participantId}:${actionTime}:${eventTs}`;
    const hash = crypto.createHash('sha256').update(rawIdentifier).digest('hex').slice(0, 24);
    return `${eventType}_${eventTs}_${hash}`;
  }

  // 3. Deterministic canonical payload hash (guaranteed identical across retries, no Date.now())
  const canonicalJson = serializeDeterministic(payload);
  const fallbackHash = crypto.createHash('sha256').update(canonicalJson).digest('hex').slice(0, 32);
  return `${eventType}_fp_${fallbackHash}`;
}

/**
 * Determines whether a database error is specifically a PostgreSQL unique constraint violation (code 23505).
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; details?: string };
  return (
    err.code === '23505' ||
    (typeof err.message === 'string' &&
      (err.message.includes('duplicate key') || err.message.includes('unique constraint'))) ||
    (typeof err.details === 'string' && err.details.includes('already exists'))
  );
}

export type DeduplicationDecision =
  | { action: 'PROCEED'; eventDbId: string }
  | { action: 'DUPLICATE'; eventDbId?: string; reason: string }
  | { action: 'DATABASE_ERROR'; error: unknown };

/**
 * Pure evaluation function for the atomic deduplication state machine.
 */
export function evaluateDeduplicationResult(params: {
  existingEventId: string | null;
  insertData: { id: string } | null;
  insertError: unknown;
}): DeduplicationDecision {
  // Case 1: Already found in DB (fast path)
  if (params.existingEventId) {
    return {
      action: 'DUPLICATE',
      eventDbId: params.existingEventId,
      reason: 'Existing event already recorded in database',
    };
  }

  // Case 2: Insert error occurred
  if (params.insertError) {
    if (isUniqueConstraintViolation(params.insertError)) {
      return {
        action: 'DUPLICATE',
        reason: 'PostgreSQL unique constraint violation (code 23505) - concurrent insert',
      };
    }
    return {
      action: 'DATABASE_ERROR',
      error: params.insertError,
    };
  }

  // Case 3: Insert succeeded
  if (params.insertData?.id) {
    return {
      action: 'PROCEED',
      eventDbId: params.insertData.id,
    };
  }

  return {
    action: 'DATABASE_ERROR',
    error: new Error('Insert returned neither data nor error'),
  };
}

