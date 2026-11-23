import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { getZoomPastMeetingParticipants } from '@/lib/zoom/oauth';
import { calculateAttendance, calculateAttendanceScore } from '@/lib/zoom/attendance';

/**
 * Sync Zoom past meeting participants for a session.
 */
export async function POST(request: Request) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const body = await request.json();
  const { session_id } = body;

  if (!session_id) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Get the session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session_id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (!session.zoom_meeting_id) {
    return NextResponse.json({ error: 'Session has no Zoom meeting ID' }, { status: 400 });
  }

  try {
    // Fetch all participants from Zoom (paginated)
    const allParticipants = [];
    let nextPageToken: string | undefined;

    do {
      const result = await getZoomPastMeetingParticipants(
        session.zoom_meeting_id,
        nextPageToken
      );
      allParticipants.push(...result.participants);
      nextPageToken = result.next_page_token || undefined;
    } while (nextPageToken);

    // Calculate attendance
    const attendance = calculateAttendance(allParticipants);

    let synced = 0;

    for (const att of attendance) {
      // Find or create participant
      let participantId: string;

      if (att.participant_email) {
        const { data: existing } = await supabase
          .from('participants')
          .select('id')
          .eq('email', att.participant_email.toLowerCase())
          .maybeSingle();

        if (existing) {
          participantId = existing.id;
        } else {
          const { data: newP } = await supabase
            .from('participants')
            .insert({
              name: att.participant_name,
              email: att.participant_email.toLowerCase(),
              zoom_user_id: att.zoom_user_id,
            })
            .select('id')
            .single();
          participantId = newP!.id;
        }
      } else {
        const { data: byName } = await supabase
          .from('participants')
          .select('id')
          .eq('name', att.participant_name)
          .maybeSingle();

        if (byName) {
          participantId = byName.id;
        } else {
          const { data: newP } = await supabase
            .from('participants')
            .insert({
              name: att.participant_name,
              zoom_user_id: att.zoom_user_id,
            })
            .select('id')
            .single();
          participantId = newP!.id;
        }
      }

      // Create attendance records for each segment
      for (const segment of att.segments) {
        // Check for duplicate
        const { data: dup } = await supabase
          .from('attendance_records')
          .select('id')
          .eq('session_id', session_id)
          .eq('participant_id', participantId)
          .eq('join_time', segment.join_time)
          .maybeSingle();

        if (!dup) {
          await supabase.from('attendance_records').insert({
            session_id,
            participant_id: participantId,
            join_time: segment.join_time,
            leave_time: segment.leave_time,
            duration_seconds: segment.duration_seconds,
            zoom_join_time: segment.join_time,
            zoom_leave_time: segment.leave_time,
          });
          synced++;
        }
      }
    }

    // Calculate scores summary
    const attendanceSummary = attendance.map((a) => ({
      name: a.participant_name,
      email: a.participant_email,
      total_duration_seconds: a.total_duration_seconds,
      join_count: a.join_count,
      attendance_score: calculateAttendanceScore(
        a.total_duration_seconds,
        session.duration_minutes || 60
      ),
    }));

    return NextResponse.json({
      data: {
        total_zoom_participants: allParticipants.length,
        unique_participants: attendance.length,
        new_records_synced: synced,
        attendance_summary: attendanceSummary,
      },
    });
  } catch (zoomError) {
    console.error('Zoom sync error:', zoomError);
    return NextResponse.json(
      { error: zoomError instanceof Error ? zoomError.message : 'Zoom sync failed' },
      { status: 500 }
    );
  }
}

