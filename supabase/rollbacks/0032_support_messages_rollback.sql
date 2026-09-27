-- Rollback for 0032_support_messages.sql
-- Drops the support_messages table (and its index). Destructive: any stored
-- contact-form submissions are lost. Run only if you need to undo 0032.

drop index if exists public.support_messages_created_idx;
drop table if exists public.support_messages;
