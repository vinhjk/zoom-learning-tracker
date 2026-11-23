import type { ZoomParticipant } from './oauth';

/**
 * Attendance calculation logic.
 * Handles multiple joins/leaves, deduplication, and duration calculation.
 */

export interface AttendanceSegment {
  join_time: string;
  leave_time: string;
  duration_seconds: number;
}

export interface ParticipantAttendance {
  participant_name: string;
  participant_email: string | null;
  zoom_user_id: string | null;
  segments: AttendanceSegment[];
  total_duration_seconds: number;
  join_count: number;
  first_join: string;
  last_leave: string;
}

/**
 * Calculate attendance from Zoom participant records.
 * Groups by participant identity (email or name fallback).
 * Handles multiple join/leave segments.
 */
export function calculateAttendance(
  participants: ZoomParticipant[]
): ParticipantAttendance[] {
  // Group by identity (email preferred, fallback to name)
  const grouped = new Map<string, ZoomParticipant[]>();

  for (const p of participants) {
    const key = p.user_email?.trim().toLowerCase() || p.name.trim().toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(p);
  }

  const results: ParticipantAttendance[] = [];

  for (const [, records] of grouped) {
    // Sort by join time
    const sorted = records.sort(
      (a, b) => new Date(a.join_time).getTime() - new Date(b.join_time).getTime()
    );

    const segments: AttendanceSegment[] = [];
    let totalDuration = 0;

    for (const record of sorted) {
      const joinTime = new Date(record.join_time);
      const leaveTime = record.leave_time
        ? new Date(record.leave_time)
        : joinTime; // Handle missing leave time

      const durationSeconds = Math.max(
        0,
        Math.floor((leaveTime.getTime() - joinTime.getTime()) / 1000)
      );

      // Deduplicate: skip if this segment overlaps with the previous one entirely
      if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        const lastLeave = new Date(lastSegment.leave_time);
        if (joinTime < lastLeave) {
          // Overlapping segment — extend if this one goes further
          if (leaveTime > lastLeave) {
            const extension = Math.floor(
              (leaveTime.getTime() - lastLeave.getTime()) / 1000
            );
            lastSegment.leave_time = record.leave_time || record.join_time;
            lastSegment.duration_seconds += extension;
            totalDuration += extension;
          }
          continue;
        }
      }

      segments.push({
        join_time: record.join_time,
        leave_time: record.leave_time || record.join_time,
        duration_seconds: durationSeconds,
      });
      totalDuration += durationSeconds;
    }

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    results.push({
      participant_name: first.name,
      participant_email: first.user_email || null,
      zoom_user_id: first.user_id || null,
      segments,
      total_duration_seconds: totalDuration,
      join_count: segments.length,
      first_join: first.join_time,
      last_leave: last.leave_time || last.join_time,
    });
  }

  return results;
}

/**
 * Calculate attendance score (0-100) based on duration vs session length.
 * Score reflects attendance only — NOT learning outcomes or purchase intent.
 */
export function calculateAttendanceScore(
  totalDurationSeconds: number,
  sessionDurationMinutes: number
): number {
  if (sessionDurationMinutes <= 0) return 0;
  const sessionDurationSeconds = sessionDurationMinutes * 60;
  const score = (totalDurationSeconds / sessionDurationSeconds) * 100;
  return Math.min(100, Math.round(score * 100) / 100);
}

