import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { calculateAttendanceScore } from '@/lib/zoom/attendance';
import { toCSV, toExcel } from '@/lib/utils/export';

export async function GET(request: Request) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'dashboard';
  const sessionId = searchParams.get('session_id');
  const programId = searchParams.get('program_id');
  const format = searchParams.get('format'); // csv or excel

  const supabase = getSupabaseAdmin();

  if (type === 'dashboard') {
    const [programs, sessions, participants, recentSessions] = await Promise.all([
      supabase.from('programs').select('id', { count: 'exact' }),
      supabase.from('sessions').select('id', { count: 'exact' }),
      supabase.from('participants').select('id', { count: 'exact' }),
      supabase
        .from('sessions')
        .select('*, programs(name)')
        .order('scheduled_start', { ascending: false })
        .limit(5),
    ]);

    // Calculate average attendance
    const { data: attendanceData } = await supabase
      .from('attendance_records')
      .select('duration_seconds');

    const totalDuration = (attendanceData || []).reduce(
      (sum: number, r: { duration_seconds: number }) => sum + (r.duration_seconds || 0),
      0
    );
    const avgAttendance =
      attendanceData && attendanceData.length > 0
        ? Math.round(totalDuration / attendanceData.length / 60)
        : 0;

    const recent = (recentSessions.data || []).map((s: Record<string, unknown>) => ({
      ...s,
      program_name: (s.programs as Record<string, unknown>)?.name || null,
      programs: undefined,
    }));

    return NextResponse.json({
      data: {
        totalPrograms: programs.count || 0,
        totalSessions: sessions.count || 0,
        totalParticipants: participants.count || 0,
        avgAttendanceMinutes: avgAttendance,
        recentSessions: recent,
      },
    });
  }

  if (type === 'session' && sessionId) {
    const { data: session } = await supabase
      .from('sessions')
      .select('*, programs(name)')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { data: records } = await supabase
      .from('attendance_records')
      .select('*, participants(name, email)')
      .eq('session_id', sessionId)
      .order('join_time', { ascending: true });

    // Group by participant
    const participantMap = new Map<string, {
      name: string;
      email: string | null;
      totalDuration: number;
      joinCount: number;
      segments: { join_time: string; leave_time: string | null; duration_seconds: number }[];
    }>();

    for (const r of records || []) {
      const pId = r.participant_id;
      const p = r.participants as Record<string, unknown>;
      if (!participantMap.has(pId)) {
        participantMap.set(pId, {
          name: (p?.name as string) || 'Unknown',
          email: (p?.email as string) || null,
          totalDuration: 0,
          joinCount: 0,
          segments: [],
        });
      }
      const entry = participantMap.get(pId)!;
      entry.totalDuration += r.duration_seconds || 0;
      entry.joinCount++;
      entry.segments.push({
        join_time: r.join_time,
        leave_time: r.leave_time,
        duration_seconds: r.duration_seconds,
      });
    }

    const attendees = Array.from(participantMap.entries()).map(([, v]) => ({
      ...v,
      attendanceScore: calculateAttendanceScore(
        v.totalDuration,
        session.duration_minutes || 60
      ),
    }));

    const reportData = {
      session: {
        ...session,
        program_name: (session.programs as Record<string, unknown>)?.name,
      },
      attendees,
      totalAttendees: attendees.length,
    };

    // Export if format specified
    if (format === 'csv' || format === 'excel') {
      const headers = [
        'Tên', 'Email', 'Thời gian tham gia (phút)', 'Số lần tham gia',
        'Điểm chuyên cần (%)',
      ];
      const rows = attendees.map((a) => ({
        'Tên': a.name,
        'Email': a.email || '',
        'Thời gian tham gia (phút)': Math.round(a.totalDuration / 60),
        'Số lần tham gia': a.joinCount,
        'Điểm chuyên cần (%)': a.attendanceScore,
      }));

      if (format === 'csv') {
        const csv = toCSV(headers, rows);
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="bao-cao-${sessionId}.csv"`,
          },
        });
      }

      if (format === 'excel') {
        const buffer = toExcel(headers, rows, 'Báo cáo chuyên cần');
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="bao-cao-${sessionId}.xlsx"`,
          },
        });
      }
    }

    return NextResponse.json({ data: reportData });
  }

  if (type === 'program' && programId) {
    const { data: program } = await supabase
      .from('programs')
      .select('*')
      .eq('id', programId)
      .single();

    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    const { data: sessions } = await supabase
      .from('sessions')
      .select('*')
      .eq('program_id', programId)
      .order('scheduled_start', { ascending: true });

    const sessionReports = [];
    for (const s of sessions || []) {
      const { data: records } = await supabase
        .from('attendance_records')
        .select('participant_id, duration_seconds')
        .eq('session_id', s.id);

      const uniqueParticipants = new Set(
        (records || []).map((r: { participant_id: string }) => r.participant_id)
      );
      const totalDuration = (records || []).reduce(
        (sum: number, r: { duration_seconds: number }) => sum + (r.duration_seconds || 0),
        0
      );

      sessionReports.push({
        ...s,
        participantCount: uniqueParticipants.size,
        totalAttendanceDuration: totalDuration,
      });
    }

    return NextResponse.json({
      data: { program, sessions: sessionReports },
    });
  }

  return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
}

