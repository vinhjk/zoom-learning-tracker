-- Migration 006: Add user_profiles table for Firebase UID identity mapping
-- Strictly additive. Does NOT modify or drop any existing tables.
-- DO NOT EXECUTE ON HOSTED DATABASE WITHOUT EXPLICIT PO APPROVAL.

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    firebase_uid TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'USER',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_firebase_uid ON user_profiles(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Enable RLS (Service role bypasses RLS; authorization enforced at Next.js API layer)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

