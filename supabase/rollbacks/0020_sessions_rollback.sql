-- Rollback for 0020_sessions.sql — removes the real-time sessions table.
drop index if exists public.sessions_last_seen_idx;
drop table if exists public.sessions;
