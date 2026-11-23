// ============================================================
// ZLT Core Types
// ============================================================

export interface Program {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  program_id: string;
  title: string;
  zoom_meeting_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  duration_minutes: number | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  // Joined fields
  program_name?: string;
}

export interface Participant {
  id: string;
  email: string | null;
  name: string;
  zoom_user_id: string | null;
  phone: string | null;
  organization: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  participant_id: string;
  join_time: string;
  leave_time: string | null;
  duration_seconds: number;
  zoom_join_time: string | null;
  zoom_leave_time: string | null;
  created_at: string;
  // Joined fields
  participant_name?: string;
  participant_email?: string | null;
  session_title?: string;
}

export interface WebhookEvent {
  id: string;
  event_type: string;
  event_id: string;
  meeting_id: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface DashboardStats {
  totalPrograms: number;
  totalSessions: number;
  totalParticipants: number;
  avgAttendanceRate: number;
  recentSessions: Session[];
}

export interface AttendanceReport {
  session: Session;
  attendees: {
    participant: Participant;
    totalDuration: number;
    joinCount: number;
    attendanceScore: number;
    segments: {
      join_time: string;
      leave_time: string;
      duration_seconds: number;
    }[];
  }[];
}

// API Response types
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

