-- ==============================================================================
-- ZLT — PHASE 1.2: WEBHOOK DATABASE READINESS PREFLIGHT CHECK
-- ==============================================================================
-- PURPOSE:
--   Read-only verification script to inspect Hosted Supabase PostgreSQL schema,
--   existing constraints, data integrity, and duplicate status for webhook events.
--
-- INSTRUCTIONS FOR PRODUCT OWNER / DBA:
--   1. Open Supabase Dashboard -> SQL Editor.
--   2. Copy and paste the contents of this entire script.
--   3. Click "Run" (F5) to execute.
--   4. Review the returned result sets (7 diagnostic sections).
--
-- SAFETY GUARANTEE:
--   - This script contains ONLY SELECT queries.
--   - ABSOLUTELY NO DDL (CREATE / ALTER / DROP) or DML (INSERT / UPDATE / DELETE).
--   - Zero risk of table locking, modification, or data loss.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- CHECK 1: Verify existence of required tables
-- Expected: Table names 'webhook_events', 'participants', 'sessions', 'attendance_records'
-- ------------------------------------------------------------------------------
SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('webhook_events', 'participants', 'sessions', 'attendance_records')
ORDER BY table_name;

-- ------------------------------------------------------------------------------
-- CHECK 2: Inspect column definitions and data types for 'webhook_events'
-- Expected columns:
--   id (uuid), event_type (text), event_id (text), meeting_id (text),
--   payload (json/jsonb), processed (boolean), processed_at (timestamp),
--   error_message (text), created_at (timestamp)
-- ------------------------------------------------------------------------------
SELECT 
    ordinal_position,
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'webhook_events'
ORDER BY ordinal_position;

-- ------------------------------------------------------------------------------
-- CHECK 3: Inspect existing constraints and indexes on 'webhook_events'
-- Purpose: Verify if unique constraint or unique index on (event_id, event_type) already exists
-- ------------------------------------------------------------------------------
SELECT 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name 
 AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public' 
  AND tc.table_name = 'webhook_events'
ORDER BY tc.constraint_name, kcu.ordinal_position;

-- Also inspect explicit indexes (including partial or expression indexes)
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'webhook_events';

-- ------------------------------------------------------------------------------
-- CHECK 4: Check for existing duplicate records by (event_id, event_type)
-- Purpose: If duplicates already exist, adding a UNIQUE constraint will FAIL
-- Expected: 0 rows returned
-- ------------------------------------------------------------------------------
SELECT 
    event_id, 
    event_type, 
    COUNT(*) AS occurrence_count,
    MIN(created_at) AS first_seen,
    MAX(created_at) AS last_seen
FROM public.webhook_events
GROUP BY event_id, event_type
HAVING COUNT(*) > 1;

-- ------------------------------------------------------------------------------
-- CHECK 5: Check for NULL values in critical identity columns
-- Purpose: UNIQUE constraint behavior with NULLs can allow unintended duplicate rows
-- Expected: null_event_ids = 0, null_event_types = 0
-- ------------------------------------------------------------------------------
SELECT 
    COUNT(*) AS total_rows,
    COUNT(*) FILTER (WHERE event_id IS NULL) AS null_event_ids,
    COUNT(*) FILTER (WHERE event_type IS NULL) AS null_event_types,
    COUNT(*) FILTER (WHERE meeting_id IS NULL) AS null_meeting_ids,
    COUNT(*) FILTER (WHERE payload IS NULL) AS null_payloads
FROM public.webhook_events;

-- ------------------------------------------------------------------------------
-- CHECK 6: Summary of webhook events processing state
-- Purpose: Assess current backlog, success rate, and error frequency
-- ------------------------------------------------------------------------------
SELECT 
    COALESCE(event_type, 'TOTAL') AS event_type,
    processed,
    COUNT(*) AS count,
    MIN(created_at) AS earliest_event,
    MAX(created_at) AS latest_event
FROM public.webhook_events
GROUP BY ROLLUP(event_type, processed)
ORDER BY event_type, processed;

-- ------------------------------------------------------------------------------
-- CHECK 7: Verify schema compatibility of downstream tables used by Webhook Processor
-- Purpose: Check columns of participants, sessions, attendance_records
-- ------------------------------------------------------------------------------
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('participants', 'sessions', 'attendance_records')
  AND column_name IN (
    -- participants
    'id', 'name', 'email', 'zoom_user_id',
    -- sessions
    'zoom_meeting_id',
    -- attendance_records
    'session_id', 'participant_id', 'join_time', 'leave_time', 'duration_seconds', 'zoom_join_time', 'zoom_leave_time'
  )
ORDER BY table_name, column_name;

