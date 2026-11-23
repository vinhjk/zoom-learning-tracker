import { NextResponse } from 'next/server';
import {
  verifyZoomWebhookSignature,
  validateTimestamp,
  handleZoomChallengeEvent,
  getStableEventId,
  isUniqueConstraintViolation,
} from '@/lib/zoom/webhook';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Zoom Webhook endpoint.
 * This endpoint does NOT require Firebase authentication.
 * It is secured by Zoom webhook signature verification.
 */
export async function POST(request: Request) {
  try {
    const body = await request.text();
    const timestamp = request.headers.get('x-zm-request-timestamp') || '';
    const signature = request.headers.get('x-zm-signature') || '';

    // Parse payload
    const payload = JSON.parse(body);

    // Handle URL validation challenge (Zoom sends this during app setup)
    if (payload.event === 'endpoint.url_validation') {
      const plainToken = payload.payload?.plainToken;
      if (!plainToken) {
        return NextResponse.json({ error: 'Missing plainToken' }, { status: 400 });
      }
      const response = handleZoomChallengeEvent(plainToken);
      return NextResponse.json(response);
    }

    // Verify signature
    if (!timestamp || !signature) {
      return NextResponse.json({ error: 'Missing webhook headers' }, { status: 401 });
    }

    if (!validateTimestamp(timestamp)) {
      return NextResponse.json({ error: 'Timestamp too old' }, { status: 401 });
    }

    if (!verifyZoomWebhookSignature(body, timestamp, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const eventId = getStableEventId(payload);
    const eventType = (payload.event as string) || 'unknown';
    const meetingId = (payload.payload as Record<string, unknown>)?.object
      ? String(((payload.payload as Record<string, unknown>).object as Record<string, unknown>).id || '')
      : null;

    const supabase = getSupabaseAdmin();

    // Fast-path deduplication: check if this event was already processed
    const { data: existing } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .eq('event_type', eventType)
      .maybeSingle();

    if (existing) {
      // Already processed — return 200 for idempotency
      return NextResponse.json({ status: 'duplicate', id: existing.id });
    }

    // Atomic insert: relies on database uniqueness constraint to prevent race conditions
    const { data: event, error: dbError } = await supabase
      .from('webhook_events')
      .insert({
        event_type: eventType,
        event_id: eventId,
        meeting_id: meetingId || null,
        payload: payload,
        processed: false,
      })
      .select('id')
      .single();

    if (dbError) {
      // If error is PostgreSQL 23505 (unique_violation), a concurrent delivery won the race.
      // Treat as duplicate without running Attendance Engine.
      if (isUniqueConstraintViolation(dbError)) {
        return NextResponse.json({
          status: 'duplicate',
          message: 'Concurrent duplicate event detected',
        });
      }

      // Genuine database error (e.g. connection lost) -> return 500 so Zoom retries
      console.error('Failed to store webhook event:', dbError);
      return NextResponse.json({ error: 'Storage failed' }, { status: 500 });
    }

    // Only if insert succeeded does the event proceed to Attendance Engine processing
    try {
      await processWebhookEvent(payload, event.id);
    } catch (processError) {
      console.error('Event processing error:', processError);
      // Update the event with error info but still return 200
      await supabase
        .from('webhook_events')
        .update({
          error_message: processError instanceof Error ? processError.message : 'Unknown error',
        })
        .eq('id', event.id);
    }

    return NextResponse.json({ status: 'received', id: event.id });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function processWebhookEvent(payload: Record<string, unknown>, eventDbId: string) {
  const eventType = payload.event as string;
  const supabase = getSupabaseAdmin();

  if (
    eventType === 'meeting.participant_joined' ||
    eventType === 'meeting.participant_left'
  ) {
    const obj = (payload.payload as Record<string, unknown>)?.object as Record<string, unknown>;
    const participant = obj?.participant as Record<string, unknown>;

    if (!participant) return;

    const meetingId = obj?.id?.toString();
    const participantName = (participant.user_name as string) || (participant.participant_user_id as string) || 'Unknown';
    const participantEmail = (participant.email as string) || null;
    const joinTime = participant.join_time as string;
    const leaveTime = participant.leave_time as string;

    // Find or create participant
    let participantRecord;

    if (participantEmail) {
      const { data: existing } = await supabase
        .from('participants')
        .select('*')
        .eq('email', participantEmail.trim().toLowerCase())
        .maybeSingle();

      if (existing) {
        participantRecord = existing;
      }
    }

    if (!participantRecord) {
      // Try matching by name
      const { data: byName } = await supabase
        .from('participants')
        .select('*')
        .eq('name', participantName)
        .maybeSingle();

      if (byName) {
        participantRecord = byName;
      } else {
        // Create new participant
        const { data: newParticipant } = await supabase
          .from('participants')
          .insert({
            name: participantName,
            email: participantEmail?.trim().toLowerCase() || null,
            zoom_user_id: (participant.participant_user_id as string) || null,
          })
          .select()
          .single();

        participantRecord = newParticipant;
      }
    }

    // Find session by zoom meeting ID
    if (meetingId && participantRecord) {
      const { data: session } = await supabase
        .from('sessions')
        .select('*')
        .eq('zoom_meeting_id', meetingId)
        .maybeSingle();

      if (session) {
        if (eventType === 'meeting.participant_joined' && joinTime) {
          // Create attendance record for join
          await supabase.from('attendance_records').insert({
            session_id: session.id,
            participant_id: participantRecord.id,
            join_time: joinTime,
            zoom_join_time: joinTime,
            duration_seconds: 0,
          });
        }

        if (eventType === 'meeting.participant_left' && leaveTime) {
          // Update the most recent attendance record without a leave time
          const { data: openRecord } = await supabase
            .from('attendance_records')
            .select('*')
            .eq('session_id', session.id)
            .eq('participant_id', participantRecord.id)
            .is('leave_time', null)
            .order('join_time', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (openRecord) {
            const joinMs = new Date(openRecord.join_time).getTime();
            const leaveMs = new Date(leaveTime).getTime();
            const durationSeconds = Math.max(0, Math.floor((leaveMs - joinMs) / 1000));

            await supabase
              .from('attendance_records')
              .update({
                leave_time: leaveTime,
                zoom_leave_time: leaveTime,
                duration_seconds: durationSeconds,
              })
              .eq('id', openRecord.id);
          }
        }
      }
    }
  }

  // Mark event as processed
  await supabase
    .from('webhook_events')
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq('id', eventDbId);
}

